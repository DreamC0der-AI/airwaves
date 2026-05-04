import { useState, useCallback, useRef, useEffect } from "react";
import { searchStations } from "../api/radioGarden";

interface SearchHit {
  _source: {
    type: "place" | "channel" | "country";
    page: {
      url: string;
      title: string;
      subtitle?: string;
      map?: string;
    };
  };
}

export interface RecentStation {
  id: string;
  name: string;
  playedAt: number;
}

const STORAGE_KEY = "recent_stations";
const MAX_RECENT = 10;

export function loadRecentStations(): RecentStation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveRecentStation(id: string, name: string): void {
  const list = loadRecentStations().filter((s) => s.id !== id);
  list.unshift({ id, name, playedAt: Date.now() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

interface Props {
  onSelectPlace: (placeId: string, title: string) => void;
  onSelectChannel: (channelId: string, title: string) => void;
  currentChannelId: string | null;
  currentChannelName: string;
  isPlaying: boolean;
  targetLang: string;
  translating: boolean;
  onTogglePlay: () => void;
  onToggleTranslate: () => void;
  onLangChange: (lang: string) => void;
  onWikiClick: () => void;
  wikiOpen: boolean;
}

const LANGUAGES = [
  "English", "Chinese", "Japanese", "Korean", "Spanish", "French",
  "German", "Portuguese", "Russian", "Arabic", "Hindi", "Thai",
  "Vietnamese", "Italian", "Dutch", "Turkish", "Polish", "Swedish",
  "Indonesian", "Malay",
];

export default function SearchBar({ onSelectPlace, onSelectChannel, currentChannelId, currentChannelName, isPlaying, targetLang, translating, onTogglePlay, onToggleTranslate, onLangChange, onWikiClick, wikiOpen }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<RecentStation[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(loadRecentStations());
  }, [currentChannelId]);

  useEffect(() => {
    if (!focused) {
      setQuery(currentChannelName || "");
    }
  }, [currentChannelName, focused]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
        setResults([]);
        if (!query.trim()) {
          setQuery(currentChannelName || "");
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [currentChannelName, query]);

  const showRecent = focused && !query.trim() && results.length === 0 && recent.length > 0;

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setError(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!value.trim()) {
      setResults([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const data = await searchStations(value, controller.signal);
        const hits: SearchHit[] = data?.hits?.hits ?? [];
        setResults(hits);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const handleSelect = (hit: SearchHit) => {
    const { type, page } = hit._source;
    const url = page.url;
    const title = page.title;
    const parts = url.split("/").filter(Boolean);
    const id = parts[parts.length - 1];
    if (type === "channel") onSelectChannel(id, title);
    else if (type === "place") onSelectPlace(id, title);
    setResults([]);
    setQuery(title);
    setFocused(false);
    setError(null);
  };

  const handleRecentSelect = (station: RecentStation) => {
    onSelectChannel(station.id, station.name);
    setQuery(station.name);
    setFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, hit: SearchHit) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(hit);
    } else if (e.key === "Escape") {
      setResults([]);
      setFocused(false);
      setQuery(currentChannelName || "");
    }
  };

  const handleRecentKeyDown = (e: React.KeyboardEvent, station: RecentStation) => {
    if (e.key === "Enter") handleRecentSelect(station);
    else if (e.key === "Escape") setFocused(false);
  };

  const handleClearRecent = () => {
    localStorage.removeItem(STORAGE_KEY);
    setRecent([]);
  };

  const formatTime = (ts: number): string => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  return (
    <div className="search-bar" ref={containerRef}>
      <div className="sidebar-controls-row">
        <div className="search-input-wrapper station-mode">
          <svg className="search-icon" viewBox="0 0 24 24" width="18" height="18">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => {
              setFocused(true);
              if (query === currentChannelName) setQuery("");
            }}
            placeholder="Search cities, stations, countries..."
          />
          {loading && <span className="search-spinner" />}
        </div>
        <button className="ctrl-btn play" onClick={onTogglePlay} title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? (
            <svg viewBox="0 0 24 24" width="18" height="18">
              <rect x="5" y="3" width="5" height="18" rx="1" fill="currentColor" />
              <rect x="14" y="3" width="5" height="18" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18">
              <polygon points="6,3 20,12 6,21" fill="currentColor" />
            </svg>
          )}
        </button>
        <button className={`wiki-btn ${wikiOpen ? "active" : ""}`} onClick={onWikiClick} title="Wiki">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 00-3 3V4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M8 4v16" fill="none" stroke="currentColor" strokeWidth="2"/>
            <path d="M11 8h5M11 12h5M11 16h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
        <button className={`ctrl-btn translate ${translating ? "active" : ""}`} onClick={onToggleTranslate} title={translating ? "Stop Translation" : "Start Translation"}>
          {translating ? (
            <svg viewBox="0 0 24 24" width="16" height="16"><rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" fill="currentColor" /></svg>
          )}
        </button>
        <div className="ctrl-lang compact">
          <select value={targetLang} onChange={(e) => onLangChange(e.target.value)} disabled={translating}>
            {LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="search-error">{error}</div>}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((hit) => (
            <li key={hit._source.page.url} tabIndex={0} onClick={() => handleSelect(hit)} onKeyDown={(e) => handleKeyDown(e, hit)}>
              <span className={`type-badge ${hit._source.type}`}>{hit._source.type}</span>
              <div>
                <strong>{hit._source.page.title}</strong>
                {hit._source.page.subtitle && <span className="subtitle">{hit._source.page.subtitle}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showRecent && (
        <div className="search-results recent-list">
          <div className="recent-header">
            <span>Recently Played</span>
            <button className="recent-clear" onClick={handleClearRecent}>Clear</button>
          </div>
          <ul>
            {recent.map((station) => (
              <li key={station.id} tabIndex={0} onClick={() => handleRecentSelect(station)} onKeyDown={(e) => handleRecentKeyDown(e, station)}>
                <svg className="recent-icon" viewBox="0 0 24 24" width="16" height="16"><polygon points="6,3 20,12 6,21" fill="currentColor" /></svg>
                <div>
                  <strong>{station.name}</strong>
                  <span className="subtitle">{formatTime(station.playedAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
