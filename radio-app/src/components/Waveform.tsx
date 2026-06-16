import { useEffect, useRef } from "react";

interface Props {
  analyser: AnalyserNode | null;
  playing: boolean;
}

const NEON = "#7a5cff";
// How flat the real signal can be (deviation from the 127.5 midline, in 0-255
// byte units) before we treat the stream as "not analysable" and fall back to a
// generated ripple. ~2 is just above the noise floor of a silent buffer.
const FLAT_THRESHOLD = 2.2;
const FLAT_HOLD_MS = 1000;

/**
 * A neon flowing waveform pinned to the bottom of the screen. While `playing`
 * and given an `analyser`, it draws the live audio's time-domain shape. If the
 * stream is audible but not analysable (some SHOUTcast/ICY redirects read as
 * flat), it falls back to a synthetic ripple so there is always some motion.
 */
export default function Waveform({ analyser, playing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !playing) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buf = analyser ? new Uint8Array(analyser.fftSize) : null;
    let raf = 0;
    // Timestamp (perf clock) since which the signal has looked flat; 0 = not flat.
    let flatSince = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Fill `out` (length = samples) with values in [-1, 1].
    const sampleReal = (out: Float32Array): boolean => {
      if (!analyser || !buf) return false;
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      const step = buf.length / out.length;
      for (let i = 0; i < out.length; i++) {
        const v = (buf[Math.floor(i * step)] - 127.5) / 127.5;
        out[i] = v;
        const dev = Math.abs(buf[Math.floor(i * step)] - 127.5);
        if (dev > peak) peak = dev;
      }
      return peak >= FLAT_THRESHOLD;
    };

    const sampleSynthetic = (out: Float32Array, t: number) => {
      const phase = t * 0.0024;
      for (let i = 0; i < out.length; i++) {
        const x = i / out.length;
        out[i] =
          0.5 * Math.sin(x * Math.PI * 6 + phase) +
          0.28 * Math.sin(x * Math.PI * 14 - phase * 1.7);
      }
    };

    const SAMPLES = 220;
    const data = new Float32Array(SAMPLES);

    const draw = (t: number) => {
      // Real audio when it has signal; fall back to a generated ripple if the
      // stream stays flat (audible but not analysable) for FLAT_HOLD_MS.
      if (sampleReal(data)) {
        flatSince = 0;
      } else {
        if (!flatSince) flatSince = t;
        if (t - flatSince >= FLAT_HOLD_MS) sampleSynthetic(data, t);
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const mid = h / 2;
      const amp = h * 0.42;
      ctx.clearRect(0, 0, w, h);

      const trace = () => {
        ctx.beginPath();
        for (let i = 0; i < SAMPLES; i++) {
          const x = (i / (SAMPLES - 1)) * w;
          const y = mid + data[i] * amp;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      // Wide faint bloom pass, then a crisp core pass — the layered glow.
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = NEON;
      ctx.shadowColor = NEON;

      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 6;
      ctx.shadowBlur = 18;
      trace();

      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      trace();

      ctx.globalAlpha = 1;
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
