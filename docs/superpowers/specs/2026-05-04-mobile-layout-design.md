# Mobile Layout Design

**Date:** 2026-05-04
**Status:** Approved, ready for implementation plan

## Goal

Make the airwaves UI usable on phones (≤640 px viewport) without redesigning the desktop layout. The existing floating panels currently overlap on small screens; the topbar wraps awkwardly; touch targets are borderline.

## Non-goals

- Drag-to-dismiss / swipe gestures.
- Pull-to-refresh.
- Landscape-specific layouts (the 640 px breakpoint already covers tablets-in-landscape).
- A separate "mobile mode" the user toggles.

## Architecture overview

Pure CSS media-query layer plus a small mutex hook in `App.tsx`. No new components, no library.

```
@media (max-width: 640px)
  ├─ Topbar: full-width, button hit area 40 px
  ├─ StationList | Wiki | Favorites: bottom-sheet positioning + slide-in animation
  └─ Search-results dropdown: full-width below the input

App.tsx
  └─ openPanel("station" | "wiki" | "favorites")
        └─ on mobile, closes the other two before setting state
```

## Components

### Modified
- `radio-app/src/App.css` — new `@media (max-width: 640px)` block at the bottom (~70 lines). Covers topbar adjustments, all three panel rules, search-results dropdown, and a `@keyframes` slide-up.
- `radio-app/src/App.tsx` — replace direct `setFavoritesOpen(true)` / `setWikiOpen(true)` / `setSelectedPlace(...)` calls with a small `openPanelExclusive("station" | "wiki" | "favorites", payload?)` helper that on mobile closes the other panels first.

### Created
- None.

## Data flow

1. User taps a place dot on the map → `handleSelectPlace(id, title)` calls `openPanelExclusive("station", { id, name: title })`.
   - Helper checks `window.matchMedia("(max-width: 640px)").matches`. If true: also clears `wikiOpen` and `favoritesOpen`. Always sets `selectedPlace`.
2. Same flow for opening wiki (`onWikiClick` handler) and opening favorites (`onToggleFavorites` handler).
3. Closing a panel (× button, ESC, route change) is unchanged — clears the relevant state.

## Style rules — `@media (max-width: 640px)`

### Topbar
```css
.floating-top-panel { left: 8px; right: 8px; }
.search-bar .sidebar-controls-row { flex-wrap: nowrap; }
.search-input-wrapper { flex: 1; min-width: 0; }
.ctrl-btn, .wiki-btn, .fav-btn { width: 40px; height: 40px; }
```

### Search dropdown
```css
.search-results, .search-results.recent-list {
  width: 100%;            /* matches the topbar card width */
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}
```

### Bottom sheets — three panels share rules
```css
.floating-station-list,
.floating-wiki-panel,
.floating-favorites-panel {
  position: fixed;
  top: auto;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  max-height: 75vh;
  transform: none;
  z-index: 1100;          /* above the topbar so the sheet visually wins */
  animation: airwaves-slide-up 200ms ease-out both;
}

.floating-station-list .station-list,
.wiki-card,
.favorites-card {
  border-radius: 18px 18px 0 0;
  max-height: 75vh;
  overflow-y: auto;
}

@keyframes airwaves-slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

/* Visual drag handle (decorative — no JS gesture). */
.floating-station-list .station-list::before,
.wiki-card::before,
.favorites-card::before {
  content: "";
  display: block;
  width: 36px;
  height: 4px;
  margin: 8px auto 4px;
  border-radius: 2px;
  background: rgba(0,0,0,0.18);
}
```

### Map dots
No change. (The earlier dot-radius bump already covers touch ergonomics.)

## App.tsx — mutex helper

```ts
function isMobileViewport(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia("(max-width: 640px)").matches;
}

const openStationList = useCallback((id: string, title: string) => {
  setSelectedPlace({ id, name: title });
  if (isMobileViewport()) {
    setWikiOpen(false);
    setFavoritesOpen(false);
  }
}, []);

const openFavorites = useCallback(() => {
  setFavoritesOpen(true);
  if (isMobileViewport()) {
    setWikiOpen(false);
    setSelectedPlace(null);
  }
}, []);

const openWiki = useCallback(() => {
  setWikiOpen(true);
  if (isMobileViewport()) {
    setFavoritesOpen(false);
    setSelectedPlace(null);
  }
}, []);
```

The existing `handleSelectPlace`, `handleWikiClick`, and `onToggleFavorites` get reworked to call these helpers instead of `setX(true)` directly. Toggling closed (e.g., wiki button when wiki is already open) keeps its current "just close" behaviour — no mutex needed for closes.

## Error handling
- `window.matchMedia` not present (very old browsers, SSR): the helper returns `false`, mutex skipped, falls back to desktop multi-panel behaviour. Acceptable.

## Testing
- **Manual.** Resize the browser window to 375 × 812 and verify each panel:
  - Slides up from the bottom, full width, rounded top corners, drag handle visible.
  - Opening a second panel closes the first (single-sheet rule).
  - ESC and × still close.
  - At ≥641 px the desktop layout returns unchanged.
- **Playwright probe.** Headless Chromium with `viewport: { width: 375, height: 812 }`:
  - Open station list → assert `bottom: 0` and slide-in animation classes/styles.
  - Open favorites → assert station list closed.
  - Resize back to 1280 × 800 → assert desktop layout (panels at top: 88).

## Out of scope
- A `prefers-reduced-motion` query for the slide animation. (Could add later — three lines.)
- Differentiating `pointer: coarse` vs viewport width. (Touch laptops with wide screens get desktop layout — fine.)
