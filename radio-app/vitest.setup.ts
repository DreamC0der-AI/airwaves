// In some Vitest+jsdom combinations, globalThis.localStorage is a bare {} stub
// without Storage methods. Provide a deterministic in-memory Storage shim.
class MemoryStorage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  key(i: number): string | null { return Array.from(this.store.keys())[i] ?? null; }
}

const ls = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: ls, writable: true, configurable: true });
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", { value: ls, writable: true, configurable: true });
}
