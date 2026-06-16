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

### 2. `Waveform.tsx` (new)

- Renders `<canvas>` inside `.waveform-strip`.
- A `requestAnimationFrame` loop runs only while `playing` and an analyser exists:
  - Read `analyser.getByteTimeDomainData(buf)` (time-domain → oscilloscope shape →
    the single flowing line).
  - Stroke a path across the canvas width, sample → y.
  - Neon: `#7a5cff` stroke with `shadowBlur` glow, drawn as two layered strokes
    (a wide faint bloom pass + a crisp core pass). DPR-scaled for retina.
- **Flat-data detection + synthetic fallback:** track the peak deviation from the
  127.5 midline over recent frames. If it stays below a small threshold for ~1s
  while `playing` (a stream that is audible but not analysable), switch the loop to
  draw a generated sine ripple (sum of two sines scrolling over time) so there is
  always some motion. Switch back automatically if real data returns.
- When `playing` is false: stop the rAF loop and let the strip fade to 0 opacity
  via CSS. No idle CPU.
- If no analyser is available at all, render `null`.
- `?wavedemo=1` query flag (dev-only, removed before commit) feeds synthetic data
  so the look can be screenshotted headlessly where audio cannot play.

### 3. Placement — `App.tsx` + `App.css`

- `App` renders `<Waveform analyser={analyser} playing={isPlaying} />`, holds
  `analyser` in state, and passes `setAnalyser` as `onAnalyser` to `Player`.
- `App` adds a `sheet-open` class to `.app` when
  `selectedPlace || wikiOpen || favoritesOpen`.
- `.waveform-strip`:
  - `position: fixed`, `left/right: 0`, `bottom: var(--safe-bottom)`, height ~60px.
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
