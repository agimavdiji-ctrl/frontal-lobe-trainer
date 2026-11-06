/** Minimal async key-value contract (AsyncStorage-compatible). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createMemoryKeyValueStore(initial: Record<string, string> = {}): KeyValueStore & {
  dump(): Record<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    async getItem(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
    dump: () => Object.fromEntries(data),
  };
}
