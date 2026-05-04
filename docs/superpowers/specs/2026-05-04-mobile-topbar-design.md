# Mobile Two-Row Topbar Design

**Date:** 2026-05-04
**Status:** Approved, ready for implementation plan

## Goal

On viewports ≤640 px, lay out the topbar as **two rows** instead of one cramped line:

- **Row 1:** search input — takes full width.
- **Row 2:** the four control buttons (play, heart, bookmark, wiki) — right-aligned, 40 × 40 each.

The current single-row layout fails because the existing desktop rule `.search-input-wrapper { width: 320px; max-width: 42vw }` clamps the input below ~157 px on a 375 px viewport, and four 40 px buttons + gaps consume the rest, so the placeholder text and the play button overlap visually.

## Non-goals

- Restructuring the SearchBar JSX (no new wrapper elements).
- Collapsing-search animation (saved for later if needed).
- Repositioning the topbar to the bottom.
- Desktop layout changes.

## Implementation

A small extension to the existing `@media (max-width: 640px)` block in `radio-app/src/App.css`. No TS/TSX changes.

### CSS changes

```css
@media (max-width: 640px) {
  /* Existing rules unchanged. Append: */

  .search-bar .sidebar-controls-row {
    flex-wrap: wrap;
    row-gap: 8px;
  }

  /* Search input takes the whole first row. */
  .search-input-wrapper {
    flex: 1 1 100%;
    width: 100%;
    max-width: none;
    min-width: 0;
  }

  /* Button cluster right-aligned on row 2.
     `margin-left: auto` on the first button (play) absorbs the row's
     leading whitespace, packing the remaining three buttons to its right. */
  .ctrl-btn.play {
    margin-left: auto;
  }
}
```

## Why `margin-left: auto` on `.play`

When flex items wrap, each line is laid out independently. The four buttons all live on row 2 (after `flex: 1 1 100%` forces the input onto row 1 alone). Putting `margin-left: auto` on the first button makes it consume all leading free space, which pushes itself plus every subsequent sibling to the trailing edge — a right-aligned cluster — without restructuring the DOM or applying `justify-content: flex-end` (which would right-align row 1's input too).

## Testing

- **Manual.** DevTools mobile mode at 375 × 812: confirm the search input occupies the full topbar width on row 1 and the four buttons cluster at the right edge of row 2 with no overlap.
- **Playwright probe.** At 375 × 812, assert that:
  - The search input's bounding rect is at least 320 px wide.
  - The play button's `top` is at least 40 px below the input's `top` (i.e., they're on different rows).
  - The wiki button's right edge is within 16 px of the topbar card's right edge.
- **Desktop regression.** At 1280 × 800, assert the search input is still ≤ 320 px wide (single-row layout intact).

## Out of scope (YAGNI)

- A search-icon-collapses-to-input animation.
- Hiding row 2 buttons while a bottom sheet is open (current single-sheet rule already prevents conflicts).
- Repositioning the topbar to the bottom edge of the viewport.
