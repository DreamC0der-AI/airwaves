# Mobile Safari layout fix + reproduction harness

## Problem

On iOS Safari the floating top panel (search input + two-row button cluster)
renders flush under the iPhone status bar, and the bottom sheets sit behind
Safari's bottom URL toolbar. Root cause:

- `index.html`'s viewport meta lacks `viewport-fit=cover`, so iOS never reports
  safe-area insets.
- The mobile CSS hardcodes `top: 8px` on `.floating-top-panel`, leaving no room
  for the status bar.
- Bottom sheets are pinned to `bottom: 0` with no allowance for the home
  indicator / Safari bottom bar.

This cannot be reproduced in desktop Chrome because `env(safe-area-inset-*)`
is only non-zero on a real notched device.

## Fix (app code)

1. **`index.html`** — add `viewport-fit=cover` to the viewport meta tag.

2. **`index.css`** — expose the insets as CSS custom properties so both real iOS
   and the simulator can drive them through one code path:

   ```css
   :root {
     --safe-top: env(safe-area-inset-top, 0px);
     --safe-bottom: env(safe-area-inset-bottom, 0px);
   }
   ```

3. **`App.css`** (mobile `@media (max-width: 640px)`):
   - `.floating-top-panel { top: calc(8px + var(--safe-top)); }` — clears the
     status bar.
   - Tighten the two-row card so it reads snug rather than a bulky white slab:
     trim `sidebar-controls-row` padding and row-gap, and drop the icon buttons
     from 40px to 38px. The two-row shape is retained.
   - Bottom sheets (`.floating-station-list`, `.floating-wiki-panel`,
     `.floating-favorites-panel`): add `padding-bottom: var(--safe-bottom)` so
     the last row clears Safari's bottom bar / home indicator. The inner cards'
     `max-height` already uses `75vh`, which stays within bounds.

## Reproduction harness

`radio-app/public/simulate-safari.html`: a standalone page (served by Vite at
`/simulate-safari.html`) that renders an iPhone-12-sized frame (390×844 CSS px),
embeds the live app via a same-origin `<iframe src="./">`, and overlays a mock
iOS status bar (top) and Safari bottom URL bar.

Because the iframe is same-origin, the harness sets `--safe-top: 47px` and
`--safe-bottom: 34px` on the iframe document's root element once it loads, so the
`env()` fallbacks light up on desktop exactly as they would on a real iPhone.

### Why the CSS-var indirection

`env(safe-area-inset-*)` cannot be forced in desktop Chrome, so the harness
could not otherwise reproduce real iOS spacing. Routing the insets through
`--safe-top` / `--safe-bottom` means the same code path works on real iOS (env
supplies the value) and in the simulator (harness overrides it) — no app code is
special-cased for simulation.

## Verification

Run the Vite dev server, load `/simulate-safari.html` in a headless browser at
desktop size, and capture before/after screenshots showing the top panel
clearing the status bar and the bottom sheet clearing Safari's bar.

## Out of scope

- Desktop (>640px) layout is unchanged.
- No change to the two-row topbar structure beyond tightening.
