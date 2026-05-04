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

function readFromStorage(): Favorite[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as CacheShape;
    if (parsed.v !== SCHEMA_VERSION) return EMPTY;
    return Array.isArray(parsed.items) ? parsed.items : EMPTY;
  } catch {
    return EMPTY;
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

// Stable empty reference for useSyncExternalStore.
const EMPTY: Favorite[] = [];

// Cached snapshot. useSyncExternalStore requires getSnapshot to return the same
// reference until the data actually changes.
let snapshot: Favorite[] = readFromStorage();

function refreshSnapshot(next: Favorite[]): void {
  snapshot = next.length === 0 ? EMPTY : next;
}

const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}

export function loadFavorites(): Favorite[] {
  return snapshot;
}

export function isFavorite(id: string): boolean {
  return snapshot.some((f) => f.id === id);
}

export function toggleFavorite(id: string, name: string): Favorite[] {
  const current = snapshot;
  const without = current.filter((f) => f.id !== id);
  let next: Favorite[];
  if (without.length === current.length) {
    next = [{ id, name, addedAt: Date.now() }, ...without];
    if (next.length > MAX_FAVORITES) next = next.slice(0, MAX_FAVORITES);
  } else {
    next = without;
  }
  write(next);
  refreshSnapshot(next);
  notify();
  return snapshot;
}

export function removeFavorite(id: string): Favorite[] {
  const next = snapshot.filter((f) => f.id !== id);
  write(next);
  refreshSnapshot(next);
  notify();
  return snapshot;
}

// For tests: re-read from storage after the test mutates localStorage directly.
export function _resyncFromStorage(): void {
  refreshSnapshot(readFromStorage());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
