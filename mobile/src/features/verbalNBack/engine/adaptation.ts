import { AdaptationThresholds, DEFAULT_THRESHOLDS, LEVEL_LADDER, clampLevelIndex } from './config';
import { BlockMetrics, BlockResult, LevelSpec } from './types';

export interface AdaptationState {
  readonly levelIndex: number;
  /** Consecutive completed blocks that met all promotion criteria. */
  readonly consecutivePromotionBlocks: number;
  /** Consecutive completed blocks with balanced accuracy below the maintain band. */
  readonly consecutiveLowBlocks: number;
}

export function initialAdaptationState(levelIndex = 0): AdaptationState {
  return { levelIndex, consecutivePromotionBlocks: 0, consecutiveLowBlocks: 0 };
}

/**
 * - `promotion-criterion`: BA >= 85 %, hit rate >= 80 %, specificity >= 80 %
 * - `maintain`: everything between (including BA >= 85 % with a weak hit rate
 *   or specificity)
 * - `low`: 50 % <= BA < 65 %
 * - `critical`: BA < 50 %
 */
export type BlockEvaluation = 'promotion-criterion' | 'maintain' | 'low' | 'critical';

export type AdaptationAction = 'promote' | 'maintain' | 'demote' | 'ignored';

export interface AdaptationDecision {
  readonly action: AdaptationAction;
  readonly evaluation: BlockEvaluation | null;
  readonly previousLevelIndex: number;
  readonly nextLevelIndex: number;
  /** True when the rules asked for a level change but the ladder end was reached. */
  readonly capped: boolean;
  readonly state: AdaptationState;
}

// Guards against floating point noise such as 0.8499999999.
const EPSILON = 1e-9;
const atLeast = (value: number, threshold: number): boolean => value >= threshold - EPSILON;

export function evaluateBlock(
  metrics: BlockMetrics,
  thresholds: AdaptationThresholds = DEFAULT_THRESHOLDS,
): BlockEvaluation {
  const ba = metrics.balancedAccuracy;
  if (!atLeast(ba, thresholds.immediateDemotionBelow)) return 'critical';
  if (!atLeast(ba, thresholds.maintainLowerBound)) return 'low';
  if (
    atLeast(ba, thresholds.promoteBalancedAccuracy) &&
    atLeast(metrics.hitRate, thresholds.promoteHitRate) &&
    atLeast(metrics.specificity, thresholds.promoteSpecificity)
  ) {
    return 'promotion-criterion';
  }
  return 'maintain';
}

/**
 * Applies one block to the adaptation state.
 *
 * Interrupted blocks (or blocks without metrics) are ignored entirely: they
 * neither count towards nor break a streak, because their data are not
 * comparable with a complete block.
 */
export function applyBlockResult(
  state: AdaptationState,
  result: Pick<BlockResult, 'status' | 'metrics'>,
  ladder: readonly LevelSpec[] = LEVEL_LADDER,
  thresholds: AdaptationThresholds = DEFAULT_THRESHOLDS,
): AdaptationDecision {
  const current = clampLevelIndex(state.levelIndex, ladder);
  const base = { ...state, levelIndex: current };

  if (result.status !== 'completed' || !result.metrics) {
    return {
      action: 'ignored',
      evaluation: null,
      previousLevelIndex: current,
      nextLevelIndex: current,
      capped: false,
      state: base,
    };
  }

  const evaluation = evaluateBlock(result.metrics, thresholds);
  const top = ladder.length - 1;

  const change = (direction: 1 | -1): AdaptationDecision => {
    const target = current + direction;
    const capped = target < 0 || target > top;
    const next = capped ? current : target;
    return {
      action: capped ? 'maintain' : direction > 0 ? 'promote' : 'demote',
      evaluation,
      previousLevelIndex: current,
      nextLevelIndex: next,
      capped,
      state: { levelIndex: next, consecutivePromotionBlocks: 0, consecutiveLowBlocks: 0 },
    };
  };

  const stay = (s: AdaptationState): AdaptationDecision => ({
    action: 'maintain',
    evaluation,
    previousLevelIndex: current,
    nextLevelIndex: current,
    capped: false,
    state: s,
  });

  switch (evaluation) {
    case 'critical':
      return change(-1);
    case 'low': {
      const low = base.consecutiveLowBlocks + 1;
      if (low >= thresholds.consecutiveBlocksToDemote) return change(-1);
      return stay({ levelIndex: current, consecutivePromotionBlocks: 0, consecutiveLowBlocks: low });
    }
    case 'promotion-criterion': {
      const good = base.consecutivePromotionBlocks + 1;
      if (good >= thresholds.consecutiveBlocksToPromote) return change(1);
      return stay({ levelIndex: current, consecutivePromotionBlocks: good, consecutiveLowBlocks: 0 });
    }
    case 'maintain':
      return stay({ levelIndex: current, consecutivePromotionBlocks: 0, consecutiveLowBlocks: 0 });
  }
}
