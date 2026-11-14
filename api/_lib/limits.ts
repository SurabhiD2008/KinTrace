// Abuse and cost limits. All of them live in memory, per serverless instance:
// they reset when an instance restarts and are not shared between instances, so
// they are speed bumps, not guarantees (the README says so).

/** Requests per address per window: 6 per 10 minutes. */
export const RATE_LIMIT = { limit: 6, windowMs: 10 * 60_000, maxTracked: 5000 };
/** Model calls in flight at once, across all addresses. */
export const MAX_CONCURRENT_CALLS = 4;

export interface RateLimiter {
  /** True when the request may go ahead. */
  allow(key: string): boolean;
}

export function createRateLimiter(now: () => number = Date.now, options = RATE_LIMIT): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    allow(key) {
      const time = now();
      const recent = (hits.get(key) ?? []).filter((at) => time - at < options.windowMs);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(time);
      hits.delete(key);
      hits.set(key, recent);
      // Bounded memory: forget the least recently seen addresses first.
      while (hits.size > options.maxTracked) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) break;
        hits.delete(oldest);
      }
      return true;
    },
  };
}

export interface DailyBudget {
  /** Takes one call from today's budget; false when it is spent. */
  take(): boolean;
}

/** A global cap on model calls per calendar day (UTC), so free-tier limits are never reached. */
export function createDailyBudget(cap: number, now: () => number = Date.now): DailyBudget {
  let day = '';
  let used = 0;
  return {
    take() {
      const today = new Date(now()).toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        used = 0;
      }
      if (used >= cap) return false;
      used += 1;
      return true;
    },
  };
}

export interface Gate {
  tryEnter(): boolean;
  leave(): void;
}

/** At most `max` model calls at once; the rest are refused rather than queued. */
export function createGate(max = MAX_CONCURRENT_CALLS): Gate {
  let inFlight = 0;
  return {
    tryEnter() {
      if (inFlight >= max) return false;
      inFlight += 1;
      return true;
    },
    leave() {
      inFlight = Math.max(0, inFlight - 1);
    },
  };
}
