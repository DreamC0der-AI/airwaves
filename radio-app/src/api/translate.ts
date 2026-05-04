import { API } from "./config";

export async function translateAudio(
  audioBase64: string,
  targetLang: string,
  meta?: { station?: string; channelId?: string }
): Promise<string> {
  const resp = await fetch(`${API}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio: audioBase64,
      targetLang,
      station: meta?.station,
      channelId: meta?.channelId,
    }),
  });
  if (!resp.ok) {
    let message = `HTTP ${resp.status}`;
    try {
      const data = await resp.json();
      if (data.error) message = data.error;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data.text;
}
