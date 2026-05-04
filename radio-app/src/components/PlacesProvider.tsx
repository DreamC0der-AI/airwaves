import { createContext, useContext } from "react";
import type { ReactNode } from "react";

// Stub PlacesProvider — full implementation in Task 8.
// Exports the public surface that App.tsx and WorldMap.tsx depend on so the tree compiles.

export interface Place {
  id: string;
  title: string;
  country: string;
  size: number;
  lat: number;
  lng: number;
}

interface PlacesContextValue {
  places: Place[];
  byId: Map<string, Place>;
  loading: boolean;
}

const PlacesContext = createContext<PlacesContextValue>({ places: [], byId: new Map(), loading: true });

export function placesGeoLookup(_placeId: string): Promise<{ lat: number; lng: number } | null> {
  return Promise.resolve(null);
}

export default function PlacesProvider({ children }: { children: ReactNode }) {
  return <PlacesContext.Provider value={{ places: [], byId: new Map(), loading: true }}>{children}</PlacesContext.Provider>;
}

export function usePlaces(): PlacesContextValue {
  return useContext(PlacesContext);
}
