import { useEffect, useState, useSyncExternalStore } from "react";
import { isFavorite, toggleFavorite, loadFavorites, subscribe } from "../api/favorites";
import type { Favorite } from "../api/favorites";

export function useFavorites(): Favorite[] {
  return useSyncExternalStore(
    (cb) => subscribe(cb),
    () => loadFavorites(),
    () => [],
  );
}

interface Props {
  channelId: string | null;
  channelName: string;
  size?: number;
  className?: string;
}

export default function FavoriteButton({ channelId, channelName, size = 18, className }: Props) {
  const favs = useFavorites();
  const [pulse, setPulse] = useState(false);
  const active = !!channelId && favs.some((f) => f.id === channelId);
  const disabled = !channelId;

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 220);
    return () => clearTimeout(t);
  }, [pulse]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!channelId) return;
    toggleFavorite(channelId, channelName);
    setPulse(true);
  };

  return (
    <button
      type="button"
      className={`fav-btn ${active ? "active" : ""} ${pulse ? "pulse" : ""} ${className ?? ""}`}
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      title={active ? "Remove from favorites" : "Add to favorites"}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path
          d="M12 21s-7.5-4.6-9.5-9.1C1.1 8.6 3 5 6.5 5c2 0 3.4 1.1 4.3 2.6h.4C12.1 6.1 13.5 5 15.5 5 19 5 20.9 8.6 19.5 11.9 17.5 16.4 12 21 12 21z"
          fill={active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
