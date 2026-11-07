import { BlockConfig, GeneratedSequence, Letter, PlannedTrial, TrialKind } from './types';
import { Rng } from './random';

/** Which of the critical distances (N-1, N, N+1) produce a letter match. */
export interface PositionMatches {
  readonly nMinus1: boolean;
  readonly n: boolean;
  readonly nPlus1: boolean;
}

export function matchesAt(letters: readonly Letter[], index: number, n: number): PositionMatches {
  const same = (distance: number): boolean =>
    index - distance >= 0 && letters[index - distance] === letters[index];
  return { nMinus1: same(n - 1), n: same(n), nPlus1: same(n + 1) };
}

export type ObservedKind = Exclude<TrialKind, 'warmup'> | 'ambiguous';

/**
 * Classifies a position purely from the letters, independent of any plan.
 * A position with more than one match is `ambiguous` and never allowed.
 */
export function classifyPosition(letters: readonly Letter[], index: number, n: number): ObservedKind {
  const m = matchesAt(letters, index, n);
  const count = Number(m.nMinus1) + Number(m.n) + Number(m.nPlus1);
  if (count === 0) return 'filler';
  if (count > 1) return 'ambiguous';
  if (m.n) return 'target';
  return m.nMinus1 ? 'lure-n-minus-1' : 'lure-n-plus-1';
}

export interface SequenceAnalysis {
  readonly observed: readonly ObservedKind[];
  readonly targets: number;
  readonly luresNMinus1: number;
  readonly luresNPlus1: number;
  readonly fillers: number;
  readonly ambiguous: number;
  /** Matches of any kind inside the warm-up section. */
  readonly warmupMatches: number;
}

export function analyzeSequence(
  letters: readonly Letter[],
  n: number,
  warmupTrials: number,
): SequenceAnalysis {
  const observed = letters.map((_, i) => classifyPosition(letters, i, n));
  let targets = 0;
  let luresNMinus1 = 0;
  let luresNPlus1 = 0;
  let fillers = 0;
  let ambiguous = 0;
  let warmupMatches = 0;
  observed.forEach((kind, i) => {
    if (i < warmupTrials) {
      if (kind !== 'filler') warmupMatches += 1;
      return;
    }
    if (kind === 'target') targets += 1;
    else if (kind === 'lure-n-minus-1') luresNMinus1 += 1;
    else if (kind === 'lure-n-plus-1') luresNPlus1 += 1;
    else if (kind === 'filler') fillers += 1;
    else ambiguous += 1;
  });
  return { observed, targets, luresNMinus1, luresNPlus1, fillers, ambiguous, warmupMatches };
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Checks a sequence against the block specification. */
export function validateSequence(letters: readonly Letter[], config: BlockConfig): ValidationResult {
  const errors: string[] = [];
  const expectedLength = config.warmupTrials + config.scoredTrials;
  if (letters.length !== expectedLength) {
    errors.push(`length ${letters.length} != ${expectedLength}`);
  }
  const alphabet = new Set<Letter>(config.alphabet);
  letters.forEach((l, i) => {
    if (!alphabet.has(l)) errors.push(`letter ${String(l)} at ${i} not in alphabet`);
  });
  const a = analyzeSequence(letters, config.n, config.warmupTrials);
  if (a.warmupMatches > 0) errors.push(`${a.warmupMatches} unintended match(es) in warm-up`);
  if (a.ambiguous > 0) errors.push(`${a.ambiguous} ambiguous position(s)`);
  if (a.targets !== config.targetCount) errors.push(`targets ${a.targets} != ${config.targetCount}`);
  if (a.luresNMinus1 !== config.lureCounts.nMinus1) {
    errors.push(`N-1 lures ${a.luresNMinus1} != ${config.lureCounts.nMinus1}`);
  }
  if (a.luresNPlus1 !== config.lureCounts.nPlus1) {
    errors.push(`N+1 lures ${a.luresNPlus1} != ${config.lureCounts.nPlus1}`);
  }
  return { valid: errors.length === 0, errors };
}

/** Plans which scored positions become targets and lures. */
export function planTrialKinds(config: BlockConfig, rng: Rng): TrialKind[] {
  const { n, warmupTrials, scoredTrials, targetCount, lureCounts } = config;
  const total = warmupTrials + scoredTrials;
  const kinds: TrialKind[] = Array.from({ length: total }, (_, i) =>
    i < warmupTrials ? 'warmup' : 'filler',
  );
  const scored = Array.from({ length: scoredTrials }, (_, k) => warmupTrials + k);

  const take = (eligible: number[], count: number, kind: TrialKind): void => {
    const free = rng.shuffle(eligible.filter((i) => kinds[i] === 'filler'));
    if (free.length < count) {
      throw new Error(`Not enough eligible positions for ${kind}`);
    }
    free.slice(0, count).forEach((i) => {
      kinds[i] = kind;
    });
  };

  take(scored.filter((i) => i - n >= 0), targetCount, 'target');
  take(scored.filter((i) => i - (n - 1) >= 0), lureCounts.nMinus1, 'lure-n-minus-1');
  take(scored.filter((i) => i - (n + 1) >= 0), lureCounts.nPlus1, 'lure-n-plus-1');
  return kinds;
}

const REFERENCE_DISTANCE: Partial<Record<TrialKind, (n: number) => number>> = {
  target: (n) => n,
  'lure-n-minus-1': (n) => n - 1,
  'lure-n-plus-1': (n) => n + 1,
};

/**
 * Fills letters for a plan, front to back. Returns `null` if the plan cannot
 * be realised with the letters drawn so far (the caller then retries).
 *
 * Every position depends only on earlier letters, so checking each position
 * when it is written guarantees that the final sequence contains exactly the
 * planned targets and lures – and no unintended ones.
 */
function fillLetters(kinds: readonly TrialKind[], config: BlockConfig, rng: Rng): Letter[] | null {
  const { n, alphabet } = config;
  const letters: Letter[] = [];
  for (let i = 0; i < kinds.length; i += 1) {
    const kind = kinds[i];
    const distanceOf = REFERENCE_DISTANCE[kind];
    if (distanceOf) {
      const ref = i - distanceOf(n);
      if (ref < 0) return null;
      letters.push(letters[ref]);
      if (classifyPosition(letters, i, n) !== kind) return null;
    } else {
      const forbidden = new Set<Letter>();
      for (const d of [n - 1, n, n + 1]) {
        if (i - d >= 0) forbidden.add(letters[i - d]);
      }
      const options = alphabet.filter((l) => !forbidden.has(l));
      if (options.length === 0) return null;
      letters.push(rng.pick(options));
    }
  }
  return letters;
}

export class SequenceGenerationError extends Error {}

export function generateSequence(
  config: BlockConfig,
  rng: Rng,
  seed: number,
  maxAttempts = 2000,
): GeneratedSequence {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const kinds = planTrialKinds(config, rng);
    const letters = fillLetters(kinds, config, rng);
    if (!letters) continue;
    // Defensive double check against the independent validator.
    if (!validateSequence(letters, config).valid) continue;
    const trials: PlannedTrial[] = letters.map((letter, index) => ({
      index,
      letter,
      kind: kinds[index],
      scored: index >= config.warmupTrials,
      isTarget: kinds[index] === 'target',
    }));
    return { seed, n: config.n, trials };
  }
  throw new SequenceGenerationError(
    `Could not generate a valid ${config.n}-back sequence in ${maxAttempts} attempts`,
  );
}
