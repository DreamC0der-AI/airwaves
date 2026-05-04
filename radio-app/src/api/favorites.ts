export interface Favorite {
  id: string;
  name: string;
  addedAt: number;
}

export const CACHE_KEY = "airwaves_favorites_v1";
export const MAX_FAVORITES = 100;
const SCHEMA_VERSION = 1;

interface CacheShape {
  v: number;
  items: Favorite[];
}

function read(): Favorite[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CacheShape;
    if (parsed.v !== SCHEMA_VERSION) return [];
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function write(items: Favorite[]): void {
  try {
    const payload: CacheShape = { v: SCHEMA_VERSION, items };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}

export function loadFavorites(): Favorite[] {
  return read();
}

export function isFavorite(id: string): boolean {
  return read().some((f) => f.id === id);
}

export function toggleFavorite(id: string, name: string): Favorite[] {
  const current = read();
  const without = current.filter((f) => f.id !== id);
  let next: Favorite[];
  if (without.length === current.length) {
    next = [{ id, name, addedAt: Date.now() }, ...without];
    if (next.length > MAX_FAVORITES) next = next.slice(0, MAX_FAVORITES);
  } else {
    next = without;
  }
  write(next);
  notify();
  return next;
}

export function removeFavorite(id: string): Favorite[] {
  const next = read().filter((f) => f.id !== id);
  write(next);
  notify();
  return next;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
