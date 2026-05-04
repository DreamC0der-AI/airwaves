# Station Favorites Design

**Date:** 2026-05-04
**Status:** Approved, ready for implementation plan

## Goal

Let the user mark any station as a favorite, see all favorites in a dedicated side panel, and play one with a click. Storage is local-only (`localStorage`); no backend, no sync.

## Non-goals

- Cross-device sync.
- Favorites overlay on the map (filter dots to favorites only).
- Drag-to-reorder.
- Renaming favorites (the station's own title is canonical).

## User-facing surface

### Three new touchpoints

1. **Heart toggle on every station row in `StationList`.** Sits to the left of the existing play arrow. Filled red ♥ when favorited, outline ♡ when not. Click toggles favourite status; the click does not bubble to the row's play handler.
2. **Heart toggle in the top bar** (`SearchBar.tsx`), inserted between the existing play and wiki buttons. It targets the *currently playing* channel. Filled red when that channel is a favourite, outline otherwise. Disabled when no channel is playing.
3. **Favorites panel toggle** in the top bar, immediately after the heart toggle. A bookmark-style icon. Opens / closes a dedicated panel.

### The Favorites panel

Mirrors the existing wiki panel chrome (`floating-wiki-panel`) but anchored on the **left** side of the viewport so the two panels can co-exist without overlap.

Rows: `[♥ filled] [station name] [relative-time subtitle] [hover-only × remove] [▶ play]`

- Row click plays that station and closes the panel (matches `StationList` behaviour).
- The `×` removes the entry from favorites without playing it.
- Empty state copy: *"No favorites yet. Tap ♡ next to a station to add one."*

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  App.tsx                                                 │
│    state: favoritesOpen                                  │
│                                                          │
│    ┌─────────────────────────────────────────────────┐   │
│    │ SearchBar (topbar buttons: play, ♥, ✦, wiki)   │   │
│    └─────────────────────────────────────────────────┘   │
│                                                          │
│    ┌──────────────────┐    ┌─────────────────────────┐   │
│    │ FavoritesPanel   │    │ StationList (left/right)│   │
│    │  (left side)     │    │   per-row ♥ toggles     │   │
│    └──────────────────┘    └─────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
                           │
                           │ all components read/write through
                           ▼
   ┌─────────────────────────────────────────────────┐
   │  src/api/favorites.ts                           │
   │   - loadFavorites() : Favorite[]                │
   │   - isFavorite(id) : boolean                    │
   │   - toggleFavorite(id, name) : Favorite[]       │
   │   - removeFavorite(id) : Favorite[]             │
   │   - subscribe(cb) : unsubscribe                 │
   │                                                 │
   │   storage key: "airwaves_favorites_v1"          │
   │   shape: { v: 1, items: Favorite[] }            │
   └─────────────────────────────────────────────────┘
                           │
                           ▼
                  localStorage
```

## Components

### Created

- **`src/api/favorites.ts`** — pure storage module + a tiny pub/sub so components stay in sync after a toggle. Public API:
  ```ts
  export interface Favorite { id: string; name: string; addedAt: number; }
  export function loadFavorites(): Favorite[];
  export function isFavorite(id: string): boolean;
  export function toggleFavorite(id: string, name: string): Favorite[];
  export function removeFavorite(id: string): Favorite[];
  export function subscribe(listener: () => void): () => void;
  ```
  Cap at 100 entries (oldest trimmed when adding the 101st). Schema-versioned cache key (`v: 1`) — same pattern as `places.ts`.
- **`src/api/favorites.test.ts`** — Vitest unit tests for every public function: round-trip, toggle on/off, cap behaviour, schema-version drop, subscribe fan-out.
- **`src/components/FavoritesPanel.tsx`** — the panel UI. Reads via a small `useFavorites()` hook (defined in the same file, subscribes to `favorites.subscribe` and re-renders on change). Props: `open: boolean`, `onClose: () => void`, `onSelectStation: (id, name) => void`.
- **`src/components/FavoriteButton.tsx`** — reusable heart toggle. Props: `channelId: string | null`, `channelName: string`, `size?: number`. Disabled if `channelId` is null.

### Modified

- **`src/components/StationList.tsx`** — render a `<FavoriteButton>` next to each row's play icon; `e.stopPropagation()` to keep heart clicks isolated from row clicks.
- **`src/components/SearchBar.tsx`** — insert two new buttons (heart toggle for current station, panel-toggle bookmark) between the existing play and wiki buttons. Add new props: `favoritesOpen: boolean`, `onToggleFavorites: () => void`. The heart toggle is rendered inline, sourcing state from `useFavorites()`.
- **`src/App.tsx`** — add `favoritesOpen` state and `onToggleFavorites` handler. Render `<FavoritesPanel>` when open. Wire the panel's `onSelectStation` to the existing `handleSelectChannel`.
- **`src/index.css`** (or `App.css`, wherever current panel styles live) — `.floating-favorites-panel` mirroring `.floating-wiki-panel` but anchored left.

## Data flow

1. User clicks ♥ on any station → `toggleFavorite(id, name)` writes to `localStorage` and notifies subscribers.
2. Every `useFavorites()` consumer re-renders with the new list, so heart icons across the UI flip together.
3. Click the bookmark in the top bar → `onToggleFavorites` flips `favoritesOpen` in `App`.
4. With `favoritesOpen=true`, `FavoritesPanel` reads the current list and renders rows.
5. Click a row → `onSelectStation(id, name)` (same handler the search and station-list use), which sets `currentChannel`, plays, and closes the panel via the parent's `setFavoritesOpen(false)`.
6. Click `×` on a row → `removeFavorite(id)` → list updates → row vanishes (no playback change).

## Error handling

- `localStorage` write failure (quota exceeded, private mode): caught and silently swallowed by `favorites.ts`. The in-memory state still updates so the UI stays responsive for the session; the data just doesn't persist. Acceptable trade-off — flagging it would be noisy and the failure mode is already rare for ~100 small entries.
- Reading malformed cache: drop and treat as empty (same pattern as `places.ts`).

## Testing

- **Unit (Vitest):** all six public functions in `favorites.ts`. Use the existing `vitest.setup.ts` `MemoryStorage` shim.
- **Manual + Playwright probe (live):**
  - Click a station → click ♥ on the topbar → reload page → verify it's still favorited (✓ persisted).
  - Open Favorites panel → click a row → verify station plays.
  - Hover a row → click `×` → verify removal.
  - Empty state shows correctly when localStorage is cleared.

## Out of scope / future ideas

- Render a "favorites only" overlay on the map (filter the cluster layer to favorites' place IDs).
- Export / import favorites as JSON.
- Sort by recently-played-of-favorites in addition to recently-added.
