import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Pin {
  lat: number;
  lng: number;
  name: string;
}

interface Props {
  pin: Pin | null;
  resizeToken?: number;
}

const pinIcon = L.divIcon({
  className: "map-pin-icon",
  html: `<div class="pin-dot"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export default function WorldMap({ pin, resizeToken }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

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

  useEffect(() => {
    if (resizeToken === undefined) return;
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [resizeToken]);

  return <div ref={containerRef} className="world-map" />;
}
