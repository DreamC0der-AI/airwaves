import { useRef, useEffect, useState } from "react";
import { getStreamUrl } from "../api/radioGarden";

interface Props {
  channelId: string | null;
  stationName: string;
  playing: boolean;
  onTogglePlay: () => void;
  onAudioContext?: (ctx: AudioContext, source: MediaElementAudioSourceNode) => void;
}

export default function Player({ channelId, stationName, playing, onTogglePlay, onAudioContext }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lazily create one AudioContext + MediaElementAudioSourceNode per audio element.
  const ensureAudioContext = (audio: HTMLAudioElement) => {
    if (ctxRef.current) {
      if (ctxRef.current.state === "suspended") {
        ctxRef.current.resume();
      }
      onAudioContext?.(ctxRef.current, sourceRef.current!);
      return;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    source.connect(ctx.destination);
    ctxRef.current = ctx;
    sourceRef.current = source;
    onAudioContext?.(ctx, source);
  };

  // Close AudioContext on unmount
  useEffect(() => {
    return () => {
      if (ctxRef.current) {
        ctxRef.current.close();
        ctxRef.current = null;
        sourceRef.current = null;
      }
    };
  }, []);

  // When channelId changes, update audio src and auto-play
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !channelId) return;

    setError(null);
    audio.src = getStreamUrl(channelId);
    audio.volume = 0.8;
    audio.play()
      .then(() => {
        ensureAudioContext(audio);
      })
      .catch((err: DOMException | Error) => {
        const reason =
          err instanceof DOMException
            ? err.name === "NotAllowedError"
              ? "Playback was blocked by the browser. Please interact with the page first."
              : err.name === "NotSupportedError"
                ? "This station stream could not be loaded. It may be offline or the format is unsupported."
                : `Playback error: ${err.message}`
            : `Playback error: ${err.message}`;
        setError(reason);
      });

    return () => {
      audio.pause();
      audio.src = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Expose audio element and control functions via ref pattern
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // When playing prop changes, sync audio
    if (playing && audio.paused && audio.src) {
      audio.play()
        .then(() => ensureAudioContext(audio))
        .catch(() => {});
    } else if (!playing && !audio.paused) {
      audio.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  if (!channelId) {
    return (
      <div className="player empty">
        <audio ref={audioRef} crossOrigin="anonymous" />
        <p>Select a station to start listening</p>
      </div>
    );
  }

  return (
    <div className="player">
      <audio ref={audioRef} crossOrigin="anonymous" />
      <div className="player-info">
        <span className="now-playing">{playing ? "NOW PLAYING" : "PAUSED"}</span>
        <span className="station-title">{stationName}</span>
        {error && <span className="player-error">{error}</span>}
      </div>
    </div>
  );
}
