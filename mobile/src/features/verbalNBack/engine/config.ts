import { BlockConfig, LETTERS, LevelSpec } from './types';

export const STIMULUS_DURATION_MS = 500;
export const WARMUP_TRIALS = 2;
export const SCORED_TRIALS = 40;
export const TARGET_COUNT = 12;
export const DEFAULT_LURE_COUNTS = { nMinus1: 3, nPlus1: 3 } as const;

/**
 * Difficulty ladder. Within a load level the SOI shrinks; the step to 3-back
 * relaxes the SOI again before it shrinks once more.
 */
export const LEVEL_LADDER: readonly LevelSpec[] = Object.freeze([
  { index: 0, n: 2, soiMs: 3000 },
  { index: 1, n: 2, soiMs: 2500 },
  { index: 2, n: 2, soiMs: 2000 },
  { index: 3, n: 3, soiMs: 3500 },
  { index: 4, n: 3, soiMs: 3000 },
  { index: 5, n: 3, soiMs: 2500 },
]);

export const INITIAL_LEVEL_INDEX = 0;

export interface AdaptationThresholds {
  readonly promoteBalancedAccuracy: number;
  readonly promoteHitRate: number;
  readonly promoteSpecificity: number;
  /** Lower bound of the "maintain" band (inclusive). */
  readonly maintainLowerBound: number;
  /** Strictly below this, demotion happens after a single block. */
  readonly immediateDemotionBelow: number;
  readonly consecutiveBlocksToPromote: number;
  readonly consecutiveBlocksToDemote: number;
}

export const DEFAULT_THRESHOLDS: AdaptationThresholds = Object.freeze({
  promoteBalancedAccuracy: 0.85,
  promoteHitRate: 0.8,
  promoteSpecificity: 0.8,
  maintainLowerBound: 0.65,
  immediateDemotionBelow: 0.5,
  consecutiveBlocksToPromote: 2,
  consecutiveBlocksToDemote: 2,
});

export function getLevel(index: number, ladder: readonly LevelSpec[] = LEVEL_LADDER): LevelSpec {
  const clamped = clampLevelIndex(index, ladder);
  return ladder[clamped];
}

export function clampLevelIndex(index: number, ladder: readonly LevelSpec[] = LEVEL_LADDER): number {
  if (!Number.isFinite(index)) return INITIAL_LEVEL_INDEX;
  return Math.min(ladder.length - 1, Math.max(0, Math.trunc(index)));
}

export function createBlockConfig(level: LevelSpec, overrides: Partial<BlockConfig> = {}): BlockConfig {
  const config: BlockConfig = {
    n: level.n,
    soiMs: level.soiMs,
    stimulusDurationMs: STIMULUS_DURATION_MS,
    warmupTrials: WARMUP_TRIALS,
    scoredTrials: SCORED_TRIALS,
    targetCount: TARGET_COUNT,
    lureCounts: DEFAULT_LURE_COUNTS,
    alphabet: LETTERS,
    leadInMs: 1500,
    maxOnsetLatenessMs: 250,
    anticipationThresholdMs: 150,
    ...overrides,
  };
  assertValidConfig(config);
  return config;
}

export function assertValidConfig(config: BlockConfig): void {
  const problems: string[] = [];
  if (!Number.isInteger(config.n) || config.n < 2) problems.push('n must be an integer >= 2');
  if (config.stimulusDurationMs <= 0) problems.push('stimulusDurationMs must be > 0');
  if (config.soiMs <= config.stimulusDurationMs) problems.push('soiMs must exceed stimulusDurationMs');
  if (config.warmupTrials < 0) problems.push('warmupTrials must be >= 0');
  if (config.scoredTrials <= 0) problems.push('scoredTrials must be > 0');
  if (new Set(config.alphabet).size !== config.alphabet.length) problems.push('alphabet contains duplicates');
  // A filler must avoid up to three letters (distances N-1, N, N+1).
  if (config.alphabet.length < 4) problems.push('alphabet needs at least 4 letters');
  const total = config.warmupTrials + config.scoredTrials;
  const targetEligible = total - Math.max(config.warmupTrials, config.n);
  if (config.targetCount < 1 || config.targetCount > targetEligible) {
    problems.push(`targetCount must be between 1 and ${targetEligible}`);
  }
  const { nMinus1, nPlus1 } = config.lureCounts;
  if (nMinus1 < 0 || nPlus1 < 0) problems.push('lure counts must be >= 0');
  if (config.targetCount + nMinus1 + nPlus1 >= config.scoredTrials) {
    problems.push('targets + lures must leave room for fillers');
  }
  if (problems.length > 0) {
    throw new Error(`Invalid N-Back block config: ${problems.join('; ')}`);
  }
}
