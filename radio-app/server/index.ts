import express, { Request, Response, NextFunction } from "express";
import Groq from "groq-sdk";
import { config } from "dotenv";
import { appendFile, mkdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = join(__dirname, "..", "dist");

const app = express();
const PORT = process.env.PORT || 3001;

// --- Translation Logging ---
const LOG_DIR = join(process.cwd(), "translations");

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
}

// Track session start times so one continuous session = one file
const sessionStartTimes = new Map<string, string>();

function getSessionKey(station: string, channelId: string, targetLang: string): string {
  return `${station}::${channelId}::${targetLang}`;
}

function getSessionFile(station: string, channelId: string, targetLang: string): string {
  const key = getSessionKey(station, channelId, targetLang);
  let startTime = sessionStartTimes.get(key);
  if (!startTime) {
    startTime = new Date().toISOString().replace(/[:.]/g, "-");
    sessionStartTimes.set(key, startTime);
  }
  const s = sanitizeFileName(station || "Unknown");
  const c = sanitizeFileName(channelId || "no-id");
  const l = sanitizeFileName(targetLang || "English");
  return `${s}_${c}_${l}_${startTime}.txt`;
}

async function logTranslation(entry: {
  station: string;
  channelId: string;
  targetLang: string;
  original: string;
  translated: string;
  isoTimestamp: string;
}): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true });
  const filename = getSessionFile(entry.station, entry.channelId, entry.targetLang);
  const logFile = join(LOG_DIR, filename);
  const line = `[${entry.isoTimestamp}] ${entry.translated}\n`;
  await appendFile(logFile, line);
}

// --- Music Detection ---
// Analyzes WAV audio buffer to detect instrumental music vs speech.
// Speech has bursty energy (syllables + pauses), music has sustained consistent energy.
function isLikelyMusic(audioBuffer: Buffer): boolean {
  if (audioBuffer.length < 100) return false;

  // Parse 16-bit PCM from WAV (skip 44-byte header)
  const headerSize = 44;
  const numSamples = Math.floor((audioBuffer.length - headerSize) / 2);
  if (numSamples < 4000) return false; // too short to analyze

  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = audioBuffer.readInt16LE(headerSize + i * 2) / 32768;
  }

  // Split into 50ms frames, compute energy per frame
  const sampleRate = 44100;
  const frameSize = Math.floor(sampleRate * 0.05); // ~2205 samples
  const numFrames = Math.floor(numSamples / frameSize);
  if (numFrames < 4) return false;

  const energies: number[] = [];
  for (let f = 0; f < numFrames; f++) {
    let e = 0;
    const start = f * frameSize;
    for (let j = 0; j < frameSize; j++) {
      e += samples[start + j] * samples[start + j];
    }
    energies.push(e / frameSize);
  }

  const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
  if (mean < 1e-6) return false; // near silence

  // Coefficient of variation: speech has HIGH CV (bursty), music has LOW CV (sustained)
  const variance = energies.reduce((a, b) => a + (b - mean) ** 2, 0) / energies.length;
  const cv = Math.sqrt(variance) / mean;

  // Also check zero-crossing rate consistency (music = more uniform ZCR)
  const zcrs: number[] = [];
  for (let f = 0; f < numFrames; f++) {
    let crossings = 0;
    const start = f * frameSize;
    for (let j = 1; j < frameSize; j++) {
      if ((samples[start + j - 1] >= 0) !== (samples[start + j] >= 0)) crossings++;
    }
    zcrs.push(crossings / frameSize);
  }
  const meanZcr = zcrs.reduce((a, b) => a + b, 0) / zcrs.length;
  const zcrVar = zcrs.reduce((a, b) => a + (b - meanZcr) ** 2, 0) / zcrs.length;
  const zcrCv = Math.sqrt(zcrVar) / (meanZcr + 1e-10);

  // Low energy CV + low ZCR variation = likely music
  // Music: CV < 0.4 (consistent energy), ZCR CV < 0.3 (consistent frequency content)
  const isMusic = cv < 0.4 && zcrCv < 0.35;

  if (isMusic) {
    console.log(`[Music Detection] CV=${cv.toFixed(3)} ZCR_CV=${zcrCv.toFixed(3)} -> music detected, skipping`);
  }

  return isMusic;
}

