# Audio-reactive neon waveform

## Goal

While a station is playing, show a flowing neon waveform line pinned to the
bottom of the screen, to add visual energy. It reacts to the live audio; when
playback stops it fades out.

## Why this is feasible

The Cloudflare Worker (`worker/src/index.ts`) follows the stream redirect
server-to-server and pipes the audio bytes back with `access-control-allow-origin: *`.
So with `crossOrigin = "anonymous"` on the `<audio>` element, the browser sees a
CORS-clean stream and the Web Audio `AnalyserNode` can read real samples.

## Components

### 1. Audio graph — `Player.tsx`

- Set `audio.crossOrigin = "anonymous"` before assigning `audio.src`. The proxy's
  `ACAO: *` keeps playback working while enabling analysis.
- On first playback (a user gesture), lazily build a singleton graph, guarded by a
  ref so it is created at most once per audio element:
  - `AudioContext`
  - `MediaElementAudioSourceNode(audio)` (can only be created once per element)
  - `AnalyserNode` (`fftSize = 1024`, `smoothingTimeConstant ≈ 0.8`)
  - `source.connect(analyser)` and `analyser.connect(ctx.destination)` so audio
    still reaches the speakers.
  - `ctx.resume()` (autoplay policy — fine, we're inside the play path).
- New prop `onAnalyser?(analyser: AnalyserNode)`, called once when the graph is
  built, to hand the node to `App`.
- Failure handling: wrap graph creation in try/catch. On any failure, skip it —
  audio still plays, the waveform simply never appears.

### 2. `Waveform.tsx` (new) — equalizer bars

Iterated through a few looks based on feedback (raw time-domain trace → too
jittery; iOS9 Siri sine envelope → too tame for quiet radio). Final form is the
common **vertical-bar equalizer**, which reads instantly as "music playing."

- Renders `<canvas>` inside `.waveform-strip`; DPR-scaled for retina.
- Each frame, read `analyser.getByteFrequencyData(buf)`.
- **Bar count is derived from the live canvas width** (`floor(width / SLOT_PX)`,
  `SLOT_PX` 13, min 12) so bars keep a consistent on-screen size on any viewport —
  ~30 on a phone, more on desktop — instead of a fixed count that goes hairline on
  mobile. The `heights` buffer is reallocated in `resize()` when the count changes.
- Bar `i` maps to an **exponential** slice of the lower `SPECTRUM_USE` (0.66) of
  the spectrum (`idx = (i/(n-1))^1.8 * usableBins`) so bass-heavy radio still
  spreads across the bars instead of clumping at the left.
- Magnitude → height with `GAIN` (1.25) and a perceptual `LIFT` gamma (0.7) so
  quiet talk radio reads taller, clamped 0..1, plus a tiny animated idle shimmer
  above `FLOOR` (0.05) so quiet passages still move.
- **Asymmetric per-bar smoothing:** fast `ATTACK` (0.55) on the way up, slow
  `RELEASE` (0.14) on the way down — the classic VU "jump and fall." Paired with a
  light analyser `smoothingTimeConstant` (0.55, set in Player) so transients
  aren't double-averaged into a flat jiggle.
- Draw slim gray (`#6b7280`) pill bars **mirrored around the centre line** (grow
  up and down), no glow — modern minimal look. Bars are thin
  (`BAR_WIDTH_RATIO` 0.34 of their slot, 64 bars) and collapse to a round dot at
  rest. Tip-to-tip max is `MAX_H` (0.7) of the strip height. A spectral tilt
  (lows ×0.7 .. highs ×2.3) plus a widened analyser dB window (`-90/-10`, set in
  Player) keep the whole field moving instead of pinning the bass bars.
- When `playing` is false: stop the rAF loop; the strip fades to 0 via CSS.
- If no analyser exists, render `null`.
- A `?wavedemo=1` flag (dev-only, for headless screenshots since audio can't play
  in headless Chrome) is removed before commit.

### 3. Placement — `App.tsx` + `App.css`

- `App` renders `<Waveform analyser={analyser} playing={isPlaying} />`, holds
  `analyser` in state, and passes `setAnalyser` as `onAnalyser` to `Player`.
- `App` adds a `sheet-open` class to `.app` when
  `selectedPlace || wikiOpen || favoritesOpen`.
- `.waveform-strip`:
  - `position: fixed`, `left/right: 0`, `bottom: calc(var(--safe-bottom) + 24px)`
    (lifted clear of the bottom edge so the wave sits higher). Height is
    viewport-proportional — `clamp(140px, 26vh, 260px)` — so the centre-mirrored
    bars (which only reach half as far from the midline) still have real room to
    jump on a tall phone.
  - `pointer-events: none`.
  - z-index above the map (`.world-map`) but below the floating panels
    (panels are ≥1090; strip ~1000).
  - `opacity` transitions for the fade.
- Mobile only: `@media (max-width: 640px) { .app.sheet-open .waveform-strip { display: none; } }`
  so the strip never collides with a bottom sheet. On desktop the panels float
  top/side, so the strip stays visible.

## Testing / verification

- Canvas + Web Audio are not unit-testable in jsdom; verify visually.
- Use `?wavedemo=1` + the `simulate-safari.html` harness to screenshot the neon
  line on desktop (audio cannot play headlessly).
- Confirm existing playback still works with `crossOrigin` set (regression check).

## Out of scope

- No equalizer-bar variant, no color picker, no persistence.
- Desktop vs mobile layout unchanged apart from the new strip.
