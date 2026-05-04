# Radio Garden — Static Rebuild Design

**Date:** 2026-05-04
**Status:** Draft, awaiting user approval

## Goal

Reshape the existing `radio-app/` project into:

1. A **pure static site** with no backend server — Vite-built `dist/` only.
2. A **macOS dock icon** (Safari "Add to Dock") pointing at the deployed site.
3. A **map-first browse mode**: every place in the Radio Garden catalog appears as a dot on the world map; clicking a dot expands the existing station list panel for that place.

The existing translate / Whisper / Groq feature is removed in full.

## Non-goals

- Multi-user features, accounts, sync.
- Offline-first / full PWA. (A `manifest.webmanifest` is added so Safari renders the standalone window correctly, but the app still requires network because radio streams are network-only by definition.)
- Mobile / Android / iOS packaging.
- Tauri or Electron wrapping.

## Architecture overview

```
┌──────────────────────────────────────────────┐
│  Browser (Safari "Radio Garden" dock app)    │
│                                              │
│   React + Vite static bundle                 │
│   ┌────────────────────────────────────┐     │
│   │  WorldMap  ── dots (CircleMarker)  │     │
│   │  SearchBar                         │     │
│   │  StationList  (per-place panel)    │     │
│   │  Player      (<audio> tag)         │     │
│   │  WikiPanel                         │     │
│   └────────────────────────────────────┘     │
│              │                               │
│              │  fetch() — no proxy           │
│              ▼                               │
└──────────────┼───────────────────────────────┘
               │
   ┌───────────┴────────────┬───────────────────┐
   ▼                        ▼                   ▼
radio.garden/api      en.wikipedia.org     CARTO basemap
(search, places,      /api/rest_v1         tile server
 page, channel,
 listen redirect)
```

CORS verified: `radio.garden` reflects the `Origin` header on every endpoint we use, including the listen-stream redirect chain. No proxy required.

## Components

### Removed
- `server/` (entire directory).
- `src/components/TranslationPanel.tsx`.
- `src/api/translate.ts`.
- `public/worklets/` (audio capture for Whisper input).
- `translations/` (server-written transcript logs).
- `npm` deps: `groq-sdk`, `dotenv`, `express`, `cors`, `concurrently`, `tsx`, `@types/cors`, `@types/express`, `@types/node`.
- `vite.config.ts` proxy block.
- All translate-related state and UI in `App.tsx` (`translating`, `targetLang`, `LANGUAGES`, dropdown, translate button, `audioCtx`, `sourceNode`, `handleAudioContext`).

### Modified
- **`src/api/config.ts`** — replace `/api` base with absolute Radio Garden URLs.
- **`src/api/radioGarden.ts`** — point at `https://radio.garden/api/...` directly. Add `getPlaces()` and `getStreamUrl(id)` returning `https://radio.garden/api/ara/content/listen/${id}/channel.mp3`.
- **`src/components/Player.tsx`** — drop `AudioContext` / `MediaElementAudioSourceNode` / `crossOrigin`. Plain `<audio src=…>` plus play/pause sync.
- **`src/components/WorldMap.tsx`** — see "Map dots" below.
- **`src/components/SearchBar.tsx`**, **`StationList.tsx`** — fix React duplicate-key warning by deduping on `_source.url` or composite key (existing bug surfaced by user).
- **`src/App.tsx`** — slim down state, drop translate UI, wire map-click → `setSelectedPlace`. Wiki summary now fetched directly from Wikipedia REST API.

### Added
- **`PlacesProvider`** (`src/api/places.ts` + small React context) — single fetch of `https://radio.garden/api/ara/content/places` on app boot, hydrated from `localStorage` if present, refreshed in background. Exposes:
  - `places: Place[]` (~9 k entries: `{ id, title, lat, lng, country, size }`)
  - `getGeo(placeId)` — sync lookup, replaces today's `/api/geo/:id`.
- **`public/manifest.webmanifest`** — name, icons, `display: standalone`, theme color, so Safari "Add to Dock" produces a real app window.
- **`public/icon-512.png`, `icon-192.png`** — app icons.
- **`.github/workflows/deploy.yml`** — GitHub Actions: build on push to `main`, publish `radio-app/dist/` to GitHub Pages via the official `actions/deploy-pages` action.

