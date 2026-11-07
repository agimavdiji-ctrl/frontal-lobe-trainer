/**
 * Core types of the Verbal N-Back engine.
 *
 * The engine is framework-free: nothing in `engine/` may import React,
 * React Native or any storage module.
 */

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type Letter = (typeof LETTERS)[number];

/**
 * Role of a trial inside a generated sequence.
 *
 * - `warmup`: one of the initial, non-scored trials.
 * - `target`: letter equals the one presented exactly N positions earlier.
 * - `lure-n-minus-1` / `lure-n-plus-1`: non-target whose letter equals the one
 *   presented N-1 / N+1 positions earlier (and nothing else).
 * - `filler`: non-target without any match at distance N-1, N or N+1.
 */
export type TrialKind =
  | 'warmup'
  | 'target'
  | 'lure-n-minus-1'
  | 'lure-n-plus-1'
  | 'filler';

export interface LevelSpec {
  /** Position on the ladder (0 = easiest). */
  readonly index: number;
  readonly n: number;
  /** Stimulus onset interval (onset to onset) in milliseconds. */
  readonly soiMs: number;
}

export interface LureCounts {
  readonly nMinus1: number;
  readonly nPlus1: number;
}

export interface BlockConfig {
  readonly n: number;
  readonly soiMs: number;
  readonly stimulusDurationMs: number;
  readonly warmupTrials: number;
  readonly scoredTrials: number;
  readonly targetCount: number;
  readonly lureCounts: LureCounts;
  readonly alphabet: readonly Letter[];
  /** Delay between `start()` and the first stimulus onset. */
  readonly leadInMs: number;
  /**
   * If a stimulus onset fires later than this, the block is aborted as a
   * timing fault (e.g. the JS thread was blocked or the app was suspended
   * without an AppState event).
   */
  readonly maxOnsetLatenessMs: number;
  /** Responses faster than this are flagged (not rescored) as anticipatory. */
  readonly anticipationThresholdMs: number;
}

export interface PlannedTrial {
  readonly index: number;
  readonly letter: Letter;
  readonly kind: TrialKind;
  readonly scored: boolean;
  readonly isTarget: boolean;
}

export interface GeneratedSequence {
  readonly seed: number;
  readonly n: number;
  readonly trials: readonly PlannedTrial[];
}

export type Outcome = 'hit' | 'miss' | 'false-alarm' | 'correct-rejection';

export interface ResponseRecord {
  /** Monotonic timestamp of the (first) response. */
  readonly timestampMs: number;
  /** Reaction time relative to the measured stimulus onset. */
  readonly rtMs: number;
  readonly anticipatory: boolean;
}

export interface TrialRecord extends PlannedTrial {
  readonly scheduledOnsetMs: number;
  /** Monotonic timestamp at which the stimulus was put on screen. */
  readonly onsetMs: number;
  /** Positive values mean the onset fired late. */
  readonly onsetLatenessMs: number;
  readonly offsetMs: number | null;
  readonly response: ResponseRecord | null;
  /** Additional presses within the same trial; they are never scored. */
  readonly ignoredResponses: number;
  /** `null` for warm-up trials. */
  readonly outcome: Outcome | null;
}

export interface BlockMetrics {
  readonly scoredTrials: number;
  readonly targets: number;
  readonly nonTargets: number;
  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly correctRejections: number;
  readonly hitRate: number;
  readonly falseAlarmRate: number;
  readonly specificity: number;
  readonly balancedAccuracy: number;
  readonly meanHitRtMs: number | null;
  readonly medianHitRtMs: number | null;
  readonly meanFalseAlarmRtMs: number | null;
  readonly lureFalseAlarms: { readonly nMinus1: number; readonly nPlus1: number };
  readonly lureTrials: { readonly nMinus1: number; readonly nPlus1: number };
  readonly anticipatoryResponses: number;
  readonly ignoredResponses: number;
}

export type InterruptionReason =
  | 'app-background'
  | 'user-abort'
  | 'timing-fault'
  | 'unmounted';

export type BlockStatus = 'completed' | 'interrupted';

export interface BlockResult {
  readonly id: string;
  readonly status: BlockStatus;
  readonly levelIndex: number;
  readonly n: number;
  readonly soiMs: number;
  readonly stimulusDurationMs: number;
  readonly seed: number;
  /** Wall-clock time, only for labelling – never used for timing. */
  readonly startedAtEpochMs: number;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly trials: readonly TrialRecord[];
  /** Only present for completed blocks. */
  readonly metrics: BlockMetrics | null;
  readonly interruption: {
    readonly reason: InterruptionReason;
    /** Index of the trial that was active (or -1 before the first onset). */
    readonly atTrialIndex: number;
  } | null;
}
