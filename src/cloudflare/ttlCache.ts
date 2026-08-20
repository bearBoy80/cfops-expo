export interface TtlCacheOptions {
  force?: boolean;
}

/**
 * In-flight-promise cache with a freshness window. Concurrent callers share
 * one request, later callers within the TTL reuse the resolved value, and a
 * rejected fetch never poisons the cache window.
 */
export function createTtlCache<T, Args extends unknown[] = []>(
  ttlMs: number,
  fetcher: (...args: Args) => Promise<T>,
): {
  get(options?: TtlCacheOptions, ...args: Args): Promise<T>;
  invalidate(): void;
} {
  let cached: { at: number; promise: Promise<T> } | null = null;

  return {
    get(options?: TtlCacheOptions, ...args: Args): Promise<T> {
      const now = Date.now();
      if (!options?.force && cached && now - cached.at < ttlMs) {
        return cached.promise;
      }
      const promise = fetcher(...args);
      const entry = { at: now, promise };
      cached = entry;
      promise.catch(() => {
        if (cached === entry) {
          cached = null;
        }
      });
      return promise;
    },
    invalidate(): void {
      cached = null;
    },
  };
}

/** Same contract as {@link createTtlCache} with one entry per key. */
export function createKeyedTtlCache<
  T,
  K extends string | number = string,
  Args extends unknown[] = [],
>(
  ttlMs: number,
  fetcher: (key: K, ...args: Args) => Promise<T>,
): {
  get(key: K, options?: TtlCacheOptions, ...args: Args): Promise<T>;
  invalidate(key?: K): void;
} {
  const entries = new Map<K, { at: number; promise: Promise<T> }>();

  return {
    get(key: K, options?: TtlCacheOptions, ...args: Args): Promise<T> {
      const now = Date.now();
      // Drop expired entries rather than only overwriting the one being asked
      // for: keys derived from data (a zone set, an account list) stop being
      // requested when that data changes, and would otherwise be held for the
      // lifetime of the process.
      for (const [entryKey, entry] of entries) {
        if (now - entry.at >= ttlMs && entryKey !== key) {
          entries.delete(entryKey);
        }
      }
      const existing = entries.get(key);
      if (!options?.force && existing && now - existing.at < ttlMs) {
        return existing.promise;
      }
      const promise = fetcher(key, ...args);
      const entry = { at: now, promise };
      entries.set(key, entry);
      promise.catch(() => {
        if (entries.get(key) === entry) {
          entries.delete(key);
        }
      });
      return promise;
    },
    invalidate(key?: K): void {
      if (key === undefined) {
        entries.clear();
      } else {
        entries.delete(key);
      }
    },
  };
}
