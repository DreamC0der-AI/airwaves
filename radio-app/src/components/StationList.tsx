import { useEffect, useState, useRef } from "react";
import { getPlace } from "../api/radioGarden";

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
}

export default function StationList({ placeId, placeName, onSelectStation }: Props) {
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
    const parts = station.page.url.split("/").filter(Boolean);
    const id = parts[parts.length - 1]; // last segment is the channel ID
    onSelectStation(id, station.page.title);
  };

  if (loading) {
    return <div className="station-list-loading">Loading stations...</div>;
  }

  return (
    <div className="station-list">
      <h3>{placeName}</h3>
      <p className="station-count">{stations.length} stations</p>
      <ul>
        {stations.map((station) => (
          <li key={station.page.url} onClick={() => handleClick(station)}>
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
        ))}
      </ul>
    </div>
  );
}
