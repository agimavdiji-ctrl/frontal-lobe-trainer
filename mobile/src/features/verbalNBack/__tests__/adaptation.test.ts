import {
  AdaptationState,
  BlockResult,
  LEVEL_LADDER,
  applyBlockResult,
  evaluateBlock,
  initialAdaptationState,
} from '../engine';
import { metricsWith } from './helpers';

type Outcome = Pick<BlockResult, 'status' | 'metrics'>;
const block = (hitRate: number, specificity: number): Outcome => ({
  status: 'completed',
  metrics: metricsWith(hitRate, specificity),
});
const interrupted: Outcome = { status: 'interrupted', metrics: null };

const PASS = block(0.9, 0.9); // BA 90 %
const MID = block(0.75, 0.75); // BA 75 %
const LOW = block(0.6, 0.6); // BA 60 %
const CRITICAL = block(0.4, 0.5); // BA 45 %

function run(blocks: Outcome[], start: AdaptationState = initialAdaptationState()) {
  let state = start;
  const actions: string[] = [];
  for (const b of blocks) {
    const d = applyBlockResult(state, b);
    actions.push(d.action);
    state = d.state;
  }
  return { state, actions };
}

describe('block evaluation thresholds', () => {
  it.each([
    [0.85, 0.85, 'promotion-criterion'], // BA exactly 85 %
    [0.8, 0.9, 'promotion-criterion'], // hit rate exactly 80 %
    [0.9, 0.8, 'promotion-criterion'], // specificity exactly 80 %
    [0.79, 0.95, 'maintain'], // BA 87 %, but hit rate < 80 %
    [1.0, 0.75, 'maintain'], // BA 87.5 %, but specificity < 80 %
    [0.65, 0.65, 'maintain'], // lower bound of the band is inclusive
    [0.64, 0.65, 'low'],
    [0.5, 0.5, 'low'], // exactly 50 % is not "below 50 %"
    [0.49, 0.5, 'critical'],
  ])('HR %f / spec %f → %s', (hr, spec, expected) => {
    expect(evaluateBlock(metricsWith(hr, spec))).toBe(expected);
  });

  it('is robust to floating point noise at the boundary', () => {
    expect(evaluateBlock({ ...metricsWith(0.8, 0.9), balancedAccuracy: 0.8499999999999 })).toBe(
      'promotion-criterion',
    );
  });
});

describe('level adaptation', () => {
  it('starts at 2-back with 3000 ms', () => {
    expect(LEVEL_LADDER[initialAdaptationState().levelIndex]).toMatchObject({ n: 2, soiMs: 3000 });
  });

  it('follows the ladder 2-back 3000/2500/2000, then 3-back 3500/3000/2500', () => {
    expect(LEVEL_LADDER.map((l) => [l.n, l.soiMs])).toEqual([
      [2, 3000],
      [2, 2500],
      [2, 2000],
      [3, 3500],
      [3, 3000],
      [3, 2500],
    ]);
  });

  it('promotes only after two consecutive passing blocks', () => {
    const { state, actions } = run([PASS, PASS]);
    expect(actions).toEqual(['maintain', 'promote']);
    expect(state).toEqual({ levelIndex: 1, consecutivePromotionBlocks: 0, consecutiveLowBlocks: 0 });
  });

  it('resets the promotion streak after a non-passing block', () => {
    const { state, actions } = run([PASS, MID, PASS]);
    expect(actions).toEqual(['maintain', 'maintain', 'maintain']);
    expect(state.levelIndex).toBe(0);
    expect(state.consecutivePromotionBlocks).toBe(1);
  });

  it('requires hit rate and specificity, not only balanced accuracy', () => {
    const lopsided = block(0.79, 1.0);
    const { actions, state } = run([lopsided, lopsided, lopsided]);
    expect(actions).toEqual(['maintain', 'maintain', 'maintain']);
    expect(state.levelIndex).toBe(0);
  });

  it('holds the level for balanced accuracy between 65 % and 85 %', () => {
    const { state, actions } = run([MID, MID, MID, MID], initialAdaptationState(2));
    expect(actions.every((a) => a === 'maintain')).toBe(true);
    expect(state.levelIndex).toBe(2);
  });

  it('demotes after two consecutive blocks below 65 %', () => {
    const { state, actions } = run([LOW, LOW], initialAdaptationState(3));
    expect(actions).toEqual(['maintain', 'demote']);
    expect(state.levelIndex).toBe(2);
  });

  it('does not demote when low blocks are not consecutive', () => {
    const { state } = run([LOW, MID, LOW], initialAdaptationState(3));
    expect(state.levelIndex).toBe(3);
    expect(state.consecutiveLowBlocks).toBe(1);
  });

  it('demotes immediately below 50 %', () => {
    const { state, actions } = run([CRITICAL], initialAdaptationState(4));
    expect(actions).toEqual(['demote']);
    expect(state.levelIndex).toBe(3);
  });

  it('a critical block also resets any running streak', () => {
    const { state } = run([PASS, CRITICAL], initialAdaptationState(2));
    expect(state).toEqual({ levelIndex: 1, consecutivePromotionBlocks: 0, consecutiveLowBlocks: 0 });
  });

  it('stays within the ladder', () => {
    const top = run([PASS, PASS], initialAdaptationState(LEVEL_LADDER.length - 1));
    expect(top.state.levelIndex).toBe(LEVEL_LADDER.length - 1);
    expect(applyBlockResult({ ...initialAdaptationState(5), consecutivePromotionBlocks: 1 }, PASS).capped).toBe(true);

    const bottom = run([CRITICAL, LOW, LOW]);
    expect(bottom.state.levelIndex).toBe(0);
    expect(bottom.actions).toEqual(['maintain', 'maintain', 'maintain']);
  });

  it('ignores interrupted blocks without breaking a streak', () => {
    const { state, actions } = run([PASS, interrupted, PASS]);
    expect(actions).toEqual(['maintain', 'ignored', 'promote']);
    expect(state.levelIndex).toBe(1);
  });

  it('walks the full ladder up and down', () => {
    const up = run(Array(12).fill(PASS));
    expect(up.state.levelIndex).toBe(5);
    const down = run(Array(5).fill(CRITICAL), up.state);
    expect(down.state.levelIndex).toBe(0);
  });
});
