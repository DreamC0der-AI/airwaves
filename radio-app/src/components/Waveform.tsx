import { useEffect, useRef } from "react";

interface Props {
  analyser: AnalyserNode | null;
  playing: boolean;
}

const BAR_COLOR = "#6b7280"; // neutral modern gray

// Modern equalizer: slim gray bars mirrored from a center line, each mapped to a
// slice of the frequency spectrum. Bar heights are smoothed per-bar so the
// motion is lively but not flickery.
const SLOT_PX = 13; // target px per bar (bar + gap); bar count is derived from width
const MIN_BARS = 12;
const BAR_WIDTH_RATIO = 0.4; // bar width as a fraction of its slot
const GAIN = 1.25; // frequency magnitude -> height
const LIFT = 0.7; // perceptual gamma (<1 lifts quiet audio so bars read taller)
const FLOOR = 0.05; // idle height so bars never fully die
const SMOOTH = 0.28; // per-bar follow speed (higher = snappier)
const SPECTRUM_USE = 0.66; // fraction of the spectrum to spread across the bars
const MAX_H = 0.82; // tallest bar (tip-to-tip) as a fraction of the strip height
// Music/radio is bass-heavy; without a tilt the low bars pin at max and freeze.
// Tilt tames lows and boosts highs so the whole field moves: lows ×0.7, highs ×2.3.
const TILT_BASE = 0.7;
const TILT_SLOPE = 1.6;

export default function Waveform({ analyser, playing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !playing) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buf = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let barCount = 0;
    let heights = new Float32Array(0); // smoothed 0..1 per bar
    let raf = 0;
    let t = 0;

    // Bar count is derived from the live width so bars keep a consistent on-screen
    // size across viewports (no hairline-dense bars on a narrow phone).
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      barCount = Math.max(MIN_BARS, Math.floor(canvas.clientWidth / SLOT_PX));
      if (heights.length !== barCount) heights = new Float32Array(barCount);
    };
    resize();
    window.addEventListener("resize", resize);

    const usable = buf ? Math.floor(buf.length * SPECTRUM_USE) : 0;
    // Target height (0..1) for bar `i` of `n`, from an exponential slice of the
    // spectrum so bass-heavy radio still spreads across the width.
    const barTarget = (i: number, n: number): number => {
      if (!analyser || !buf) return FLOOR;
      const frac = n > 1 ? i / (n - 1) : 0;
      const idx = Math.floor(Math.pow(frac, 1.8) * (usable - 1));
      const a = buf[idx] ?? 0;
      const b = buf[Math.min(usable - 1, idx + 1)] ?? a;
      const tilt = TILT_BASE + TILT_SLOPE * frac;
      const lin = ((a + b) / 2 / 255) * GAIN * tilt;
      const v = Math.pow(Math.min(1, lin), LIFT);
      // A faint idle shimmer so quiet passages still breathe.
      const idle = FLOOR + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.05 + i * 0.5));
      return Math.min(1, Math.max(idle, v));
    };

    const draw = () => {
      t += 1;
      if (buf && analyser) analyser.getByteFrequencyData(buf);

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const mid = h / 2;
      const maxH = h * MAX_H;
      const slot = w / barCount;
      const barW = Math.max(2, slot * BAR_WIDTH_RATIO);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = BAR_COLOR;

      for (let i = 0; i < barCount; i++) {
        const target = barTarget(i, barCount);
        heights[i] += (target - heights[i]) * SMOOTH;
        // At rest the bar collapses to a round dot (height = width); mirrored
        // around the centre line so it grows up and down.
        const bh = Math.max(barW, heights[i] * maxH);
        const x = i * slot + (slot - barW) / 2;
        const y = mid - bh / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, barW / 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [analyser, playing]);

  if (!analyser) return null;

  return (
    <div className={`waveform-strip${playing ? " active" : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className="waveform-canvas" />
    </div>
  );
}
