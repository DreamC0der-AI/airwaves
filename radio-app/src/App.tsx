import { useState, useCallback, useEffect, useRef } from "react";
import SearchBar, { saveRecentStation } from "./components/SearchBar";
import StationList from "./components/StationList";
import Player from "./components/Player";
import Waveform from "./components/Waveform";
import WorldMap from "./components/WorldMap";
import PlacesProvider, { placesGeoLookup } from "./components/PlacesProvider";
import FavoritesPanel from "./components/FavoritesPanel";
import { getChannel } from "./api/radioGarden";
import "./App.css";

interface WikiSummary {
  title: string;
  extract: string;
  url: string | null;
}

async function fetchWikiSummary(query: string): Promise<WikiSummary | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const summaryForTitle = async (title: string): Promise<WikiSummary | null> => {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.extract || d?.type === "disambiguation") return null;
    return { title: d.title ?? title, extract: d.extract, url: d?.content_urls?.desktop?.page ?? null };
  };
  try {
    const exact = await summaryForTitle(trimmed);
    if (exact) return exact;
    const sr = await fetch(`https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(trimmed)}&limit=1`);
    if (!sr.ok) return null;
    const sd = await sr.json();
    const best = sd?.pages?.[0]?.title;
    if (!best) return null;
    return await summaryForTitle(best);
  } catch {
    return null;
  }
}

function isMobileViewport(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 640px)").matches;
}

