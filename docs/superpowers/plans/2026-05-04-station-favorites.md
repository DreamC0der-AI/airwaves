# Station Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a localStorage-backed favorites feature to the airwaves app — heart toggles on every station row and the topbar, plus a dedicated left-side panel listing all favorites.

**Architecture:** Pure storage module (`src/api/favorites.ts`) holds the data and a small pub/sub. UI components subscribe via a `useFavorites()` hook so toggles propagate across all heart icons in the tree. New `FavoriteButton` is reusable; new `FavoritesPanel` mirrors the existing wiki panel chrome but anchors left.

**Tech Stack:** React 19, TypeScript, Vitest (tests), localStorage. No new runtime deps.

---

## File Structure

### Create
- `radio-app/src/api/favorites.ts` — storage + pub/sub
- `radio-app/src/api/favorites.test.ts` — Vitest unit tests
- `radio-app/src/components/FavoriteButton.tsx` — reusable heart toggle (and exports `useFavorites()` hook)
- `radio-app/src/components/FavoritesPanel.tsx` — left-side panel listing favorites

### Modify
- `radio-app/src/components/StationList.tsx` — add `<FavoriteButton>` per row
- `radio-app/src/components/SearchBar.tsx` — add heart toggle + bookmark button to topbar; new props `favoritesOpen`, `onToggleFavorites`
- `radio-app/src/App.tsx` — `favoritesOpen` state, render `<FavoritesPanel>`
- `radio-app/src/App.css` — `.floating-favorites-panel` + heart styles

---

## Task 1: favorites.ts module + tests (TDD)

**Files:**
- Create: `radio-app/src/api/favorites.ts`
- Create: `radio-app/src/api/favorites.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `radio-app/src/api/favorites.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadFavorites,
  isFavorite,
  toggleFavorite,
  removeFavorite,
  subscribe,
  CACHE_KEY,
  MAX_FAVORITES,
} from "./favorites";