// Filter Whisper output that looks like music transcription
function isMusicLikeText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // Whisper marks music with these symbols
  if (/[♪♫🎵🎶♩♬]/.test(t)) return true;
  if (/\(music\)/i.test(t)) return true;
  if (/\(instrumental\)/i.test(t)) return true;

  // Very short repeated text (Whisper hallucinates for music)
  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.length <= 3) {
    const unique = new Set(words);
    if (unique.size === 1) return true; // same word repeated = music hallucination
  }

  return false;
}

// --- Groq client ---
const GROQ_API_KEY = process.env.GROQ_API_KEY;
let groq: Groq | null = null;
if (GROQ_API_KEY) {
  groq = new Groq({ apiKey: GROQ_API_KEY });
}

// Lookup geo coordinates for a place ID from the places list
const placesGeoCache = new Map<string, { lat: number; lng: number }>();
let placesGeoLoaded = false;

async function getPlaceGeo(placeId: string): Promise<{ lat: number; lng: number } | null> {
  if (placesGeoCache.has(placeId)) return placesGeoCache.get(placeId)!;

  // Load all places if not yet loaded (one-time bulk load)
  if (!placesGeoLoaded) {
    try {
      const resp = await fetch(`${RADIO_GARDEN_API}/ara/content/places`);
      if (resp.ok) {
        const data = await resp.json();
        const list = data?.data?.list ?? data?.data ?? [];
        for (const place of list) {
          if (place.id && place.geo) {
            placesGeoCache.set(place.id, { lng: place.geo[0], lat: place.geo[1] });
          }
        }
      }
    } catch { /* ignore */ }
    placesGeoLoaded = true;
  }

  return placesGeoCache.get(placeId) ?? null;
}

async function fetchWikiSummary(query: string): Promise<{ title: string; extract: string; url: string | null } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const summaryForTitle = async (title: string) => {
    const resp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { "User-Agent": "RadioWorld/1.0" },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data?.extract || data?.type === "disambiguation") return null;
    return {
      title: data.title ?? title,
      extract: data.extract as string,
      url: data?.content_urls?.desktop?.page ?? null,
    };
  };

  try {
    const exact = await summaryForTitle(trimmed);
    if (exact) return exact;

    const searchResp = await fetch(`https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(trimmed)}&limit=1`, {
      headers: { "User-Agent": "RadioWorld/1.0" },
    });
    if (!searchResp.ok) return null;
    const searchData = await searchResp.json();
    const bestTitle = searchData?.pages?.[0]?.title;
    if (!bestTitle) return null;
    return await summaryForTitle(bestTitle);
  } catch {
    return null;
  }
}

// --- Middleware ---
app.use(express.json({ limit: "10mb" }));

// --- API Routes ---

const RADIO_GARDEN_API = "https://radio.garden/api";

function validateId(id: string | undefined): string | null {
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return id;
}

// Rate limiter: max 5 concurrent streams per IP
const listenStreams = new Map<string, number>();
function rateLimitListen(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const current = listenStreams.get(ip) ?? 0;
  if (current >= 5) {
    res.status(429).json({ error: "Too many concurrent streams" });
    return;
  }
  listenStreams.set(ip, current + 1);
  res.on("close", () => {
    const count = listenStreams.get(ip) ?? 0;
    listenStreams.set(ip, Math.max(0, count - 1));
    // Clean up stale IPs that dropped to 0 to prevent unbounded growth
    if (listenStreams.get(ip) === 0) {
      listenStreams.delete(ip);
    }
  });
  next();
}

