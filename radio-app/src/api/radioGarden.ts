import { RG_API, RG_CONTENT } from "./config";

async function assertOk(resp: Response): Promise<void> {
  if (!resp.ok) {
    let message = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body?.error) message = body.error;
      else if (body?.message) message = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
}

export async function searchStations(query: string, signal?: AbortSignal) {
  const resp = await fetch(`${RG_API}/search?q=${encodeURIComponent(query)}`, { signal });
  await assertOk(resp);
  return resp.json();
}

export async function getPlace(id: string, signal?: AbortSignal) {
  const resp = await fetch(`${RG_CONTENT}/page/${id}`, { signal });
  await assertOk(resp);
  return resp.json();
}

export async function getChannel(id: string, signal?: AbortSignal) {
  const resp = await fetch(`${RG_CONTENT}/channel/${id}`, { signal });
  await assertOk(resp);
  return resp.json();
}

export async function getPlacesIndex(signal?: AbortSignal): Promise<unknown> {
  const resp = await fetch(`${RG_CONTENT}/places`, { signal });
  await assertOk(resp);
  return resp.json();
}

export function getStreamUrl(channelId: string): string {
  return `${RG_CONTENT}/listen/${channelId}/channel.mp3`;
}
