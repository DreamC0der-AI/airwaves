import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { usePlaces } from "./PlacesProvider";

interface Pin {
  lat: number;
  lng: number;
  name: string;
}

interface Props {
  pin: Pin | null;
  onSelectPlace: (placeId: string, title: string) => void;
}

const pinIcon = L.divIcon({
  className: "map-pin-icon",
  html: `<div class="pin-dot"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export default function WorldMap({ pin, onSelectPlace }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const onSelectRef = useRef(onSelectPlace);
  const { places } = usePlaces();

  // Keep latest callback in a ref so the cluster effect doesn't rebuild on every render.
  useEffect(() => { onSelectRef.current = onSelectPlace; }, [onSelectPlace]);

  // Initialise map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      zoomControl: false,
      attributionControl: false,
      minZoom: 2,
      maxZoom: 12,
      worldCopyJump: true,
      wheelPxPerZoomLevel: 180,
      wheelDebounceTime: 40,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Render places as a clustered CircleMarker layer once `places` is loaded.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || places.length === 0) return;

    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
      clusterRef.current = null;
    }

    const cluster = L.markerClusterGroup({
      disableClusteringAtZoom: 7,
      maxClusterRadius: 50,
      chunkedLoading: true,
    });

    for (const p of places) {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 3,
        weight: 0,
        fillColor: "#4f46e5",
        fillOpacity: 0.55,
      });
      marker.bindTooltip(p.title, { direction: "top", offset: [0, -2] });
      marker.on("click", () => onSelectRef.current(p.id, p.title));
      cluster.addLayer(marker);
    }

    map.addLayer(cluster);
    clusterRef.current = cluster;

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
    };
  }, [places]);

  // Selected-station pin overlay.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    if (pin) {
      const marker = L.marker([pin.lat, pin.lng], { icon: pinIcon }).addTo(map);
      markerRef.current = marker;
      map.flyTo([pin.lat, pin.lng], 6, { duration: 1.5 });
    }
  }, [pin]);

  return <div ref={containerRef} className="world-map" />;
}