app.get("/api/search", async (req, res) => {
  const q = req.query.q as string;
  if (!q) return res.json({ data: [] });
  try {
    const resp = await fetch(`${RADIO_GARDEN_API}/search?q=${encodeURIComponent(q)}`);
    if (!resp.ok) return res.status(502).json({ error: "Upstream search failed" });
    res.json(await resp.json());
  } catch {
    res.status(500).json({ error: "Search failed" });
  }
});

app.get("/api/places", async (_req, res) => {
  try {
    const resp = await fetch(`${RADIO_GARDEN_API}/ara/content/places`);
    if (!resp.ok) return res.status(502).json({ error: "Upstream places request failed" });
    res.json(await resp.json());
  } catch {
    res.status(500).json({ error: "Failed to fetch places" });
  }
});

app.get("/api/place/:id", async (req, res) => {
  const id = validateId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid place ID" });
  try {
    const resp = await fetch(`${RADIO_GARDEN_API}/ara/content/page/${id}`);
    if (!resp.ok) return res.status(502).json({ error: "Upstream place request failed" });
    res.json(await resp.json());
  } catch {
    res.status(500).json({ error: "Failed to fetch place" });
  }
});

app.get("/api/channel/:id", async (req, res) => {
  const id = validateId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid channel ID" });
  try {
    const resp = await fetch(`${RADIO_GARDEN_API}/ara/content/channel/${id}`);
    if (!resp.ok) return res.status(502).json({ error: "Upstream channel request failed" });
    res.json(await resp.json());
  } catch {
    res.status(500).json({ error: "Failed to fetch channel" });
  }
});

app.get("/api/listen/:id", rateLimitListen, async (req, res) => {
  const id = validateId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid stream ID" });
  try {
    const streamUrl = `${RADIO_GARDEN_API}/ara/content/listen/${id}/channel.mp3`;
    const resp = await fetch(streamUrl, { redirect: "follow" });
    if (!resp.ok || !resp.body) return res.status(502).json({ error: "Stream unavailable" });

    res.set({
      "Content-Type": resp.headers.get("content-type") || "audio/mpeg",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    });

    let clientClosed = false;
    const reader = resp.body.getReader();

    req.on("close", () => {
      clientClosed = true;
      reader.cancel().catch(() => {});
    });

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (clientClosed || res.writableEnded) break;
          const wrote = res.write(value);
          if (!wrote) {
            await new Promise<void>((resolve) => res.once("drain", resolve));
          }
        }
        if (!res.writableEnded) res.end();
      } catch (err) {
        if (!res.writableEnded) res.end();
      }
    };
    pump();
  } catch {
    res.status(500).json({ error: "Stream failed" });
  }
});

