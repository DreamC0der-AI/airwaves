# Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On viewports ≤640 px, render the three floating panels (StationList, Wiki, Favorites) as full-width bottom sheets, enforce a single-sheet-at-a-time rule, and bump touch targets — without changing the desktop layout.

**Architecture:** A single `@media (max-width: 640px)` block at the bottom of `App.css` handles positioning, sizing, animation, and touch sizing. A small `openExclusive*` helper trio in `App.tsx` enforces the single-sheet rule by clearing other panel state when one opens, but only on mobile (gated by `window.matchMedia`).

**Tech Stack:** Pure CSS media queries, plain React state — no new dependencies.

---

## File Structure

### Modified
- `radio-app/src/App.css` — append a `@media (max-width: 640px)` block (~70 lines).
- `radio-app/src/App.tsx` — three `useCallback` helpers (`openStationListExclusive`, `openWikiExclusive`, `openFavoritesExclusive`); rewire the existing handlers to use them.

### Created
- None.

---

## Task 1: CSS — bottom-sheet rules + topbar + dropdown

**Files:**
- Modify: `radio-app/src/App.css` (append a media-query block at end of file)

- [ ] **Step 1: Append the media-query block**

Run:
```bash
cat >> /Users/jamessun/workspace/CC/radio-garden/radio-app/src/App.css << 'CSSEOF'

/* === Mobile layout (≤640px) === */
@media (max-width: 640px) {
  /* Topbar — full width, larger touch targets */
  .floating-top-panel {
    left: 8px;
    right: 8px;
    top: 8px;
  }
  .floating-top-panel .search-bar {
    width: 100%;
    max-width: none;
  }
  .search-bar .sidebar-controls-row {
    flex-wrap: nowrap;
    gap: 6px;
    padding: 8px 8px;
  }
  .search-input-wrapper {
    flex: 1;
    min-width: 0;
  }
  .ctrl-btn,
  .wiki-btn,
  .fav-btn {
    width: 40px;
    height: 40px;
  }

  /* Search-results dropdown — full-width below the input */
  .search-results,
  .search-results.recent-list {
    width: 100%;
    max-height: calc(100vh - 200px);
    overflow-y: auto;
  }

  /* Bottom-sheet container rules — apply to all three panels */
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
    z-index: 1100;
    animation: airwaves-slide-up 200ms ease-out both;
  }

  /* Inner card — rounded top, square bottom */
  .floating-station-list .station-list,
  .wiki-card,
  .favorites-card {
    border-radius: 18px 18px 0 0;
    max-height: 75vh;
    overflow-y: auto;
    padding-top: 6px;
  }

  /* Decorative drag handle on each sheet */
  .floating-station-list .station-list::before,
  .wiki-card::before,
  .favorites-card::before {
    content: "";
    display: block;
    width: 36px;
    height: 4px;
    margin: 6px auto 8px;
    border-radius: 2px;
    background: rgba(0, 0, 0, 0.18);
  }
}

@keyframes airwaves-slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
CSSEOF
```

- [ ] **Step 2: Verify build**

Run: `cd radio-app && npm run build 2>&1 | tail -5`
Expected: `✓ built in …`

- [ ] **Step 3: Commit**

```bash
cd /Users/jamessun/workspace/CC/radio-garden
git add radio-app/src/App.css
git commit -m "feat(mobile): bottom-sheet panels + bigger touch targets at ≤640px"
```

---

## Task 2: App.tsx — single-sheet mutex on mobile

**Files:**
- Modify: `radio-app/src/App.tsx`

- [ ] **Step 1: Add `isMobileViewport` helper at module top**

Open `radio-app/src/App.tsx`. After the existing imports and the `fetchWikiSummary` function, but before `function App() {`, add:

```ts
function isMobileViewport(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 640px)").matches;
}
```

- [ ] **Step 2: Update `handleSelectPlace`**

