import { TrialKind, TrialRecord, classifyOutcome, computeMetrics, median } from '../engine';

function trial(
  index: number,
  kind: TrialKind,
  rtMs: number | null,
  extra: Partial<TrialRecord> = {},
): TrialRecord {
  const scored = kind !== 'warmup';
  return {
    index,
    letter: 'A',
    kind,
    scored,
    isTarget: kind === 'target',
    scheduledOnsetMs: index * 3000,
    onsetMs: index * 3000,
    onsetLatenessMs: 0,
    offsetMs: index * 3000 + 500,
    response:
      rtMs === null
        ? null
        : { timestampMs: index * 3000 + rtMs, rtMs, anticipatory: rtMs < 150 },
    ignoredResponses: 0,
    outcome: null,
    ...extra,
  };
}

describe('outcome classification', () => {
  it.each([
    [true, true, 'hit'],
    [true, false, 'miss'],
    [false, true, 'false-alarm'],
    [false, false, 'correct-rejection'],
  ] as const)('target=%s responded=%s → %s', (isTarget, responded, expected) => {
    expect(classifyOutcome(isTarget, responded)).toBe(expected);
  });
});

describe('block metrics', () => {
  // 2 warm-ups (both answered, must be ignored) + 12 targets + 28 non-targets.
  const trials: TrialRecord[] = [
    trial(0, 'warmup', 400),
    trial(1, 'warmup', 300),
  ];
  let i = 2;
  const hitRts = [500, 600, 700, 800, 900, 1000, 450, 550, 650, 750];
  hitRts.forEach((rt) => trials.push(trial(i++, 'target', rt)));
  trials.push(trial(i++, 'target', null), trial(i++, 'target', null)); // 2 misses
  trials.push(trial(i++, 'lure-n-minus-1', 820)); // FA on N-1 lure
  trials.push(trial(i++, 'lure-n-plus-1', 900)); // FA on N+1 lure
  trials.push(trial(i++, 'filler', 100, { ignoredResponses: 2 })); // anticipatory FA
  trials.push(trial(i++, 'lure-n-minus-1', null), trial(i++, 'lure-n-minus-1', null));
  trials.push(trial(i++, 'lure-n-plus-1', null), trial(i++, 'lure-n-plus-1', null));
  while (trials.length < 42) trials.push(trial(i++, 'filler', null));

  const m = computeMetrics(trials);

  it('counts the four outcome categories over scored trials only', () => {
    expect(m.scoredTrials).toBe(40);
    expect(m.targets).toBe(12);
    expect(m.nonTargets).toBe(28);
    expect(m.hits).toBe(10);
    expect(m.misses).toBe(2);
    expect(m.falseAlarms).toBe(3);
    expect(m.correctRejections).toBe(25);
  });

  it('computes hit rate, specificity and balanced accuracy', () => {
    expect(m.hitRate).toBeCloseTo(10 / 12, 10);
    expect(m.specificity).toBeCloseTo(25 / 28, 10);
    expect(m.falseAlarmRate).toBeCloseTo(3 / 28, 10);
    expect(m.balancedAccuracy).toBeCloseTo((10 / 12 + 25 / 28) / 2, 10);
  });

  it('summarises reaction times', () => {
    expect(m.meanHitRtMs).toBeCloseTo(hitRts.reduce((a, b) => a + b) / hitRts.length, 10);
    expect(m.medianHitRtMs).toBe(675);
    expect(m.meanFalseAlarmRtMs).toBeCloseTo((820 + 900 + 100) / 3, 10);
  });

  it('reports lure-specific false alarms and response anomalies', () => {
    expect(m.lureTrials).toEqual({ nMinus1: 3, nPlus1: 3 });
    expect(m.lureFalseAlarms).toEqual({ nMinus1: 1, nPlus1: 1 });
    expect(m.anticipatoryResponses).toBe(1);
    expect(m.ignoredResponses).toBe(2);
  });

  it('handles a block without any response', () => {
    const silent = computeMetrics(trials.map((t) => ({ ...t, response: null })));
    expect(silent.hitRate).toBe(0);
    expect(silent.specificity).toBe(1);
    expect(silent.balancedAccuracy).toBe(0.5);
    expect(silent.meanHitRtMs).toBeNull();
  });

  it('computes medians for odd and even samples', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
