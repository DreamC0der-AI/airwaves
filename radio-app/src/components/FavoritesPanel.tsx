import { useFavorites } from "./FavoriteButton";
import { removeFavorite } from "../api/favorites";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectStation: (channelId: string, title: string) => void;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function FavoritesPanel({ open, onClose, onSelectStation }: Props) {
  const favs = useFavorites();
  if (!open) return null;

  const handleRowClick = (id: string, name: string) => {
    onSelectStation(id, name);
    onClose();
  };

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeFavorite(id);
  };

  return (
    <div className="floating-favorites-panel">
      <div className="favorites-card">
        <div className="favorites-header">
          <strong>Favorites</strong>
          <button className="favorites-close" onClick={onClose} aria-label="Close favorites">×</button>
        </div>

        {favs.length === 0 ? (
          <div className="favorites-empty">No favorites yet. Tap ♡ next to a station to add one.</div>
        ) : (
          <ul className="favorites-list">
            {favs.map((f) => (
              <li
                key={f.id}
                className="fav-row"
                tabIndex={0}
                onClick={() => handleRowClick(f.id, f.name)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRowClick(f.id, f.name); }}
              >
                <svg className="fav-row-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M12 21s-7.5-4.6-9.5-9.1C1.1 8.6 3 5 6.5 5c2 0 3.4 1.1 4.3 2.6h.4C12.1 6.1 13.5 5 15.5 5 19 5 20.9 8.6 19.5 11.9 17.5 16.4 12 21 12 21z" fill="currentColor"/>
                </svg>
                <div className="fav-row-info">
                  <strong>{f.name}</strong>
                  <span className="fav-row-time">{formatRelative(f.addedAt)}</span>
                </div>
                <button
                  className="fav-row-remove"
                  onClick={(e) => handleRemove(e, f.id)}
                  aria-label={`Remove ${f.name} from favorites`}
                  title="Remove"
                >
                  ×
                </button>
                <svg className="fav-row-play" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <polygon points="6,3 20,12 6,21" fill="currentColor" />
                </svg>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
