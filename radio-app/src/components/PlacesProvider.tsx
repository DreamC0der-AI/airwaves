import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { type Place, fetchPlacesFresh, hydrateFromCache, persistToCache } from "../api/places";

export type { Place };

interface PlacesContextValue {
  places: Place[];
  byId: Map<string, Place>;
  loading: boolean;
}

const PlacesContext = createContext<PlacesContextValue>({ places: [], byId: new Map(), loading: true });

let latestById: Map<string, Place> = new Map();
const pending: Array<(m: Map<string, Place>) => void> = [];

export function placesGeoLookup(placeId: string): Promise<{ lat: number; lng: number } | null> {
  if (latestById.size > 0) {
    const p = latestById.get(placeId);
    return Promise.resolve(p ? { lat: p.lat, lng: p.lng } : null);
  }
  return new Promise((resolve) => {
    pending.push((m) => {
      const p = m.get(placeId);
      resolve(p ? { lat: p.lat, lng: p.lng } : null);
    });
  });
}

export default function PlacesProvider({ children }: { children: ReactNode }) {
  const [places, setPlaces] = useState<Place[]>(() => hydrateFromCache()?.places ?? []);
  const [loading, setLoading] = useState(() => places.length === 0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fresh = await fetchPlacesFresh();
        if (cancelled) return;
        if (fresh.length > 0) {
          setPlaces(fresh);
          persistToCache(fresh, null);
        }
      } catch {
        /* keep cached value */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, Place>();
    for (const p of places) m.set(p.id, p);
    return m;
  }, [places]);

  useEffect(() => {
    latestById = byId;
    if (byId.size > 0) {
      while (pending.length > 0) {
        const cb = pending.shift();
        cb?.(byId);
      }
    }
  }, [byId]);

  const value = useMemo<PlacesContextValue>(() => ({ places, byId, loading }), [places, byId, loading]);
  return <PlacesContext.Provider value={value}>{children}</PlacesContext.Provider>;
}

export function usePlaces(): PlacesContextValue {
  return useContext(PlacesContext);
}