## Data flow

1. **App boot.** `PlacesProvider` hydrates from `localStorage["radio_places_v1"]`, then fetches `https://radio.garden/api/ara/content/places` in the background and refreshes if the upstream `etag` changed. ~9 k records — under 1 MB JSON.
2. **Map renders.** Every place becomes a small `L.CircleMarker(lat, lng, { radius: 3, … })`. Markers grouped via `leaflet.markercluster` so dense regions collapse at low zoom.
3. **User clicks a dot.** Cluster expands on click at the cluster level; on a leaf, the click sets `selectedPlace = { id, name }`. The existing `StationList` floating panel opens for that place — same component, same data path (`getPlace(id)`).
4. **User picks a station.** `setCurrentChannel(...)` plays via `<audio>`. Map flies to the channel's place. Wiki panel works as today, but its fetch hits `https://en.wikipedia.org/api/rest_v1/page/summary/...` directly.
5. **Search.** Unchanged user-facing behavior; under the hood, `searchStations()` hits `https://radio.garden/api/search` directly.

## Map dots — UX details

- **Symbol.** `CircleMarker` with `radius: 3`, `weight: 0`, `fillOpacity: 0.55`, fill color from a single accent color. CircleMarkers are SVG-light, ~9 k of them rendered through clustering performs fine on a modern Mac.
- **Clustering.** `leaflet.markercluster` with `disableClusteringAtZoom: 7` (city level), `maxClusterRadius: 50`, `chunkedLoading: true`, custom cluster icon styled to match.
- **Hover.** Leaflet `tooltip` with the place title, `direction: 'top'`. No station count up-front (would require fetching every place's stations — too expensive).
- **Click.** Leaflet popup or direct call into `onSelectPlace(id, name)` — picks the latter to reuse the existing list panel rather than introducing a second list UI.
- **Selected state.** Currently-playing place is rendered as a slightly larger filled circle in a distinct color, on top of the cluster layer.
- **Performance.** All ~9 k CircleMarkers are added once into a single `MarkerClusterGroup`; layers aren't recreated on re-render. Initial render budget: <200 ms.

## Hosting & deploy (GitHub Pages)

- Repository: a fresh `radio-garden` repo on the user's GitHub (init in this session).
- `vite.config.ts` gets `base: "/<repo-name>/"` so asset paths resolve under the Pages URL. (If the repo is named `<user>.github.io`, `base` stays default.)
- `.github/workflows/deploy.yml`:
  - Trigger: `push` to `main`, plus `workflow_dispatch`.
  - Steps: setup-node 20 → `npm ci` (in `radio-app/`) → `npm run build` → upload `radio-app/dist` artifact → `actions/deploy-pages@v4`.
  - Permissions: `pages: write`, `id-token: write` per the standard Pages workflow.
- One-time GitHub UI action: enable Pages with source `GitHub Actions`. Documented in the implementation plan; not automatable from the CLI.
- After first successful deploy, user opens the Pages URL in **Safari** → File → "Add to Dock…" → the macOS app icon appears in `/Applications/`.

## Error handling

- **Places fetch fails on first load.** Show a small toast ("couldn't load place index — search still works"), the map renders empty of dots, search/play paths still function.
- **Stream fails.** `Player` shows the inline error it already shows; no change.
- **Wiki fetch fails.** Existing "no Wikipedia summary found" path; no change.

## Testing

- **Local manual.** `npm run dev` → exercise: map dots render with clusters, click a cluster zooms in, click a leaf opens station list, station plays, search still works, Wiki opens.
- **Build verification.** `npm run build && npm run preview` and run the same Playwright probe used to verify the JSON fix earlier — assert no console errors, no failed `radio.garden` responses, station search returns results.
- **Pages verification.** After first deploy, repeat the Playwright probe against the live Pages URL.

## Open items / risks

- **macOS Sonoma assumption.** "Add to Dock" requires Sonoma+. If the user is on an earlier macOS, fall back to Chrome's "Install as app". Will check in the implementation step.
- **Place dataset size.** If ~9 k turns out to be ~50 k or includes embedded data, we may need to project to a leaner shape before storing in `localStorage`. Will measure during implementation.
- **GitHub Pages base path.** Plan must verify the actual repo name to set `base` correctly before first deploy.
