import { BlockMetrics, Outcome, TrialRecord } from './types';

export function classifyOutcome(isTarget: boolean, responded: boolean): Outcome {
  if (isTarget) return responded ? 'hit' : 'miss';
  return responded ? 'false-alarm' : 'correct-rejection';
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Aggregates scored trials only; warm-up trials are ignored. */
export function computeMetrics(trials: readonly TrialRecord[]): BlockMetrics {
  const scored = trials.filter((t) => t.scored);
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctRejections = 0;
  const hitRts: number[] = [];
  const faRts: number[] = [];
  const lureFalseAlarms = { nMinus1: 0, nPlus1: 0 };
  const lureTrials = { nMinus1: 0, nPlus1: 0 };
  let anticipatoryResponses = 0;
  let ignoredResponses = 0;

  for (const t of scored) {
    const outcome = classifyOutcome(t.isTarget, t.response !== null);
    if (t.kind === 'lure-n-minus-1') lureTrials.nMinus1 += 1;
    if (t.kind === 'lure-n-plus-1') lureTrials.nPlus1 += 1;
    if (t.response?.anticipatory) anticipatoryResponses += 1;
    ignoredResponses += t.ignoredResponses;
    switch (outcome) {
      case 'hit':
        hits += 1;
        hitRts.push(t.response!.rtMs);
        break;
      case 'miss':
        misses += 1;
        break;
      case 'false-alarm':
        falseAlarms += 1;
        faRts.push(t.response!.rtMs);
        if (t.kind === 'lure-n-minus-1') lureFalseAlarms.nMinus1 += 1;
        if (t.kind === 'lure-n-plus-1') lureFalseAlarms.nPlus1 += 1;
        break;
      case 'correct-rejection':
        correctRejections += 1;
        break;
    }
  }

  const targets = hits + misses;
  const nonTargets = falseAlarms + correctRejections;
  const hitRate = ratio(hits, targets);
  const specificity = ratio(correctRejections, nonTargets);
  return {
    scoredTrials: scored.length,
    targets,
    nonTargets,
    hits,
    misses,
    falseAlarms,
    correctRejections,
    hitRate,
    falseAlarmRate: ratio(falseAlarms, nonTargets),
    specificity,
    balancedAccuracy: (hitRate + specificity) / 2,
    meanHitRtMs: mean(hitRts),
    medianHitRtMs: median(hitRts),
    meanFalseAlarmRtMs: mean(faRts),
    lureFalseAlarms,
    lureTrials,
    anticipatoryResponses,
    ignoredResponses,
  };
}
