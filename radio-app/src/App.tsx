import { useState, useCallback, useEffect, useRef } from "react";
import SearchBar from "./components/SearchBar";
import { saveRecentStation } from "./components/SearchBar";
import StationList from "./components/StationList";
import Player from "./components/Player";
import TranslationPanel from "./components/TranslationPanel";
import WorldMap from "./components/WorldMap";
import { getChannel } from "./api/radioGarden";
import "./App.css";

const LANGUAGES = [
  "English", "Chinese", "Japanese", "Korean", "Spanish", "French",
  "German", "Portuguese", "Russian", "Arabic", "Hindi", "Thai",
  "Vietnamese", "Italian", "Dutch", "Turkish", "Polish", "Swedish",
  "Indonesian", "Malay",
];

function App() {
  const [selectedPlace, setSelectedPlace] = useState<{ id: string; name: string } | null>(null);
  const [currentChannel, setCurrentChannel] = useState<{ id: string; name: string } | null>(null);
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);
  const [sourceNode, setSourceNode] = useState<MediaElementAudioSourceNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mapPin, setMapPin] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem("target_lang") || "English");
  const [mapResizeToken, setMapResizeToken] = useState(0);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiData, setWikiData] = useState<{
    stationName: string;
    placeName: string;
    stationWiki: { title: string; extract: string; url: string | null } | null;
    placeWiki: { title: string; extract: string; url: string | null } | null;
  } | null>(null);
  const geoCache = useRef(new Map<string, { lat: number; lng: number }>());
  const fetchingRef = useRef(new Set<string>());

  const handleSelectPlace = useCallback((placeId: string, title: string) => {
    setSelectedPlace({ id: placeId, name: title });
  }, []);

  const handleSelectChannel = useCallback((channelId: string, title: string) => {
    setCurrentChannel({ id: channelId, name: title });
    setIsPlaying(true);
    setSelectedPlace(null);
    saveRecentStation(channelId, title);
  }, []);

  const handleAudioContext = useCallback((ctx: AudioContext, source: MediaElementAudioSourceNode) => {
    setAudioCtx(ctx);
    setSourceNode(source);
    setIsPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  // Fetch geo coordinates when channel changes
  useEffect(() => {
    if (!currentChannel?.id) {
      setMapPin(null);
      return;
    }

    const channelId = currentChannel.id;
    const cache = geoCache.current;
    const fetching = fetchingRef.current;

    if (cache.has(channelId)) {
      const geo = cache.get(channelId)!;
      setMapPin({ ...geo, name: currentChannel.name });
      return;
    }

    if (fetching.has(channelId)) return;
    fetching.add(channelId);

    let cancelled = false;
    (async () => {
      try {
        const channelData = await getChannel(channelId);
        const placeId = channelData?.data?.place?.id;
        if (!placeId || cancelled) return;

        if (cache.has(placeId)) {
          const geo = cache.get(placeId)!;
          cache.set(channelId, geo);
          if (!cancelled) setMapPin({ ...geo, name: currentChannel.name });
          return;
        }

        const resp = await fetch(`/api/geo/${placeId}`);
        if (!resp.ok || cancelled) return;
        const geo = await resp.json();
        cache.set(placeId, geo);
        cache.set(channelId, geo);
        if (!cancelled) setMapPin({ ...geo, name: currentChannel.name });
      } catch {
        // Silently fail
      } finally {
        fetching.delete(channelId);
      }
    })();

    return () => { cancelled = true; };
  }, [currentChannel?.id, currentChannel?.name]);

  const handleLangChange = (lang: string) => {
    setTargetLang(lang);
    localStorage.setItem("target_lang", lang);
  };

  const handleWikiClick = useCallback(async () => {
    if (!currentChannel?.id) return;
    if (wikiOpen) {
      setWikiOpen(false);
      return;
    }
    setWikiOpen(true);
    if (wikiData && wikiData.stationName === currentChannel.name) return;

    setWikiLoading(true);
    try {
      const resp = await fetch(`/api/wiki/${currentChannel.id}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to load wiki");
      setWikiData(data);
    } catch {
      setWikiData({
        stationName: currentChannel.name,
        placeName: "",
        stationWiki: null,
        placeWiki: null,
      });
    } finally {
      setWikiLoading(false);
    }
  }, [currentChannel?.id, currentChannel?.name, wikiOpen, wikiData?.stationName]);

  return (
    <div className="app no-sidebar">
      <div className="main-content full-width">
        <WorldMap pin={mapPin} resizeToken={mapResizeToken} />

        <div className="floating-top-panel">
          <SearchBar
            onSelectPlace={handleSelectPlace}
            onSelectChannel={handleSelectChannel}
            currentChannelId={currentChannel?.id ?? null}
            currentChannelName={currentChannel?.name ?? ""}
            isPlaying={isPlaying}
            targetLang={targetLang}
            translating={translating}
            onTogglePlay={togglePlay}
            onToggleTranslate={() => setTranslating(t => !t)}
            onLangChange={handleLangChange}
            onWikiClick={handleWikiClick}
            wikiOpen={wikiOpen}
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

        {/* Hidden Player keeps audio alive */}
        <div style={{ display: "none" }}>
          <Player
            channelId={currentChannel?.id ?? null}
            stationName={currentChannel?.name ?? ""}
            playing={isPlaying}
            onTogglePlay={togglePlay}
            onAudioContext={handleAudioContext}
          />
        </div>

        {/* Translation engine + transcript overlay */}
        <TranslationPanel
          audioContext={audioCtx}
          sourceNode={sourceNode}
          isPlaying={isPlaying}
          stationName={currentChannel?.name ?? ""}
          channelId={currentChannel?.id ?? null}
          translating={translating}
          onTranslatingChange={setTranslating}
          targetLang={targetLang}
        />
      </div>
    </div>
  );
}

export default App;
