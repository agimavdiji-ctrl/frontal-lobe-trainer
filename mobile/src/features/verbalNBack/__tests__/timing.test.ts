import {
  BlockConfig,
  BlockResult,
  BlockRunner,
  BlockSnapshot,
  createMonotonicClock,
  prepareBlock,
} from '../engine';
import { FakeTime } from './helpers';

function setup(levelIndex = 0, overrides: Partial<BlockConfig> = {}) {
  const time = new FakeTime();
  const { config, sequence } = prepareBlock(levelIndex, 2024, overrides);
  const ended: BlockResult[] = [];
  const snapshots: BlockSnapshot[] = [];
  const runner = new BlockRunner({
    config,
    sequence,
    levelIndex,
    clock: time,
    scheduler: time,
    wallClock: () => 1_700_000_000_000,
    onChange: (s) => snapshots.push(s),
    onEnd: (r) => ended.push(r),
  });
  const onsetOf = (k: number) => config.leadInMs + k * config.soiMs;
  return { time, config, sequence, runner, ended, snapshots, onsetOf };
}

describe('presentation timing', () => {
  it('presents 42 trials on the SOI grid with 500 ms stimuli', () => {
    const { time, runner, ended, config, onsetOf } = setup(0);
    runner.start();
    time.runAll();

    expect(ended).toHaveLength(1);
    const result = ended[0];
    expect(result.status).toBe('completed');
    expect(result.trials).toHaveLength(42);
    expect(config.soiMs).toBe(3000);
    result.trials.forEach((t, k) => {
      expect(t.scheduledOnsetMs).toBe(onsetOf(k));
      expect(t.onsetMs).toBe(onsetOf(k));
      expect(t.offsetMs! - t.onsetMs).toBe(500);
    });
    // Block ends when the last response window closes.
    expect(result.endedAtMs).toBe(onsetOf(42));
    expect(time.pendingTimers).toBe(0);
  });

  it.each([
    [0, 3000],
    [1, 2500],
    [2, 2000],
    [3, 3500],
    [4, 3000],
    [5, 2500],
  ])('level %i uses an onset interval of %i ms', (levelIndex, soi) => {
    const { time, runner, ended } = setup(levelIndex);
    runner.start();
    time.runAll();
    const onsets = ended[0].trials.map((t) => t.onsetMs);
    for (let k = 1; k < onsets.length; k += 1) expect(onsets[k] - onsets[k - 1]).toBe(soi);
  });

  it('does not accumulate drift when timers fire late', () => {
    const { time, runner, ended, onsetOf } = setup(0);
    time.lateness = () => 40; // every timer fires 40 ms late
    runner.start();
    time.runAll();
    const result = ended[0];
    expect(result.status).toBe('completed');
    result.trials.forEach((t, k) => {
      expect(t.scheduledOnsetMs).toBe(onsetOf(k));
      expect(t.onsetLatenessMs).toBeLessThanOrEqual(40);
      // Stimulus stays visible for the full duration from the measured onset.
      expect(t.offsetMs! - t.onsetMs).toBeGreaterThanOrEqual(500);
    });
  });

  it('aborts with a timing fault when an onset is far too late', () => {
    const { time, runner, ended, onsetOf } = setup(0);
    time.lateness = (at) => (at === onsetOf(6) ? 900 : 0);
    runner.start();
    time.runAll();
    expect(ended).toHaveLength(1);
    expect(ended[0].status).toBe('interrupted');
    expect(ended[0].interruption?.reason).toBe('timing-fault');
    expect(ended[0].metrics).toBeNull();
    expect(ended[0].interruption?.atTrialIndex).toBe(5);
    expect(ended[0].trials).toHaveLength(6);
  });

  it('hides the stimulus after 500 ms but keeps the response window open until the next onset', () => {
    const { time, runner, onsetOf } = setup(0);
    runner.start();
    time.advanceTo(onsetOf(0));
    expect(runner.getSnapshot()).toMatchObject({ trialIndex: 0, stimulusVisible: true });
    expect(runner.getSnapshot().letter).not.toBeNull();
    time.advanceTo(onsetOf(0) + 499);
    expect(runner.getSnapshot().stimulusVisible).toBe(true);
    time.advanceTo(onsetOf(0) + 500);
    expect(runner.getSnapshot()).toMatchObject({ stimulusVisible: false, letter: null });
    time.advanceTo(onsetOf(1) - 1);
    expect(runner.respond()).toBe('accepted');
    expect(runner.getSnapshot().trialIndex).toBe(0);
  });
});

