import { describe, it, expect, beforeEach } from "vitest";
import {
  loadFavorites,
  isFavorite,
  toggleFavorite,
  removeFavorite,
  subscribe,
  CACHE_KEY,
  MAX_FAVORITES,
  _resyncFromStorage,
} from "./favorites";

describe("favorites storage", () => {
  beforeEach(() => {
    localStorage.removeItem(CACHE_KEY);
    _resyncFromStorage();
  });

  it("loadFavorites returns [] when nothing stored", () => {
    expect(loadFavorites()).toEqual([]);
  });

  it("toggleFavorite adds when missing, returns updated list", () => {
    const list = toggleFavorite("abc", "Tokyo FM");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "abc", name: "Tokyo FM" });
    expect(typeof list[0].addedAt).toBe("number");
    expect(loadFavorites()).toEqual(list);
  });

  it("toggleFavorite removes when already present", () => {
    toggleFavorite("abc", "Tokyo FM");
    const list = toggleFavorite("abc", "Tokyo FM");
    expect(list).toEqual([]);
  });

  it("isFavorite reflects current state", () => {
    expect(isFavorite("abc")).toBe(false);
    toggleFavorite("abc", "Tokyo FM");
    expect(isFavorite("abc")).toBe(true);
    toggleFavorite("abc", "Tokyo FM");
    expect(isFavorite("abc")).toBe(false);
  });

  it("removeFavorite is idempotent", () => {
    toggleFavorite("abc", "Tokyo FM");
    removeFavorite("abc");
    removeFavorite("abc");
    expect(loadFavorites()).toEqual([]);
  });

  it("caps at MAX_FAVORITES — oldest entry is dropped", () => {
    for (let i = 0; i < MAX_FAVORITES + 5; i++) {
      toggleFavorite(`id-${i}`, `Station ${i}`);
    }
    const list = loadFavorites();
    expect(list).toHaveLength(MAX_FAVORITES);
    expect(list[0].id).toBe(`id-${MAX_FAVORITES + 4}`);
    expect(list.find((f) => f.id === "id-0")).toBeUndefined();
  });

  it("schema-version mismatch is treated as empty", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 999, items: [{ id: "x", name: "X", addedAt: 1 }] }));
    _resyncFromStorage();
    expect(loadFavorites()).toEqual([]);
  });

  it("subscribe fires on toggle and unsubscribes cleanly", () => {
    let count = 0;
    const off = subscribe(() => { count++; });
    toggleFavorite("a", "A");
    toggleFavorite("b", "B");
    expect(count).toBe(2);
    off();
    toggleFavorite("c", "C");
    expect(count).toBe(2);
  });
});
