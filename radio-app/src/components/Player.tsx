import { useRef, useEffect, useState } from "react";
import { getStreamUrl } from "../api/radioGarden";

interface Props {
  channelId: string | null;
  stationName: string;
  playing: boolean;
  onTogglePlay: () => void;
}

export default function Player({ channelId, stationName, playing }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !channelId) return;
    setError(null);
    audio.src = getStreamUrl(channelId);
    audio.volume = 0.8;
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
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [channelId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
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
