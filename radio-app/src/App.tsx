import { useState, useCallback, useEffect, useRef } from "react";
import SearchBar, { saveRecentStation } from "./components/SearchBar";
import StationList from "./components/StationList";
import Player from "./components/Player";
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

function App() {
  const [selectedPlace, setSelectedPlace] = useState<{ id: string; name: string } | null>(null);
  const [currentChannel, setCurrentChannel] = useState<{ id: string; name: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mapPin, setMapPin] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiData, setWikiData] = useState<{
    stationName: string;
    placeName: string;
    stationWiki: WikiSummary | null;
    placeWiki: WikiSummary | null;
  } | null>(null);

  const handleSelectPlace = useCallback((placeId: string, title: string) => {
    setSelectedPlace({ id: placeId, name: title });
  }, []);

  const handleSelectChannel = useCallback((channelId: string, title: string) => {
    setCurrentChannel({ id: channelId, name: title });
    setIsPlaying(true);
    setSelectedPlace(null);
    saveRecentStation(channelId, title);
  }, []);

  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);

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

  return (
    <PlacesProvider>
      <div className="app no-sidebar">
        <div className="main-content full-width">
          <WorldMap pin={mapPin} onSelectPlace={handleSelectPlace} />

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
              onToggleFavorites={() => setFavoritesOpen((v) => !v)}
            />
          </div>

          {selectedPlace && (
            <div className="floating-station-list">
              <StationList
                placeId={selectedPlace.id}
                placeName={selectedPlace.name}
                onSelectStation={handleSelectChannel}
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
            />
          </div>
        </div>
      </div>
    </PlacesProvider>
  );
}

export default App;