function App() {
  const [selectedPlace, setSelectedPlace] = useState<{ id: string; name: string } | null>(null);
  const [currentChannel, setCurrentChannel] = useState<{ id: string; name: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mapPin, setMapPin] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiData, setWikiData] = useState<{
    stationName: string;
    placeName: string;
    stationWiki: WikiSummary | null;
    placeWiki: WikiSummary | null;
  } | null>(null);

  const handleSelectPlace = useCallback((placeId: string, title: string) => {
    setSelectedPlace({ id: placeId, name: title });
    if (isMobileViewport()) {
      setWikiOpen(false);
      setFavoritesOpen(false);
    }
  }, []);

  const handleSelectChannel = useCallback((channelId: string, title: string) => {
    setCurrentChannel({ id: channelId, name: title });
    setIsPlaying(true);
    setSelectedPlace(null);
    saveRecentStation(channelId, title);
  }, []);

  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);

  const handleToggleFavorites = useCallback(() => {
    setFavoritesOpen((prev) => {
      const next = !prev;
      if (next && isMobileViewport()) {
        setSelectedPlace(null);
        setWikiOpen(false);
      }
      return next;
    });
  }, []);

  // On first mount, hydrate the playing station from `?s=<channelId>` if present.
  // The channel's name comes from the upstream channel endpoint, so the URL stays
  // a clean "id only" share link.
  const hydratedFromUrlRef = useRef(false);
  useEffect(() => {
    if (hydratedFromUrlRef.current) return;
    hydratedFromUrlRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("s");
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return;
    // No `cancelled` guard: the ref above already de-dupes against StrictMode's
    // double-invoke, and a setState on a truly-unmounted root is a harmless no-op.
    (async () => {
      try {
        const data = await getChannel(id);
        const title: string = data?.data?.title ?? "Station";
        setCurrentChannel({ id, name: title });
        setIsPlaying(true);
        saveRecentStation(id, title);
      } catch {
        /* invalid id or network error — leave URL alone, user can still browse */
      }
    })();
  }, []);

  // Mirror the current channel into the URL so the page can be shared/bookmarked.
  // replaceState (not pushState) keeps the back button intuitive — it goes back
  // to the previous page, not to each station you sampled.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (currentChannel?.id) {
      if (url.searchParams.get("s") === currentChannel.id) return;
      url.searchParams.set("s", currentChannel.id);
    } else {
      if (!url.searchParams.has("s")) return;
      url.searchParams.delete("s");
    }
    window.history.replaceState({}, "", url.toString());
  }, [currentChannel?.id]);

  // Global ESC: close any open panel, in topmost-first order.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (favoritesOpen) { setFavoritesOpen(false); return; }
      if (wikiOpen) { setWikiOpen(false); return; }
      if (selectedPlace) { setSelectedPlace(null); return; }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [favoritesOpen, wikiOpen, selectedPlace]);

  const fetchingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!currentChannel?.id) {
      setMapPin(null);
      return;
    }
    const channelId = currentChannel.id;
    if (fetchingRef.current.has(channelId)) return;
    fetchingRef.current.add(channelId);

    let cancelled = false;
    (async () => {
      try {
        const channelData = await getChannel(channelId);
        const placeId = channelData?.data?.place?.id;
        if (!placeId || cancelled) return;
        const geo = await placesGeoLookup(placeId);
        if (geo && !cancelled) setMapPin({ ...geo, name: currentChannel.name });
      } catch {
        /* silent */
      } finally {
        fetchingRef.current.delete(channelId);
      }
    })();
    return () => { cancelled = true; };
  }, [currentChannel?.id, currentChannel?.name]);

  const handleWikiClick = useCallback(async () => {
    if (!currentChannel?.id) return;
    if (wikiOpen) { setWikiOpen(false); return; }
    setWikiOpen(true);
    if (isMobileViewport()) {
      setSelectedPlace(null);
      setFavoritesOpen(false);
    }
    if (wikiData && wikiData.stationName === currentChannel.name) return;
    setWikiLoading(true);
    try {
      const channelData = await getChannel(currentChannel.id);
      const stationName: string = channelData?.data?.title ?? currentChannel.name;
      const placeName: string = channelData?.data?.place?.title ?? "";
      const [stationWiki, placeWiki] = await Promise.all([
        stationName ? fetchWikiSummary(stationName) : Promise.resolve(null),
        placeName ? fetchWikiSummary(placeName) : Promise.resolve(null),
      ]);
      setWikiData({ stationName, placeName, stationWiki, placeWiki });
    } catch {
      setWikiData({ stationName: currentChannel.name, placeName: "", stationWiki: null, placeWiki: null });
    } finally {
      setWikiLoading(false);
    }
  }, [currentChannel?.id, currentChannel?.name, wikiOpen, wikiData?.stationName]);

  const sheetOpen = !!selectedPlace || wikiOpen || favoritesOpen;

  return (
    <PlacesProvider>
      <div className={`app no-sidebar${sheetOpen ? " sheet-open" : ""}`}>
        <div className="main-content full-width">
          <WorldMap pin={mapPin} onSelectPlace={handleSelectPlace} />

          <Waveform analyser={analyser} playing={isPlaying} />

          <div className="floating-top-panel">
            <SearchBar
              onSelectPlace={handleSelectPlace}
              onSelectChannel={handleSelectChannel}
              currentChannelId={currentChannel?.id ?? null}
              currentChannelName={currentChannel?.name ?? ""}
              isPlaying={isPlaying}
              onTogglePlay={togglePlay}
              onWikiClick={handleWikiClick}
              wikiOpen={wikiOpen}
              favoritesOpen={favoritesOpen}
              onToggleFavorites={handleToggleFavorites}
            />
          </div>

          {selectedPlace && (
            <div className="floating-station-list">
              <StationList
                placeId={selectedPlace.id}
                placeName={selectedPlace.name}
                onSelectStation={handleSelectChannel}
                onClose={() => setSelectedPlace(null)}
              />
            </div>
          )}

          <FavoritesPanel
            open={favoritesOpen}
            onClose={() => setFavoritesOpen(false)}
            onSelectStation={handleSelectChannel}
          />

          {wikiOpen && currentChannel && (
            <div className="floating-wiki-panel">
              <div className="wiki-card">
                <div className="wiki-header">
                  <strong>Wiki</strong>
                  <button className="wiki-close" onClick={() => setWikiOpen(false)}>×</button>
                </div>
                {wikiLoading && <div className="wiki-loading">Loading…</div>}
                {!wikiLoading && wikiData?.stationWiki && (
                  <div className="wiki-section">
                    <h4>{wikiData.stationWiki.title}</h4>
                    <p>{wikiData.stationWiki.extract}</p>
                    {wikiData.stationWiki.url && <a href={wikiData.stationWiki.url} target="_blank" rel="noreferrer">Open article</a>}
                  </div>
                )}
                {!wikiLoading && wikiData?.placeWiki && (
                  <div className="wiki-section">
                    <h4>{wikiData.placeWiki.title}</h4>
                    <p>{wikiData.placeWiki.extract}</p>
                    {wikiData.placeWiki.url && <a href={wikiData.placeWiki.url} target="_blank" rel="noreferrer">Open article</a>}
                  </div>
                )}
                {!wikiLoading && !wikiData?.stationWiki && !wikiData?.placeWiki && (
                  <div className="wiki-empty">No Wikipedia summary found for this station or place.</div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "none" }}>
            <Player
              channelId={currentChannel?.id ?? null}
              stationName={currentChannel?.name ?? ""}
              playing={isPlaying}
              onTogglePlay={togglePlay}
              onPlayingChange={setIsPlaying}
              onAnalyser={setAnalyser}
            />
          </div>
        </div>
      </div>
    </PlacesProvider>
  );
}

export default App;
