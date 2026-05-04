import { describe, it, expect, beforeEach } from "vitest";
import { normaliseRawPlaces, hydrateFromCache, persistToCache, CACHE_KEY } from "./places";

describe("normaliseRawPlaces", () => {
  it("extracts id, title, lat, lng from the radio.garden places shape", () => {
    const upstream = {
      data: {
        list: [
          { id: "abc", title: "Tokyo", country: "JP", size: 200, geo: [139.69, 35.68] },
          { id: "def", title: "Lima", country: "PE", size: 30, geo: [-77.04, -12.04] },
          { id: "ghi", title: "NoGeo", country: "??", size: 1 },
        ],
      },
    };
    const out = normaliseRawPlaces(upstream);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: "abc", title: "Tokyo", country: "JP", size: 200, lat: 35.68, lng: 139.69 });
    expect(out[1].id).toBe("def");
  });

  it("returns empty array on malformed input", () => {
    expect(normaliseRawPlaces(null)).toEqual([]);
    expect(normaliseRawPlaces({})).toEqual([]);
    expect(normaliseRawPlaces({ data: { list: "nope" } })).toEqual([]);
  });
});

describe("places cache", () => {
  beforeEach(() => {
    localStorage.removeItem(CACHE_KEY);
  });

  it("returns null when nothing cached", () => {
    expect(hydrateFromCache()).toBeNull();
  });

  it("round-trips through localStorage", () => {
    const places = [{ id: "x", title: "X", country: "C", size: 1, lat: 0, lng: 0 }];
    persistToCache(places, "etag-1");
    const out = hydrateFromCache();
    expect(out).not.toBeNull();
    expect(out!.places).toEqual(places);
    expect(out!.etag).toBe("etag-1");
  });

  it("ignores cache when the schema version changes", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 999, places: [], etag: null }));
    expect(hydrateFromCache()).toBeNull();
  });
});