// Translate audio using Groq Whisper API + LLM
// Auto-saves every translation to translations/YYYY-MM-DD.jsonl
app.post("/api/translate", async (req, res) => {
  const { audio, targetLang, station, channelId } = req.body;
  if (!audio) return res.status(400).json({ error: "Missing audio data" });
  if (!groq) return res.status(500).json({ error: "GROQ_API_KEY not set in .env" });

  const isoTimestamp = new Date().toISOString();

  try {
    const buffer = Buffer.from(audio, "base64");

    // Pre-check: skip if audio looks like instrumental music
    if (isLikelyMusic(buffer)) {
      return res.json({ text: "", skipped: true, reason: "music" });
    }

    const file = new File([buffer], "audio.wav", { type: "audio/wav" });

    if (!targetLang || targetLang === "English") {
      const translation = await groq.audio.translations.create({
        file,
        model: "whisper-large-v3",
        response_format: "json",
      });
      const original = translation.text?.trim() ?? "";

      // Post-filter: skip if Whisper output looks like music transcription
      if (!original || isMusicLikeText(original)) {
        return res.json({ text: "", skipped: true, reason: "music_text" });
      }

      logTranslation({
        station: station || "Unknown",
        channelId: channelId || "",
        targetLang: targetLang || "English",
        original,
        translated: original,
        isoTimestamp,
      }).catch((e) => console.error("Log failed:", e));
      return res.json({ text: original });
    }

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
      response_format: "json",
    });

    const originalText = transcription.text?.trim() ?? "";

    // Post-filter: skip if transcription looks like music
    if (!originalText || isMusicLikeText(originalText)) {
      return res.json({ text: "", skipped: true, reason: "music_text" });
    }

    const chatResponse = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a translator. Translate the following text into ${targetLang}. Output ONLY the translation, nothing else. No explanations, no quotes, no prefixes.`,
        },
        { role: "user", content: originalText },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });

    const translated = chatResponse.choices[0]?.message?.content?.trim() ?? "";
    logTranslation({
      station: station || "Unknown",
      channelId: channelId || "",
      targetLang: targetLang || "English",
      original: transcription.text.trim(),
      translated,
      isoTimestamp,
    }).catch((e) => console.error("Log failed:", e));
    res.json({ text: translated });
  } catch {
    res.status(500).json({ error: "Translation service error" });
  }
});

// List available translation log files
app.get("/api/translations", async (_req, res) => {
  try {
    const { readdir } = await import("fs/promises");
    const files = await readdir(LOG_DIR).catch(() => [] as string[]);
    const txtFiles = files.filter((f) => f.endsWith(".txt")).sort().reverse();
    res.json({ count: txtFiles.length, files: txtFiles });
  } catch {
    res.status(500).json({ error: "Failed to list translations" });
  }
});

// Read a specific translation log file
app.get("/api/translations/:filename", async (req, res) => {
  const { filename } = req.params;
  if (!/^[\w.-]+\.txt$/.test(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  try {
    const logFile = join(LOG_DIR, filename);
    const content = await readFile(logFile, "utf-8");
    res.type("text/plain").send(content);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

// Get geo coordinates for a place
app.get("/api/geo/:placeId", async (req, res) => {
  const placeId = req.params.placeId;
  if (!validateId(placeId)) return res.status(400).json({ error: "Invalid place ID" });
  const geo = await getPlaceGeo(placeId);
  if (!geo) return res.status(404).json({ error: "Place not found" });
  res.json(geo);
});

// Fetch Wikipedia summaries for the current station and its place
app.get("/api/wiki/:channelId", async (req, res) => {
  const channelId = validateId(req.params.channelId);
  if (!channelId) return res.status(400).json({ error: "Invalid channel ID" });

  try {
    const channelResp = await fetch(`${RADIO_GARDEN_API}/ara/content/channel/${channelId}`);
    if (!channelResp.ok) return res.status(502).json({ error: "Failed to fetch channel" });
    const channelData = await channelResp.json();

    const stationName = channelData?.data?.title ?? "";
    const placeName = channelData?.data?.place?.title ?? "";

    const [stationWiki, placeWiki] = await Promise.all([
      stationName ? fetchWikiSummary(stationName) : Promise.resolve(null),
      placeName ? fetchWikiSummary(placeName) : Promise.resolve(null),
    ]);

    res.json({
      stationName,
      placeName,
      stationWiki,
      placeWiki,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch wiki" });
  }
});

// Health check endpoint (before static to avoid SPA catch-all)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// --- Serve frontend (static + SPA fallback) ---
app.use(express.static(STATIC_DIR));
// SPA fallback: any non-API GET request gets index.html
app.get("/{*splat}", (req, res) => {
  res.sendFile(join(STATIC_DIR, "index.html"));
});

// Graceful shutdown
const server = app.listen(PORT, () => {
  console.log(`Radio World running on http://localhost:${PORT}`);
});

const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    console.log("HTTP server closed. Clearing rate limiter...");
    listenStreams.clear();
    console.log("Shutdown complete.");
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => process.exit(0), 10_000);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