describe('response handling', () => {
  it('measures RT from the measured onset and accepts one response per trial', () => {
    const { time, runner, ended, onsetOf } = setup(0);
    runner.start();

    time.advanceTo(100);
    expect(runner.respond()).toBe('no-active-trial'); // lead-in

    time.advanceTo(onsetOf(5) + 640);
    expect(runner.respond()).toBe('accepted');
    time.advanceBy(200);
    expect(runner.respond()).toBe('duplicate');
    expect(runner.respond()).toBe('duplicate');

    time.runAll();
    expect(runner.respond()).toBe('not-running');

    const t5 = ended[0].trials[5];
    expect(t5.response?.rtMs).toBe(640);
    expect(t5.response?.timestampMs).toBe(onsetOf(5) + 640);
    expect(t5.ignoredResponses).toBe(2);
  });

  it('scores a simulated participant correctly', () => {
    const { time, runner, ended, sequence, onsetOf } = setup(0);
    runner.start();
    // Respond to every target, plus to two non-targets, and miss target #1.
    const targets = sequence.trials.filter((t) => t.scored && t.isTarget).map((t) => t.index);
    const nonTargets = sequence.trials.filter((t) => t.scored && !t.isTarget).map((t) => t.index);
    const respondAt = new Set([...targets.slice(1), nonTargets[0], nonTargets[1]]);
    for (let k = 0; k < sequence.trials.length; k += 1) {
      time.advanceTo(onsetOf(k) + 700);
      if (respondAt.has(k)) runner.respond();
    }
    time.runAll();

    const m = ended[0].metrics!;
    expect(m).toMatchObject({ hits: 11, misses: 1, falseAlarms: 2, correctRejections: 26 });
    expect(m.meanHitRtMs).toBe(700);
    expect(m.balancedAccuracy).toBeCloseTo((11 / 12 + 26 / 28) / 2, 10);
    expect(ended[0].trials.slice(0, 2).every((t) => t.outcome === null)).toBe(true);
    expect(ended[0].trials.slice(2).every((t) => t.outcome !== null)).toBe(true);
  });

  it('records responses during warm-up without scoring them', () => {
    const { time, runner, ended, onsetOf } = setup(0);
    runner.start();
    time.advanceTo(onsetOf(1) + 300);
    expect(runner.respond()).toBe('accepted');
    time.runAll();
    expect(ended[0].trials[1].response?.rtMs).toBe(300);
    expect(ended[0].trials[1].outcome).toBeNull();
    expect(ended[0].metrics!.falseAlarms).toBe(0);
  });

  it('produces monotonic timestamps', () => {
    const { time, runner, ended, onsetOf } = setup(1);
    time.lateness = (_at, o) => (o % 3) * 7;
    runner.start();
    for (let k = 0; k < 42; k += 1) {
      time.advanceTo(onsetOf(k) + 400 + (k % 5) * 50);
      runner.respond();
    }
    time.runAll();
    const stamps = ended[0].trials.flatMap((t) => [
      t.onsetMs,
      ...(t.response ? [t.response.timestampMs] : []),
    ]);
    for (let i = 1; i < stamps.length; i += 1) expect(stamps[i]).toBeGreaterThanOrEqual(stamps[i - 1]);
  });

  it('flags anticipatory responses', () => {
    const { time, runner, ended, onsetOf } = setup(0);
    runner.start();
    time.advanceTo(onsetOf(4) + 90);
    runner.respond();
    time.runAll();
    expect(ended[0].trials[4].response?.anticipatory).toBe(true);
  });
});

describe('interruptions', () => {
  it('stops the block, keeps partial data and yields no metrics', () => {
    const { time, runner, ended, onsetOf } = setup(0);
    runner.start();
    time.advanceTo(onsetOf(10) + 1000);
    const result = runner.interrupt('app-background');

    expect(result?.status).toBe('interrupted');
    expect(result?.interruption).toEqual({ reason: 'app-background', atTrialIndex: 10 });
    expect(result?.metrics).toBeNull();
    expect(result?.trials).toHaveLength(11);
    // The trial whose window was cut short has no outcome.
    expect(result?.trials[10].outcome).toBeNull();
    expect(result?.trials[9].outcome).not.toBeNull();
    expect(time.pendingTimers).toBe(0);

    time.runAll();
    expect(ended).toHaveLength(1);
    expect(runner.respond()).toBe('not-running');
    expect(runner.interrupt('user-abort')).toBeNull();
  });

  it('can be interrupted during the lead-in', () => {
    const { time, runner } = setup(0);
    runner.start();
    time.advanceBy(200);
    const result = runner.interrupt('user-abort');
    expect(result?.trials).toHaveLength(0);
    expect(result?.interruption?.atTrialIndex).toBe(-1);
  });

  it('refuses to start twice', () => {
    const { runner } = setup(0);
    runner.start();
    expect(() => runner.start()).toThrow();
  });
});

describe('monotonic clock', () => {
  it('never goes backwards even if the source does', () => {
    const values = [10, 20, 15, 30, 29, 31];
    let i = 0;
    const clock = createMonotonicClock(() => values[i++]);
    const read = values.map(() => clock.now());
    expect(read).toEqual([10, 20, 20, 30, 30, 31]);
  });
});