Find the existing:
```tsx
const handleSelectPlace = useCallback((placeId: string, title: string) => {
  setSelectedPlace({ id: placeId, name: title });
}, []);
```

Replace with:
```tsx
const handleSelectPlace = useCallback((placeId: string, title: string) => {
  setSelectedPlace({ id: placeId, name: title });
  if (isMobileViewport()) {
    setWikiOpen(false);
    setFavoritesOpen(false);
  }
}, []);
```

- [ ] **Step 3: Update `handleWikiClick` to enforce mutex when opening**

Find the existing:
```tsx
const handleWikiClick = useCallback(async () => {
  if (!currentChannel?.id) return;
  if (wikiOpen) { setWikiOpen(false); return; }
  setWikiOpen(true);
  ...
```

Insert mobile-mutex logic just after `setWikiOpen(true);`:

```tsx
const handleWikiClick = useCallback(async () => {
  if (!currentChannel?.id) return;
  if (wikiOpen) { setWikiOpen(false); return; }
  setWikiOpen(true);
  if (isMobileViewport()) {
    setSelectedPlace(null);
    setFavoritesOpen(false);
  }
  if (wikiData && wikiData.stationName === currentChannel.name) return;
  setWikiLoading(true);
  try {
    const channelData = await getChannel(currentChannel.id);
    const stationName: string = channelData?.data?.title ?? currentChannel.name;
    const placeName: string = channelData?.data?.place?.title ?? "";
    const [stationWiki, placeWiki] = await Promise.all([
      stationName ? fetchWikiSummary(stationName) : Promise.resolve(null),
      placeName ? fetchWikiSummary(placeName) : Promise.resolve(null),
    ]);
    setWikiData({ stationName, placeName, stationWiki, placeWiki });
  } catch {
    setWikiData({ stationName: currentChannel.name, placeName: "", stationWiki: null, placeWiki: null });
  } finally {
    setWikiLoading(false);
  }
}, [currentChannel?.id, currentChannel?.name, wikiOpen, wikiData?.stationName]);
```

- [ ] **Step 4: Update the favorites toggle inline in JSX**

Find the existing inline arrow passed to `SearchBar`:
```tsx
onToggleFavorites={() => setFavoritesOpen((v) => !v)}
```

Replace with a named handler defined alongside the others, so the mutex logic is testable:

1. Add the handler near the other useCallbacks:

```tsx
const handleToggleFavorites = useCallback(() => {
  setFavoritesOpen((prev) => {
    const next = !prev;
    if (next && isMobileViewport()) {
      setSelectedPlace(null);
      setWikiOpen(false);
    }
    return next;
  });
}, []);
```

2. Replace the prop:

```tsx
onToggleFavorites={handleToggleFavorites}
```

- [ ] **Step 5: Verify build**

Run: `cd radio-app && npm run build 2>&1 | tail -5`
Expected: `✓ built in …`

- [ ] **Step 6: Run unit tests** (sanity check — no test changes expected)

Run: `npm test`
Expected: 13 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/jamessun/workspace/CC/radio-garden
git add radio-app/src/App.tsx
git commit -m "feat(mobile): single-sheet mutex on small viewports"
```

---

## Task 3: Manual + Playwright verification, then deploy

**Files:** none (verification only).

- [ ] **Step 1: Restart dev server**

```bash
lsof -ti:5173 | xargs kill 2>/dev/null; sleep 1
cd /Users/jamessun/workspace/CC/radio-garden/radio-app && npm run dev &
disown
sleep 3
```

- [ ] **Step 2: Manual smoke at 375 × 812**

Open `http://localhost:5173/airwaves/` in a browser. Open DevTools, switch to a phone viewport (e.g. iPhone 13, 390 × 844). Verify:
- Topbar spans full width.
- Tap a place dot → station list slides up from bottom, takes ~75 % of viewport.
- × button on the station list still works.
- Tap the bookmark icon → favorites sheet slides up; station list disappears.
- Tap a station in favorites → station plays, panel closes.
- Tap a station to play → tap wiki icon → wiki sheet slides up, replacing favorites.
- ESC still closes the topmost sheet.

