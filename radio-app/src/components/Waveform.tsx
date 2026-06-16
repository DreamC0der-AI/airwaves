import { useEffect, useRef } from "react";

interface Props {
  analyser: AnalyserNode | null;
  playing: boolean;
}

const NEON = "#7a5cff";

// Classic equalizer: vertical neon bars rising from a baseline, each bar mapped
// to a slice of the frequency spectrum. Bar heights are smoothed per-bar so the
// motion is lively but not flickery.
const BAR_COUNT = 56;
const GAIN = 1.9; // frequency magnitude -> height (radio audio is quiet)
const FLOOR = 0.05; // idle height so bars never fully die
const SMOOTH = 0.28; // per-bar follow speed (higher = snappier)
const SPECTRUM_USE = 0.66; // fraction of the spectrum to spread across the bars
const MAX_H = 0.82; // tallest bar as a fraction of the strip height

export default function Waveform({ analyser, playing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !playing) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buf = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const heights = new Float32Array(BAR_COUNT); // smoothed 0..1 per bar
    let raf = 0;
    let t = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Target height (0..1) for bar `i`, from an exponential slice of the spectrum
    // so bass-heavy radio still spreads across the width.
    const usable = buf ? Math.floor(buf.length * SPECTRUM_USE) : 0;
    const barTarget = (i: number): number => {
      if (!analyser || !buf) return FLOOR;
      const frac = i / (BAR_COUNT - 1);
      const idx = Math.floor(Math.pow(frac, 1.8) * (usable - 1));
      // Average a tiny window for stability.
      const a = buf[idx] ?? 0;
      const b = buf[Math.min(usable - 1, idx + 1)] ?? a;
      const v = ((a + b) / 2 / 255) * GAIN;
      // A faint idle shimmer so quiet passages still breathe.
      const idle = FLOOR + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.05 + i * 0.5));
      return Math.min(1, Math.max(idle, v));
    };

    const draw = () => {
      t += 1;
      if (buf && analyser) analyser.getByteFrequencyData(buf);

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const maxH = h * MAX_H;
      const slot = w / BAR_COUNT;
      const barW = Math.max(2, slot * 0.5);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = NEON;
      ctx.shadowColor = NEON;
      ctx.shadowBlur = 12;

      for (let i = 0; i < BAR_COUNT; i++) {
        const target = barTarget(i);
        heights[i] += (target - heights[i]) * SMOOTH;
        const bh = Math.max(2, heights[i] * maxH);
        const x = i * slot + (slot - barW) / 2;
        const y = h - bh;
        const r = Math.min(barW / 2, 4);
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, r);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
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
