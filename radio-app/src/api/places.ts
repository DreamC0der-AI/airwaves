import { getPlacesIndex } from "./radioGarden";

export interface Place {
  id: string;
  title: string;
  country: string;
  size: number;
  lat: number;
  lng: number;
}

export const CACHE_KEY = "radio_places_v1";
const SCHEMA_VERSION = 1;

interface CacheShape {
  v: number;
  places: Place[];
  etag: string | null;
}

export function normaliseRawPlaces(raw: unknown): Place[] {
  const list: unknown =
    (raw as { data?: { list?: unknown[] } })?.data?.list ??
    (raw as { data?: unknown[] })?.data ??
    [];
  if (!Array.isArray(list)) return [];
  const out: Place[] = [];
  for (const entry of list) {
    const e = entry as { id?: unknown; title?: unknown; country?: unknown; size?: unknown; geo?: unknown };
    const id = typeof e.id === "string" ? e.id : null;
    const title = typeof e.title === "string" ? e.title : null;
    const country = typeof e.country === "string" ? e.country : "";
    const size = typeof e.size === "number" ? e.size : 0;
    const geo = Array.isArray(e.geo) && e.geo.length === 2 ? e.geo : null;
    if (!id || !title || !geo) continue;
    const lng = typeof geo[0] === "number" ? geo[0] : NaN;
    const lat = typeof geo[1] === "number" ? geo[1] : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ id, title, country, size, lat, lng });
  }
  return out;
}

export function hydrateFromCache(): { places: Place[]; etag: string | null } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (parsed.v !== SCHEMA_VERSION) return null;
    if (!Array.isArray(parsed.places)) return null;
    return { places: parsed.places, etag: parsed.etag ?? null };
  } catch {
    return null;
  }
}

export function persistToCache(places: Place[], etag: string | null): void {
  try {
    const payload: CacheShape = { v: SCHEMA_VERSION, places, etag };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota exceeded — ignore */
  }
}

export async function fetchPlacesFresh(): Promise<Place[]> {
  const raw = await getPlacesIndex();
  return normaliseRawPlaces(raw);
}
