import { useEffect, useState, useRef } from "react";
import { getPlace } from "../api/radioGarden";
import FavoriteButton from "./FavoriteButton";

interface StationItem {
  page: {
    url: string;
    title: string;
    subtitle?: string;
    place?: { id: string; title: string };
    country?: { id: string; title: string };
  };
}

interface Props {
  placeId: string;
  placeName: string;
  onSelectStation: (channelId: string, title: string) => void;
  onClose: () => void;
}

function channelIdFromUrl(url: string): string {
  const parts = url.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export default function StationList({ placeId, placeName, onSelectStation, onClose }: Props) {
  const [stations, setStations] = useState<StationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    getPlace(placeId, controller.signal)
      .then((data) => {
        const content = data?.data?.content ?? [];
        const allStations: StationItem[] = [];
        for (const section of content) {
          if (section.items) {
            allStations.push(...section.items);
          }
        }
        setStations(allStations);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStations([]);
      })
      .finally(() => setLoading(false));

    return () => {
      controller.abort();
    };
  }, [placeId]);

  const handleClick = (station: StationItem) => {
    const id = channelIdFromUrl(station.page.url);
    onSelectStation(id, station.page.title);
  };

  if (loading) {
    return <div className="station-list-loading">Loading stations...</div>;
  }

  return (
    <div className="station-list">
      <div className="station-list-header">
        <div>
          <h3>{placeName}</h3>
          <p className="station-count">{stations.length} stations</p>
        </div>
        <button
          className="station-list-close"
          onClick={onClose}
          aria-label="Close station list"
          title="Close"
        >×</button>
      </div>
      <ul>
        {stations.map((station, i) => {
          const id = channelIdFromUrl(station.page.url);
          return (
            <li key={`${id}-${i}`} onClick={() => handleClick(station)}>
              <FavoriteButton
                channelId={id}
                channelName={station.page.title}
                className="row-fav"
              />
              <div className="station-info">
                <span className="station-name">{station.page.title}</span>
                {station.page.country && (
                  <span className="station-subtitle">{station.page.country.title}</span>
                )}
              </div>
              <svg className="play-icon" viewBox="0 0 24 24" width="20" height="20">
                <polygon points="6,3 20,12 6,21" fill="currentColor" />
              </svg>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