- [ ] **Step 3: Write Playwright probe**

Create `/tmp/airwaves-mobile-test.mjs`:

```js
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:5173/airwaves/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(
  () => document.querySelectorAll('.leaflet-interactive').length > 50,
  null,
  { timeout: 30000 },
);

// Open station list via search → place
await page.click('input[type="text"]');
await page.fill('input[type="text"]', 'tokyo');
await page.waitForSelector('.search-results li', { timeout: 10000 });
await page.locator('.search-results li:has(.type-badge.place)').first().click();
await page.waitForSelector('.station-list ul li', { timeout: 15000 });

// Confirm bottom-sheet anchoring
const sheetGeom = await page.evaluate(() => {
  const el = document.querySelector('.floating-station-list');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    bottom: window.innerHeight - r.bottom,
    width: r.width,
    position: cs.position,
  };
});

// Open favorites — station list should close (single-sheet rule).
await page.click('.ctrl-btn.fav-list');
await page.waitForTimeout(400);
const stationListClosedByFav = !(await page.isVisible('.floating-station-list'));
const favVisible = await page.isVisible('.floating-favorites-panel');

// ESC closes favorites.
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const favClosedByEsc = !(await page.isVisible('.floating-favorites-panel'));

// Resize to desktop and verify panels return to anchored top.
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(200);
await page.click('.ctrl-btn.fav-list');
const desktopFavTop = await page.evaluate(() => {
  const el = document.querySelector('.floating-favorites-panel');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.top;
});

await page.screenshot({ path: '/tmp/airwaves-mobile.png', fullPage: false });

console.log(JSON.stringify({
  url: URL,
  sheetGeom,
  stationListClosedByFav,
  favVisible,
  favClosedByEsc,
  desktopFavTop,
  errors: errors.slice(0, 5),
}, null, 2));

await browser.close();
```

- [ ] **Step 4: Run the probe**

Run: `cd /tmp && node airwaves-mobile-test.mjs`
Expected:
- `sheetGeom.bottom` is `0` (or very close — within 1 px).
- `sheetGeom.width` is 375.
- `sheetGeom.position` is `"fixed"`.
- `stationListClosedByFav` is `true`.
- `favVisible` is `true`.
- `favClosedByEsc` is `true`.
- `desktopFavTop` is around `88` (desktop layout returns).
- `errors` is `[]`.

- [ ] **Step 5: Push to deploy**

```bash
cd /Users/jamessun/workspace/CC/radio-garden
git push 2>&1 | tail -3
```

Capture the workflow run ID and watch:
```bash
RUN=$(gh run list --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN" --exit-status 2>&1 | tail -3
gh run view "$RUN" --json conclusion -q .conclusion
```

Expected: `success`.

- [ ] **Step 6: Verify on the live URL**

Run: `cd /tmp && URL=https://dreamc0der-ai.github.io/airwaves/ node airwaves-mobile-test.mjs`
Expected: same outputs (bottom-sheet anchoring, single-sheet rule, ESC close, desktop layout returns at 1280×800, no errors).

---

## Self-review

**1. Spec coverage:**
- ≤640 px breakpoint with bottom-sheet positioning → Task 1.
- Slide-up animation + drag handle → Task 1.
- Topbar full-width, button targets bumped to 40 px → Task 1.
- Search-results dropdown full-width → Task 1.
- Single-sheet rule via `window.matchMedia` mutex → Task 2.
- Desktop layout untouched → confirmed by `desktopFavTop` ≈ 88 in Task 3 step 4.
- Manual + Playwright + live verification → Task 3.

**2. Placeholder scan:** Every code step shows the actual code. The CSS heredoc and TSX snippets are complete.

**3. Type consistency:** No new types introduced. The mutex helpers reuse existing `setSelectedPlace`, `setWikiOpen`, `setFavoritesOpen` setters with their existing signatures.
