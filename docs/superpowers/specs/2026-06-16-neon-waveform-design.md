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

### 2. `Waveform.tsx` (new) — iOS9 Siri-style rendering

Revised after first-pass feedback ("too low, too violent, make it more abstract").
A raw time-domain trace is too jittery, so instead of drawing samples we drive a
few smooth sine curves by a *loudness envelope*. Reference:
[kopiro/siriwave](https://github.com/kopiro/siriwave) `src/ios9-curve.ts`.

- Renders `<canvas>` inside `.waveform-strip`; DPR-scaled for retina.
- Each frame, derive one **loudness** value = RMS of `getByteTimeDomainData`,
  normalised (`*3.2`, clamped 0..1).
- **Heavy temporal smoothing:** `level += (target - level) * 0.05`, with a small
  floor (`0.06`) so the wave always drifts gently — this is also the
  always-some-vibe hedge (quiet or non-analysable streams still move). The floor
  replaces the earlier explicit flat-detection fallback.
- Draw `CURVES` (3 layered sine curves, differing amplitude/wave-number/phase
  speed/alpha). For each point, `x ∈ [-2, 2]` across the width and
  `y = mid - level * heightMax * amp * att(x) * sin(k·x - phase)`, where the bell
  envelope `att(x) = (4/(4 + x²))⁴` makes curves bulge in the centre and fade to
  the edges. Phases scroll per frame at per-curve speeds.
- Neon `#7a5cff`, `globalCompositeOperation = "lighter"` + `shadowBlur` for the
  layered glow.
- When `playing` is false: stop the rAF loop; the strip fades to 0 via CSS.
- If no analyser exists, render `null`.
- A `?wavedemo=1` flag (used only during development to screenshot the look
  headlessly, since audio can't play in headless Chrome) is removed before commit.

### 3. Placement — `App.tsx` + `App.css`

- `App` renders `<Waveform analyser={analyser} playing={isPlaying} />`, holds
  `analyser` in state, and passes `setAnalyser` as `onAnalyser` to `Player`.
- `App` adds a `sheet-open` class to `.app` when
  `selectedPlace || wikiOpen || favoritesOpen`.
- `.waveform-strip`:
  - `position: fixed`, `left/right: 0`, `bottom: calc(var(--safe-bottom) + 24px)`
    (lifted clear of the bottom edge so the wave sits higher), height ~150px.
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