describe("favorites storage", () => {
  beforeEach(() => {
    localStorage.removeItem(CACHE_KEY);
  });

  it("loadFavorites returns [] when nothing stored", () => {
    expect(loadFavorites()).toEqual([]);
  });

  it("toggleFavorite adds when missing, returns updated list", () => {
    const list = toggleFavorite("abc", "Tokyo FM");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "abc", name: "Tokyo FM" });
    expect(typeof list[0].addedAt).toBe("number");
    expect(loadFavorites()).toEqual(list);
  });

  it("toggleFavorite removes when already present", () => {
    toggleFavorite("abc", "Tokyo FM");
    const list = toggleFavorite("abc", "Tokyo FM");
    expect(list).toEqual([]);
  });

  it("isFavorite reflects current state", () => {
    expect(isFavorite("abc")).toBe(false);
    toggleFavorite("abc", "Tokyo FM");
    expect(isFavorite("abc")).toBe(true);
    toggleFavorite("abc", "Tokyo FM");
    expect(isFavorite("abc")).toBe(false);
  });

  it("removeFavorite is idempotent", () => {
    toggleFavorite("abc", "Tokyo FM");
    removeFavorite("abc");
    removeFavorite("abc"); // second call must not throw
    expect(loadFavorites()).toEqual([]);
  });

  it("caps at MAX_FAVORITES — oldest entry is dropped", () => {
    for (let i = 0; i < MAX_FAVORITES + 5; i++) {
      toggleFavorite(`id-${i}`, `Station ${i}`);
    }
    const list = loadFavorites();
    expect(list).toHaveLength(MAX_FAVORITES);
    // Newest first ordering: the most recent additions survive.
    expect(list[0].id).toBe(`id-${MAX_FAVORITES + 4}`);
    expect(list.find((f) => f.id === "id-0")).toBeUndefined();
  });

  it("schema-version mismatch is treated as empty", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 999, items: [{ id: "x", name: "X", addedAt: 1 }] }));
    expect(loadFavorites()).toEqual([]);
  });

  it("subscribe fires on toggle and unsubscribes cleanly", () => {
    let count = 0;
    const off = subscribe(() => { count++; });
    toggleFavorite("a", "A");
    toggleFavorite("b", "B");
    expect(count).toBe(2);
    off();
    toggleFavorite("c", "C");
    expect(count).toBe(2); // listener no longer fires
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd radio-app && npm test`
Expected: FAIL — `Cannot find module './favorites'`.

- [ ] **Step 3: Implement `favorites.ts`**

Create `radio-app/src/api/favorites.ts`:

```ts
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
    /* quota / private mode — keep in-memory state in caller, just don't persist */
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
    // Was not favorited — add to front.
    next = [{ id, name, addedAt: Date.now() }, ...without];
    if (next.length > MAX_FAVORITES) next = next.slice(0, MAX_FAVORITES);
  } else {
    // Was favorited — toggle off.
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 8 favorites tests pass; existing places tests still pass (13 total).

- [ ] **Step 5: Commit**

```bash
cd /Users/jamessun/workspace/CC/radio-garden
git add radio-app/src/api/favorites.ts radio-app/src/api/favorites.test.ts
git commit -m "feat(favorites): storage module with pub/sub + tests"
```

---

## Task 2: FavoriteButton component + useFavorites hook

**Files:**
- Create: `radio-app/src/components/FavoriteButton.tsx`

- [ ] **Step 1: Implement the component + hook**

Create `radio-app/src/components/FavoriteButton.tsx`:

```tsx
import { useEffect, useState, useSyncExternalStore } from "react";
import { isFavorite, toggleFavorite, loadFavorites, subscribe } from "../api/favorites";
import type { Favorite } from "../api/favorites";

export function useFavorites(): Favorite[] {
  // useSyncExternalStore guarantees consistent reads across the tree.
  return useSyncExternalStore(
    (cb) => subscribe(cb),
    () => loadFavorites(),
    () => [],
  );
}

interface Props {
  channelId: string | null;
  channelName: string;
  size?: number;
  className?: string;
}

export default function FavoriteButton({ channelId, channelName, size = 18, className }: Props) {
  // Subscribe so the heart updates when toggled from elsewhere.
  const favs = useFavorites();
  const [pulse, setPulse] = useState(false);
  const active = !!channelId && favs.some((f) => f.id === channelId);
  const disabled = !channelId;

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 220);
    return () => clearTimeout(t);
  }, [pulse]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!channelId) return;
    toggleFavorite(channelId, channelName);
    setPulse(true);
  };

  return (
    <button
      type="button"
      className={`fav-btn ${active ? "active" : ""} ${pulse ? "pulse" : ""} ${className ?? ""}`}
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      title={active ? "Remove from favorites" : "Add to favorites"}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path
          d="M12 21s-7.5-4.6-9.5-9.1C1.1 8.6 3 5 6.5 5c2 0 3.4 1.1 4.3 2.6h.4C12.1 6.1 13.5 5 15.5 5 19 5 20.9 8.6 19.5 11.9 17.5 16.4 12 21 12 21z"
          fill={active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd radio-app && npm run build 2>&1 | tail -5`
Expected: `✓ built in …`.

- [ ] **Step 3: Commit**

```bash
git add radio-app/src/components/FavoriteButton.tsx
git commit -m "feat(favorites): FavoriteButton + useFavorites hook"
```

---

## Task 3: Heart toggle on each StationList row

**Files:**
- Modify: `radio-app/src/components/StationList.tsx`

- [ ] **Step 1: Update StationList.tsx**

Replace the entire file with:

```tsx
import { useEffect, useState, useRef } from "react";
import { getPlace } from "../api/radioGarden";
import FavoriteButton from "./FavoriteButton";

interface StationItem {
  page: {
    url: string;
    title: string;
    subtitle?: string;
    place?: { id: string; title: string };
    country?: { id: string; title: string };
  };
}

interface Props {
  placeId: string;
  placeName: string;
  onSelectStation: (channelId: string, title: string) => void;
}

function channelIdFromUrl(url: string): string {
  const parts = url.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export default function StationList({ placeId, placeName, onSelectStation }: Props) {
  const [stations, setStations] = useState<StationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    getPlace(placeId, controller.signal)
      .then((data) => {
        const content = data?.data?.content ?? [];
        const allStations: StationItem[] = [];
        for (const section of content) {
          if (section.items) {
            allStations.push(...section.items);
          }
        }
        setStations(allStations);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStations([]);
      })
      .finally(() => setLoading(false));

    return () => {
      controller.abort();
    };
  }, [placeId]);

  const handleClick = (station: StationItem) => {
    const id = channelIdFromUrl(station.page.url);
    onSelectStation(id, station.page.title);
  };

  if (loading) {
    return <div className="station-list-loading">Loading stations...</div>;
  }

  return (
    <div className="station-list">
      <h3>{placeName}</h3>
      <p className="station-count">{stations.length} stations</p>
      <ul>
        {stations.map((station) => {
          const id = channelIdFromUrl(station.page.url);
          return (
            <li key={station.page.url} onClick={() => handleClick(station)}>
              <FavoriteButton
                channelId={id}
                channelName={station.page.title}
                className="row-fav"
              />
              <div className="station-info">
                <span className="station-name">{station.page.title}</span>
                {station.page.country && (
                  <span className="station-subtitle">{station.page.country.title}</span>
                )}
              </div>
              <svg className="play-icon" viewBox="0 0 24 24" width="20" height="20">
                <polygon points="6,3 20,12 6,21" fill="currentColor" />
              </svg>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify build still green**

Run: `npm run build 2>&1 | tail -5`
Expected: `✓ built in …`.

- [ ] **Step 3: Commit**

```bash
git add radio-app/src/components/StationList.tsx
git commit -m "feat(favorites): heart toggle on each StationList row"
```

---

## Task 4: Topbar heart + bookmark buttons in SearchBar

**Files:**
- Modify: `radio-app/src/components/SearchBar.tsx`

- [ ] **Step 1: Update Props interface**

In `radio-app/src/components/SearchBar.tsx`, replace the `Props` interface and the function signature destructure with:

```tsx
interface Props {
  onSelectPlace: (placeId: string, title: string) => void;
  onSelectChannel: (channelId: string, title: string) => void;
  currentChannelId: string | null;
  currentChannelName: string;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onWikiClick: () => void;
  wikiOpen: boolean;
  favoritesOpen: boolean;
  onToggleFavorites: () => void;
}

export default function SearchBar({
  onSelectPlace,
  onSelectChannel,
  currentChannelId,
  currentChannelName,
  isPlaying,
  onTogglePlay,
  onWikiClick,
  wikiOpen,
  favoritesOpen,
  onToggleFavorites,
}: Props) {
```

- [ ] **Step 2: Add the new buttons in the topbar JSX**

In the same file, find the `<button className="ctrl-btn play" …>` block and the `<button className={\`wiki-btn …\`} …>` block. Insert the new heart and bookmark buttons **between them**, after the play button and before the wiki button:

```tsx
import FavoriteButton from "./FavoriteButton";
```

(Add the import near the top, with the other component imports.)

In the JSX, the row of buttons should read:

```tsx
<button className="ctrl-btn play" onClick={onTogglePlay} title={isPlaying ? "Pause" : "Play"}>
  {isPlaying ? (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <rect x="5" y="3" width="5" height="18" rx="1" fill="currentColor" />
      <rect x="14" y="3" width="5" height="18" rx="1" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <polygon points="6,3 20,12 6,21" fill="currentColor" />
    </svg>
  )}
</button>
<FavoriteButton
  channelId={currentChannelId}
  channelName={currentChannelName}
  className="topbar-fav"
/>
<button
  className={`ctrl-btn fav-list ${favoritesOpen ? "active" : ""}`}
  onClick={onToggleFavorites}
  title="Favorites"
  aria-pressed={favoritesOpen}
>
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M9.5 10.5l1.6 1.6 3.4-3.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
</button>
<button className={`wiki-btn ${wikiOpen ? "active" : ""}`} onClick={onWikiClick} title="Wiki">
  …existing wiki SVG…
</button>
```

- [ ] **Step 3: Verify build green**

Run: `npm run build 2>&1 | tail -5`
Expected: `✓ built in …`.

- [ ] **Step 4: Commit**

```bash
git add radio-app/src/components/SearchBar.tsx
git commit -m "feat(favorites): topbar heart + bookmark buttons"
```

---

## Task 5: FavoritesPanel component

**Files:**
- Create: `radio-app/src/components/FavoritesPanel.tsx`

- [ ] **Step 1: Implement the panel**

Create `radio-app/src/components/FavoritesPanel.tsx`:

```tsx
import { useFavorites } from "./FavoriteButton";
import { removeFavorite } from "../api/favorites";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectStation: (channelId: string, title: string) => void;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function FavoritesPanel({ open, onClose, onSelectStation }: Props) {
  const favs = useFavorites();
  if (!open) return null;

  const handleRowClick = (id: string, name: string) => {
    onSelectStation(id, name);
    onClose();
  };

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeFavorite(id);
  };

  return (
    <div className="floating-favorites-panel">
      <div className="favorites-card">
        <div className="favorites-header">
          <strong>Favorites</strong>
          <button className="favorites-close" onClick={onClose} aria-label="Close favorites">×</button>
        </div>

        {favs.length === 0 ? (
          <div className="favorites-empty">No favorites yet. Tap ♡ next to a station to add one.</div>
        ) : (
          <ul className="favorites-list">
            {favs.map((f) => (
              <li
                key={f.id}
                className="fav-row"
                tabIndex={0}
                onClick={() => handleRowClick(f.id, f.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRowClick(f.id, f.name);
                }}
              >
                <svg className="fav-row-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path
                    d="M12 21s-7.5-4.6-9.5-9.1C1.1 8.6 3 5 6.5 5c2 0 3.4 1.1 4.3 2.6h.4C12.1 6.1 13.5 5 15.5 5 19 5 20.9 8.6 19.5 11.9 17.5 16.4 12 21 12 21z"
                    fill="currentColor"
                  />
                </svg>
                <div className="fav-row-info">
                  <strong>{f.name}</strong>
                  <span className="fav-row-time">{formatRelative(f.addedAt)}</span>
                </div>
                <button
                  className="fav-row-remove"
                  onClick={(e) => handleRemove(e, f.id)}
                  aria-label={`Remove ${f.name} from favorites`}
                  title="Remove"
                >
                  ×
                </button>
                <svg className="fav-row-play" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <polygon points="6,3 20,12 6,21" fill="currentColor" />
                </svg>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: `✓ built in …`.

- [ ] **Step 3: Commit**

```bash
git add radio-app/src/components/FavoritesPanel.tsx
git commit -m "feat(favorites): FavoritesPanel component"
```

---

## Task 6: Wire FavoritesPanel into App.tsx + CSS

**Files:**
- Modify: `radio-app/src/App.tsx`
- Modify: `radio-app/src/App.css`

- [ ] **Step 1: Update App.tsx**

In `radio-app/src/App.tsx`:

1. Add the import near other component imports:

```tsx
import FavoritesPanel from "./components/FavoritesPanel";
```

2. Add the state hook with the other `useState` declarations near the top of `function App()`:

```tsx
const [favoritesOpen, setFavoritesOpen] = useState(false);
```

3. Pass the new props to `<SearchBar>`:

```tsx
<SearchBar
  onSelectPlace={handleSelectPlace}
  onSelectChannel={handleSelectChannel}
  currentChannelId={currentChannel?.id ?? null}
  currentChannelName={currentChannel?.name ?? ""}
  isPlaying={isPlaying}
  onTogglePlay={togglePlay}
  onWikiClick={handleWikiClick}
  wikiOpen={wikiOpen}
  favoritesOpen={favoritesOpen}
  onToggleFavorites={() => setFavoritesOpen((v) => !v)}
/>
```

4. Render the panel inside the `main-content` div, alongside the other floating panels (e.g., right after the wiki panel block):

```tsx
<FavoritesPanel
  open={favoritesOpen}
  onClose={() => setFavoritesOpen(false)}
  onSelectStation={handleSelectChannel}
/>
```

- [ ] **Step 2: Add CSS**

Append to `radio-app/src/App.css`:

```css
/* === Favorites — topbar buttons === */
.fav-btn {
  border: none;
  background: rgba(255,255,255,0.85);
  color: #777;
  cursor: pointer;
  border-radius: 999px;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, transform 0.15s ease, background 0.15s ease;
}
.fav-btn:hover:not(:disabled) {
  color: #e0245e;
  background: rgba(255,255,255,1);
}
.fav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.fav-btn.active {
  color: #e0245e;
}
.fav-btn.pulse {
  transform: scale(1.18);
}

.ctrl-btn.fav-list {
  border: none;
  background: rgba(255,255,255,0.85);
  color: #555;
  cursor: pointer;
  border-radius: 999px;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, background 0.15s ease;
}
.ctrl-btn.fav-list:hover { background: rgba(255,255,255,1); }
.ctrl-btn.fav-list.active { color: #4f46e5; }

/* === Favorites — per-row heart in StationList === */
.station-list ul li .fav-btn.row-fav {
  width: 28px;
  height: 28px;
  margin-right: 8px;
  background: transparent;
}
.station-list ul li .fav-btn.row-fav:hover:not(:disabled) {
  background: rgba(0,0,0,0.04);
}

/* === Favorites — left-side panel === */
.floating-favorites-panel {
  position: absolute;
  top: 88px;
  left: 16px;
  width: min(360px, calc(100vw - 32px));
  max-height: calc(100vh - 180px);
  z-index: 1095;
  pointer-events: auto;
}

.favorites-card {
  background: rgba(255,255,255,0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(200,200,200,0.5);
  border-radius: 18px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.12);
  padding: 14px 16px;
  max-height: inherit;
  overflow-y: auto;
}

.favorites-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.favorites-close {
  border: none;
  background: none;
  color: #777;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.favorites-empty {
  color: #666;
  font-size: 13px;
  padding: 12px 4px;
  line-height: 1.5;
}

.favorites-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.fav-row {
  display: grid;
  grid-template-columns: 18px 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: 10px;
  cursor: pointer;
  outline: none;
}
.fav-row:hover, .fav-row:focus-visible {
  background: rgba(0,0,0,0.04);
}

.fav-row-icon {
  color: #e0245e;
}

.fav-row-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.fav-row-info strong {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fav-row-time {
  font-size: 11px;
  color: #888;
}

.fav-row-remove {
  border: none;
  background: none;
  color: #aaa;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
  padding: 0 4px;
}
.fav-row:hover .fav-row-remove,
.fav-row:focus-visible .fav-row-remove {
  opacity: 1;
}
.fav-row-remove:hover {
  color: #e0245e;
}

.fav-row-play {
  color: #555;
}
```

- [ ] **Step 3: Verify build green**

Run: `cd radio-app && npm run build 2>&1 | tail -5`
Expected: `✓ built in …`.

- [ ] **Step 4: Commit**

```bash
cd /Users/jamessun/workspace/CC/radio-garden
git add radio-app/src/App.tsx radio-app/src/App.css
git commit -m "feat(favorites): wire panel into App + styles"
```

---

## Task 7: Local + Playwright verification, then deploy

**Files:** none (verification only)

- [ ] **Step 1: Run unit tests + build**

Run: `cd radio-app && npm test 2>&1 | tail -8 && npm run build 2>&1 | tail -3`
Expected: 13 tests pass (5 places + 8 favorites), build succeeds.

- [ ] **Step 2: Manual smoke test**

Restart dev server if needed:
```bash
lsof -ti:5173 | xargs kill 2>/dev/null; sleep 1
cd radio-app && npm run dev &
disown
```

Open `http://localhost:5173/airwaves/` in your browser. Confirm:
- Bookmark button visible in the topbar (between heart and wiki).
- Clicking a place dot opens StationList with hearts on each row.
- Click a heart on a station row → it fills red.
- Click that station → plays. The topbar heart now shows red.
- Click the topbar bookmark → Favorites panel opens on the **left** side.
- Panel shows the favorited station(s), newest first.
- Click a row in the panel → it plays and the panel closes.
- Hover a row → `×` becomes visible. Click `×` → row vanishes.
- Reload the page → favorites persist.

- [ ] **Step 3: Playwright probe**

Update `/tmp/airwaves-fav-test.mjs`:

```js
import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5173/airwaves/', { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(
  () => document.querySelectorAll('.leaflet-interactive').length > 50,
  null,
  { timeout: 30000 },
);

// Open the favorites panel via the topbar button.
await page.click('.ctrl-btn.fav-list');
const panelVisible = await page.isVisible('.floating-favorites-panel');

// Empty state should show.
const emptyText = await page.textContent('.favorites-empty');

// Programmatically seed a favorite, then close + reopen.
await page.evaluate(() => {
  const payload = { v: 1, items: [{ id: "test123", name: "Test Station", addedAt: Date.now() }] };
  localStorage.setItem("airwaves_favorites_v1", JSON.stringify(payload));
});
await page.click('.favorites-close');
await page.click('.ctrl-btn.fav-list');

// Persisted favorite should now appear.
const rowText = await page.textContent('.fav-row .fav-row-info strong').catch(() => null);

console.log(JSON.stringify({ panelVisible, emptyText, rowText, errors: errors.slice(0, 5) }, null, 2));
await browser.close();
```

Run: `cd /tmp && node airwaves-fav-test.mjs`
Expected:
- `panelVisible: true`
- `emptyText` starts with `"No favorites yet."`
- `rowText: "Test Station"` after the localStorage seed
- `errors: []`

- [ ] **Step 4: Push to deploy**

```bash
cd /Users/jamessun/workspace/CC/radio-garden
git push 2>&1 | tail -3
gh run list --limit 1 --json databaseId -q '.[0].databaseId'
```

Capture the run id from the second command and watch:

```bash
gh run watch <run-id> --exit-status 2>&1 | tail -3
```

Expected: workflow succeeds.

- [ ] **Step 5: Verify on the live URL**

Edit `/tmp/airwaves-fav-test.mjs` — change `http://localhost:5173/airwaves/` to `https://dreamc0der-ai.github.io/airwaves/`. Re-run.
Expected: same outputs (panelVisible true, empty state copy, errors empty).

---

## Self-review

**1. Spec coverage:**
- Storage module + tests → Task 1 ✓
- Reusable heart toggle component → Task 2 ✓
- Heart on each StationList row → Task 3 ✓
- Heart toggle (current station) + bookmark in topbar → Task 4 ✓
- Left-side Favorites panel with empty state, rows, hover-`×` remove → Task 5 ✓
- Wire-up + CSS → Task 6 ✓
- Pub/sub fan-out so all hearts re-render together → Task 1 (`subscribe`) + Task 2 (`useFavorites`) ✓
- Persistence verification → Task 7 ✓

**2. Placeholder scan:** Every code step shows the actual code. The Task 4 wiki SVG block uses `…existing wiki SVG…` — that's a deliberate "leave the existing markup alone" instruction, not a missing block. The executor sees the file already.

**3. Type consistency:** `Favorite { id, name, addedAt }` is identical between `favorites.ts`, the test file, and `FavoritesPanel.tsx`. `useFavorites()` returns `Favorite[]` everywhere it's used. `toggleFavorite(id, name)` signature consistent across `FavoriteButton.tsx` and the storage module.
