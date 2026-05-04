import { useState, useRef, useCallback, useEffect } from "react";
import { translateAudio } from "../api/translate";

interface Props {
  audioContext: AudioContext | null;
  sourceNode: MediaElementAudioSourceNode | null;
  isPlaying: boolean;
  stationName: string;
  channelId: string | null;
  translating: boolean;
  onTranslatingChange: (v: boolean) => void;
  targetLang: string;
}

interface TranscriptLine {
  text: string;
  timestamp: string;
}

const MAX_TRANSCRIPT_ENTRIES = 200;

export default function TranslationPanel({ audioContext, sourceNode, isPlaying, stationName, channelId, translating, onTranslatingChange, targetLang }: Props) {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [panelSize, setPanelSize] = useState(() => {
    try {
      const raw = localStorage.getItem("transcript_overlay_size");
      if (!raw) return { width: 520, height: 260 };
      const parsed = JSON.parse(raw);
      return {
        width: Math.max(320, Math.min(900, parsed.width ?? 520)),
        height: Math.max(140, Math.min(700, parsed.height ?? 260)),
      };
    } catch {
      return { width: 520, height: 260 };
    }
  });
  const recorderRef = useRef<AudioWorkletNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const prevChannelRef = useRef(channelId);
  const resizeStateRef = useRef<{ startX: number; startY: number; width: number; height: number } | null>(null);
  const isSendingRef = useRef(false);

  // Auto-scroll transcript
  useEffect(() => {
    const container = transcriptEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [transcript]);

  // Clear transcript and stop translation when station changes
  useEffect(() => {
    if (prevChannelRef.current === channelId) return;
    prevChannelRef.current = channelId;
    setTranscript([]);
    setError("");
    setCopied(false);
    cleanup();
    onTranslatingChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Stop translation when audio stops
  useEffect(() => {
    if (!isPlaying && translating) {
      cleanup();
      onTranslatingChange(false);
    }
  }, [isPlaying, translating, onTranslatingChange]);

  const cleanup = () => {
    if (recorderRef.current) {
      try { recorderRef.current.disconnect(); } catch { /* ok */ }
      recorderRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    chunksRef.current = [];
  };

  const floatTo16BitPCM = (float32: Float32Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(float32.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  };

  const createWavBlob = (samples: Float32Array, sampleRate: number): Blob => {
    const pcm = floatTo16BitPCM(samples);
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, pcm.byteLength, true);

    return new Blob([header, pcm], { type: "audio/wav" });
  };

  const sendChunk = useCallback(async () => {
    if (isSendingRef.current || chunksRef.current.length === 0) return;

    isSendingRef.current = true;

    const allChunks = chunksRef.current;
    chunksRef.current = [];

    const totalLength = allChunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of allChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    let energy = 0;
    for (let i = 0; i < merged.length; i++) energy += merged[i] * merged[i];
    energy /= merged.length;
    if (energy < 0.0001) {
      isSendingRef.current = false;
      return;
    }

    const sampleRate = audioContext?.sampleRate ?? 44100;
    const wav = createWavBlob(merged, sampleRate);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        const text = await translateAudio(base64, targetLang, {
          station: stationName,
          channelId: channelId ?? undefined,
        });
        if (text.trim()) {
          const now = new Date();
          setTranscript((prev) => {
            const next = [...prev, { text, timestamp: now.toLocaleTimeString() }];
            return next.length > MAX_TRANSCRIPT_ENTRIES ? next.slice(-MAX_TRANSCRIPT_ENTRIES) : next;
          });
        }
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Translation failed");
      } finally {
        isSendingRef.current = false;
      }
    };
    reader.onerror = () => {
      isSendingRef.current = false;
    };
    reader.readAsDataURL(wav);
  }, [audioContext, targetLang, stationName, channelId]);

  // Start/stop translation when the prop changes
  useEffect(() => {
    if (translating) {
      startCapture();
    } else {
      cleanup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translating]);

  const startCapture = async () => {
    if (!audioContext || !sourceNode) {
      onTranslatingChange(false);
      return;
    }

    try {
      await audioContext.audioWorklet.addModule("/worklets/capture-processor.js");

      const workletNode = new AudioWorkletNode(audioContext, "capture-processor");
      workletNode.port.onmessage = (e: MessageEvent) => {
        if (e.data.audio) {
          chunksRef.current.push(new Float32Array(e.data.audio));
        }
      };

      sourceNode.connect(workletNode);
      recorderRef.current = workletNode;
      intervalRef.current = setInterval(sendChunk, 8000);
    } catch (err) {
      onTranslatingChange(false);
      setError(err instanceof Error ? err.message : "Failed to start audio capture");
    }
  };

  const copyTranscript = useCallback(() => {
    if (transcript.length === 0) return;
    const header = `Station: ${stationName}\nLanguage: ${targetLang}\n${"─".repeat(40)}`;
    const lines = transcript.map((line) => `[${line.timestamp}] ${line.text}`).join("\n");
    const text = `${header}\n${lines}`;
    try {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        fallbackCopyText(text);
      });
    } catch {
      fallbackCopyText(text);
    }
  }, [transcript, stationName, targetLang]);

  const fallbackCopyText = (text: string) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy transcript to clipboard.");
    }
  };

  useEffect(() => {
    localStorage.setItem("transcript_overlay_size", JSON.stringify(panelSize));
  }, [panelSize]);

  const onResizeMove = useCallback((e: MouseEvent) => {
    const state = resizeStateRef.current;
    if (!state) return;
    const width = Math.max(320, Math.min(window.innerWidth - 80, state.width + (e.clientX - state.startX)));
    const height = Math.max(140, Math.min(window.innerHeight - 140, state.height - (e.clientY - state.startY)));
    setPanelSize({ width, height });
  }, []);

  const stopResize = useCallback(() => {
    isResizingRef.current = false;
    resizeStateRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", stopResize);
  }, [onResizeMove]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    resizeStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      width: panelSize.width,
      height: panelSize.height,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", stopResize);
  }, [panelSize, onResizeMove, stopResize]);

  const isResizingRef = useRef(false);

  useEffect(() => () => {
    if (isResizingRef.current) {
      isResizingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onResizeMove);
      window.removeEventListener("mouseup", stopResize);
    }
  }, []);

  // Only render the overlay while translation is actively running.
  // When stopped, hide the window immediately.
  if (!translating) return null;

  return (
    <div
      className="transcript-overlay"
      style={{ width: `${panelSize.width}px`, height: `${panelSize.height}px` }}
    >
      <div className="transcript-header">
        <span>Live Translation &middot; {targetLang}</span>
        {transcript.length > 0 && (
          <button className="copy-btn" onClick={copyTranscript}>
            {copied ? (
              <>
                <svg viewBox="0 0 24 24" width="12" height="12">
                  <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="12" height="12">
                  <rect x="9" y="9" width="13" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
                Copy
              </>
            )}
          </button>
        )}
      </div>
      {error && <div className="translation-error">{error}</div>}
      {transcript.length === 0 && translating && (
        <p className="transcript-placeholder listening">Listening...</p>
      )}
      <div className="transcript-body">
        {transcript.map((line, i) => (
          <div key={i} className="transcript-line">
            <span className="timestamp">{line.timestamp}</span>
            <span className="text">{line.text}</span>
          </div>
        ))}
        <div ref={transcriptEndRef} />
      </div>
      <button className="transcript-resize-handle" onMouseDown={startResize} title="Drag to resize" />
    </div>
  );
}
