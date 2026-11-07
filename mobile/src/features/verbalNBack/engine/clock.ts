/**
 * Time sources for the engine. Injected so that timing logic can be tested
 * deterministically with a virtual clock.
 */
export interface MonotonicClock {
  /** Milliseconds from an arbitrary origin; never decreases. */
  now(): number;
}

export type TimerHandle = unknown;

export interface Scheduler {
  schedule(callback: () => void, delayMs: number): TimerHandle;
  cancel(handle: TimerHandle): void;
}

function defaultSource(): () => number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') return () => perf.now!();
  return () => Date.now();
}

/**
 * Wraps a time source and enforces monotonicity. `performance.now()` is
 * monotonic on Hermes/JSC; the guard also protects the `Date.now()` fallback
 * against wall-clock adjustments.
 */
export function createMonotonicClock(source: () => number = defaultSource()): MonotonicClock {
  let last = -Infinity;
  return {
    now() {
      const t = source();
      if (t > last) last = t;
      return last;
    },
  };
}

export const systemScheduler: Scheduler = {
  schedule: (callback, delayMs) => setTimeout(callback, Math.max(0, delayMs)),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
