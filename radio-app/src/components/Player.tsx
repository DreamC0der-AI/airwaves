import { useRef, useEffect, useState, useCallback } from "react";
import { getStreamUrl } from "../api/radioGarden";

interface Props {
  channelId: string | null;
  stationName: string;
  playing: boolean;
  onTogglePlay: () => void;
  onPlayingChange?: (playing: boolean) => void;
  onAnalyser?: (analyser: AnalyserNode) => void;
}

export default function Player({ channelId, stationName, playing, onPlayingChange, onAnalyser }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The Web Audio graph is built once per audio element (a MediaElementSource
  // can only be created once). This ref guards against re-creation.
  const graphRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);

  // Build the analyser graph lazily, inside the play path (a user gesture), so
  // the AudioContext is allowed to start. Any failure is swallowed: audio still
  // plays, the waveform simply never appears.
  const ensureGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || graphRef.current) return;
    try {
      const AC: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      graphRef.current = { ctx, analyser };
      onAnalyser?.(analyser);
    } catch {
      /* analysis unavailable — playback is unaffected */
    }
  }, [onAnalyser]);

  // Mirror the audio element's real state up to the parent — this catches
  // browser autoplay rejection, OS media-key pauses, network drops, etc.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !onPlayingChange) return;
    const onPlay = () => onPlayingChange(true);
    const onPause = () => onPlayingChange(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [onPlayingChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !channelId) return;
    setError(null);
    // crossOrigin must be set before src so the proxied (ACAO: *) stream loads
    // as CORS-clean, which is what lets the AnalyserNode read real samples.
    audio.crossOrigin = "anonymous";
    audio.src = getStreamUrl(channelId);
    audio.volume = 0.8;
    ensureGraph();
    graphRef.current?.ctx.resume().catch(() => { /* resumed lazily on next play */ });
    audio.play().catch((err: DOMException | Error) => {
      const reason =
        err instanceof DOMException
          ? err.name === "NotAllowedError"
            ? "Playback was blocked by the browser. Click play to start."
            : err.name === "NotSupportedError"
              ? "This stream couldn't be loaded — it may be offline."
              : `Playback error: ${err.message}`
          : `Playback error: ${err.message}`;
      setError(reason);
      // play() rejection doesn't fire a 'pause' event (audio never moved off paused),
      // so explicitly tell the parent we aren't playing.
      onPlayingChange?.(false);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [channelId, onPlayingChange, ensureGraph]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) graphRef.current?.ctx.resume().catch(() => { /* no-op */ });
    if (playing && audio.paused && audio.src) {
      audio.play().catch(() => { /* error already surfaced via load handler */ });
    } else if (!playing && !audio.paused) {
      audio.pause();
    }
  }, [playing]);

  if (!channelId) {
    return (
      <div className="player empty">
        <audio ref={audioRef} />
        <p>Select a station to start listening</p>
      </div>
    );
  }

  return (
    <div className="player">
      <audio ref={audioRef} />
      <div className="player-info">
        <span className="now-playing">{playing ? "NOW PLAYING" : "PAUSED"}</span>
        <span className="station-title">{stationName}</span>
        {error && <span className="player-error">{error}</span>}
      </div>
    </div>
  );
}
