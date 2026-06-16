import { useEffect, useRef } from "react";

interface Props {
  analyser: AnalyserNode | null;
  playing: boolean;
}

const NEON = "#7a5cff";

// iOS9 Siri-style rendering: a few layered sine curves whose *amplitude* is
// driven by a heavily-smoothed loudness envelope (not per-sample data), so the
// wave breathes with the music instead of twitching. Each curve is tapered by a
// bell envelope so it bulges in the middle and fades to nothing at the edges.
// Reference: kopiro/siriwave (src/ios9-curve.ts).
const GRAPH_X = 2; // x runs from -GRAPH_X..+GRAPH_X across the width
const ATT_FACTOR = 4; // bell-envelope sharpness
const POINTS = 100; // samples per curve stroke

// Per-curve character: relative amplitude, wave number, phase speed (sign =
// direction), and stroke alpha. Layered with additive blending for the glow.
const CURVES = [
  { amp: 1.0, k: 2.4, speed: 0.85, alpha: 0.95, width: 2.4 },
  { amp: 0.72, k: 3.2, speed: -1.05, alpha: 0.55, width: 1.7 },
  { amp: 0.5, k: 1.7, speed: 0.6, alpha: 0.4, width: 1.4 },
];

const att = (x: number) => Math.pow(ATT_FACTOR / (ATT_FACTOR + x * x), ATT_FACTOR);

export default function Waveform({ analyser, playing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !playing) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buf = analyser ? new Uint8Array(analyser.fftSize) : null;
    const phases = CURVES.map((_, i) => i * 1.3);
    let level = 0.06; // smoothed loudness envelope (also the quiet-idle floor)
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // RMS loudness of the time-domain signal, normalised to ~0..1.
    const loudness = (): number => {
      if (!analyser || !buf) return 0;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / buf.length);
    };

    const draw = () => {
      // Smooth the envelope hard so size changes are gentle, and keep a small
      // floor so the wave always drifts (vibe even on quiet/flat streams).
      const target = Math.min(1, Math.max(0.06, loudness() * 3.2));
      level += (target - level) * 0.05;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const mid = h * 0.5;
      const heightMax = h * 0.5 * 0.8;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = NEON;
      ctx.shadowColor = NEON;

      CURVES.forEach((c, ci) => {
        phases[ci] = (phases[ci] + c.speed * 0.04) % (Math.PI * 2);
        ctx.globalAlpha = c.alpha;
        ctx.lineWidth = c.width;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        for (let i = 0; i < POINTS; i++) {
          const px = i / (POINTS - 1);
          const x = -GRAPH_X + px * 2 * GRAPH_X;
          const y = mid - level * heightMax * c.amp * att(x) * Math.sin(c.k * x - phases[ci]);
          if (i === 0) ctx.moveTo(px * w, y);
          else ctx.lineTo(px * w, y);
        }
        ctx.stroke();
      });

      ctx.restore();
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
