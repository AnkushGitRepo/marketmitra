/** A tiny per-process cache with a TTL that shares one in-flight load between concurrent callers. Failed loads are not cached. */
export interface TtlCache<T> {
  get(key: string, load: () => Promise<T>): Promise<T>;
}

export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now): TtlCache<T> {
  const done = new Map<string, { readonly value: T; readonly at: number }>();
  const inFlight = new Map<string, Promise<T>>();

  return {
    async get(key, load) {
      const hit = done.get(key);
      if (hit && now() - hit.at < ttlMs) return hit.value;

      const pending = inFlight.get(key);
      if (pending) return pending;

      const started = load()
        .then((value) => {
          done.set(key, { value, at: now() });
          return value;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, started);
      return started;
    },
  };
}
