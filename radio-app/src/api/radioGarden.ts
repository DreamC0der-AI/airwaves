import { API } from "./config";

async function assertOk(resp: Response): Promise<void> {
  if (!resp.ok) {
    let message = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body.error) message = body.error;
      else if (body.message) message = body.message;
    } catch {
      /* ignore json parse failure */
    }
    throw new Error(message);
  }
}

export async function searchStations(
  query: string,
  signal?: AbortSignal
) {
  const resp = await fetch(`${API}/search?q=${encodeURIComponent(query)}`, {
    signal,
  });
  await assertOk(resp);
  return resp.json();
}

export async function getPlace(id: string, signal?: AbortSignal) {
  const resp = await fetch(`${API}/place/${id}`, { signal });
  await assertOk(resp);
  return resp.json();
}

export async function getChannel(id: string, signal?: AbortSignal) {
  const resp = await fetch(`${API}/channel/${id}`, { signal });
  await assertOk(resp);
  return resp.json();
}

export function getStreamUrl(channelId: string) {
  return `${API}/listen/${channelId}`;
}
