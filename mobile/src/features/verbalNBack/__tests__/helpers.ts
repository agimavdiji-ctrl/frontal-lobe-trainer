import { BlockMetrics, MonotonicClock, Scheduler, TimerHandle } from '../engine';

interface FakeTimer {
  id: number;
  at: number;
  fn: () => void;
}

/**
 * Deterministic virtual time. `lateness` lets a test make individual timers
 * fire late, as a busy JS thread would.
 */
export class FakeTime implements MonotonicClock, Scheduler {
  private current = 0;
  private nextId = 1;
  private timers: FakeTimer[] = [];
  lateness: (scheduledAt: number, ordinal: number) => number = () => 0;
  private fired = 0;

  now(): number {
    return this.current;
  }

  schedule(fn: () => void, delayMs: number): TimerHandle {
    const timer = { id: this.nextId++, at: this.current + Math.max(0, delayMs), fn };
    this.timers.push(timer);
    return timer.id;
  }

  cancel(handle: TimerHandle): void {
    this.timers = this.timers.filter((t) => t.id !== handle);
  }

  get pendingTimers(): number {
    return this.timers.length;
  }

  /** Runs all timers due up to `target`, then sets the clock to `target`. */
  advanceTo(target: number): void {
    for (;;) {
      const due = this.timers
        .filter((t) => t.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.fired += 1;
      this.current = Math.max(this.current, due.at + this.lateness(due.at, this.fired));
      due.fn();
    }
    this.current = Math.max(this.current, target);
  }

  advanceBy(ms: number): void {
    this.advanceTo(this.current + ms);
  }

  runAll(limitMs = 10 * 60 * 1000): void {
    this.advanceTo(this.current + limitMs);
  }
}

export function metricsWith(hitRate: number, specificity: number): BlockMetrics {
  return {
    scoredTrials: 40,
    targets: 12,
    nonTargets: 28,
    hits: Math.round(hitRate * 12),
    misses: 12 - Math.round(hitRate * 12),
    falseAlarms: 28 - Math.round(specificity * 28),
    correctRejections: Math.round(specificity * 28),
    hitRate,
    falseAlarmRate: 1 - specificity,
    specificity,
    balancedAccuracy: (hitRate + specificity) / 2,
    meanHitRtMs: null,
    medianHitRtMs: null,
    meanFalseAlarmRtMs: null,
    lureFalseAlarms: { nMinus1: 0, nPlus1: 0 },
    lureTrials: { nMinus1: 3, nPlus1: 3 },
    anticipatoryResponses: 0,
    ignoredResponses: 0,
  };
}
