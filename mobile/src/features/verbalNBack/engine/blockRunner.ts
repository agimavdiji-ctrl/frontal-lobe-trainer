import { MonotonicClock, Scheduler, TimerHandle } from './clock';
import { classifyOutcome, computeMetrics } from './scoring';
import {
  BlockConfig,
  BlockResult,
  GeneratedSequence,
  InterruptionReason,
  Letter,
  PlannedTrial,
  ResponseRecord,
  TrialRecord,
} from './types';

export type BlockPhase = 'idle' | 'running' | 'completed' | 'interrupted';

export interface BlockSnapshot {
  readonly phase: BlockPhase;
  /** Index of the trial whose response window is open, -1 if none. */
  readonly trialIndex: number;
  readonly stimulusVisible: boolean;
  /** Only set while the stimulus is on screen. */
  readonly letter: Letter | null;
  readonly isWarmup: boolean;
  readonly respondedThisTrial: boolean;
  readonly scoredPresented: number;
  readonly scoredTotal: number;
}

export type ResponseAck = 'accepted' | 'duplicate' | 'no-active-trial' | 'not-running';

export interface BlockRunnerOptions {
  readonly config: BlockConfig;
  readonly sequence: GeneratedSequence;
  readonly levelIndex: number;
  readonly clock: MonotonicClock;
  readonly scheduler: Scheduler;
  /** Wall clock used only to label the block. */
  readonly wallClock?: () => number;
  readonly onChange?: (snapshot: BlockSnapshot) => void;
  readonly onEnd?: (result: BlockResult) => void;
}

interface DraftRecord {
  readonly planned: PlannedTrial;
  readonly scheduledOnsetMs: number;
  readonly onsetMs: number;
  offsetMs: number | null;
  response: ResponseRecord | null;
  ignoredResponses: number;
  windowComplete: boolean;
}

/**
 * Runs one block: presents stimuli on a fixed onset grid, collects at most one
 * response per trial and produces a `BlockResult`.
 *
 * Onsets are scheduled against absolute target times (`firstOnset + k * SOI`)
 * so timer jitter does not accumulate. The response window of a trial lasts
 * from its measured onset until the next onset.
 */
export class BlockRunner {
  private readonly opts: BlockRunnerOptions;
  private phase: BlockPhase = 'idle';
  private readonly records: DraftRecord[] = [];
  private activeTrial = -1;
  private stimulusVisible = false;
  private timers = new Set<TimerHandle>();
  private startedAtMs = 0;
  private startedAtEpochMs = 0;
  private firstOnsetMs = 0;
  private result: BlockResult | null = null;

  constructor(options: BlockRunnerOptions) {
    const { config, sequence } = options;
    if (sequence.trials.length !== config.warmupTrials + config.scoredTrials) {
      throw new Error('Sequence length does not match block config');
    }
    if (sequence.n !== config.n) throw new Error('Sequence N does not match block config');
    this.opts = options;
  }

  get totalTrials(): number {
    return this.opts.sequence.trials.length;
  }

  getResult(): BlockResult | null {
    return this.result;
  }

  scheduledOnsetOf(index: number): number {
    return this.firstOnsetMs + index * this.opts.config.soiMs;
  }

  getSnapshot(): BlockSnapshot {
    const trial = this.activeTrial >= 0 ? this.opts.sequence.trials[this.activeTrial] : null;
    return {
      phase: this.phase,
      trialIndex: this.activeTrial,
      stimulusVisible: this.stimulusVisible,
      letter: this.stimulusVisible && trial ? trial.letter : null,
      isWarmup: trial ? !trial.scored : false,
      respondedThisTrial: this.activeTrial >= 0 && this.records[this.activeTrial]?.response !== null,
      scoredPresented: this.records.filter((r) => r.planned.scored).length,
      scoredTotal: this.opts.config.scoredTrials,
    };
  }

  start(): void {
    if (this.phase !== 'idle') throw new Error(`Cannot start a block in phase ${this.phase}`);
    this.phase = 'running';
    this.startedAtMs = this.opts.clock.now();
    this.startedAtEpochMs = (this.opts.wallClock ?? Date.now)();
    this.firstOnsetMs = this.startedAtMs + this.opts.config.leadInMs;
    this.scheduleAt(this.firstOnsetMs, () => this.handleOnset(0));
    this.emit();
  }

  /** Registers a "match" response. Only the first response per trial counts. */
  respond(): ResponseAck {
    if (this.phase !== 'running') return 'not-running';
    const now = this.opts.clock.now();
    if (this.activeTrial < 0) return 'no-active-trial';
    const record = this.records[this.activeTrial];
    if (record.response) {
      record.ignoredResponses += 1;
      return 'duplicate';
    }
    const rtMs = now - record.onsetMs;
    record.response = {
      timestampMs: now,
      rtMs,
      anticipatory: rtMs < this.opts.config.anticipationThresholdMs,
    };
    this.emit();
    return 'accepted';
  }

  /**
   * Aborts the block. The partial data are returned with status `interrupted`
   * and no metrics; such blocks must not feed the adaptation.
   */
  interrupt(reason: InterruptionReason): BlockResult | null {
    if (this.phase !== 'running') return null;
    const now = this.opts.clock.now();
    this.clearTimers();
    if (this.stimulusVisible) this.hideStimulus(now);
    const atTrialIndex = this.activeTrial;
    this.activeTrial = -1;
    this.phase = 'interrupted';
    return this.finalize(now, { reason, atTrialIndex });
  }

  dispose(): void {
    this.clearTimers();
  }

  // --- internals -----------------------------------------------------------

  private handleOnset(index: number): void {
    if (this.phase !== 'running') return;
    const now = this.opts.clock.now();
    const scheduled = this.scheduledOnsetOf(index);
    const lateness = now - scheduled;

    // Close the previous trial's response window.
    if (this.activeTrial >= 0) {
      if (this.stimulusVisible) this.hideStimulus(now);
      this.records[this.activeTrial].windowComplete = true;
    }

    if (lateness > this.opts.config.maxOnsetLatenessMs) {
      this.interrupt('timing-fault');
      return;
    }

    this.records.push({
      planned: this.opts.sequence.trials[index],
      scheduledOnsetMs: scheduled,
      onsetMs: now,
      offsetMs: null,
      response: null,
      ignoredResponses: 0,
      windowComplete: false,
    });
    this.activeTrial = index;
    this.stimulusVisible = true;

    // Offset relative to the measured onset: the stimulus is visible for the
    // full duration even if the onset fired slightly late.
    this.scheduleAt(now + this.opts.config.stimulusDurationMs, () => this.handleOffset(index));
    if (index + 1 < this.totalTrials) {
      this.scheduleAt(this.scheduledOnsetOf(index + 1), () => this.handleOnset(index + 1));
    } else {
      this.scheduleAt(this.scheduledOnsetOf(index + 1), () => this.handleEnd());
    }
    this.emit();
  }

  private handleOffset(index: number): void {
    if (this.phase !== 'running' || this.activeTrial !== index || !this.stimulusVisible) return;
    this.hideStimulus(this.opts.clock.now());
    this.emit();
  }

  private handleEnd(): void {
    if (this.phase !== 'running') return;
    const now = this.opts.clock.now();
    if (this.stimulusVisible) this.hideStimulus(now);
    if (this.activeTrial >= 0) this.records[this.activeTrial].windowComplete = true;
    this.activeTrial = -1;
    this.phase = 'completed';
    this.clearTimers();
    this.finalize(now, null);
  }

  private hideStimulus(now: number): void {
    this.stimulusVisible = false;
    const record = this.records[this.activeTrial];
    if (record && record.offsetMs === null) record.offsetMs = now;
  }

  private finalize(endedAtMs: number, interruption: BlockResult['interruption']): BlockResult {
    const trials: TrialRecord[] = this.records.map((r) => ({
      ...r.planned,
      scheduledOnsetMs: r.scheduledOnsetMs,
      onsetMs: r.onsetMs,
      onsetLatenessMs: r.onsetMs - r.scheduledOnsetMs,
      offsetMs: r.offsetMs,
      response: r.response,
      ignoredResponses: r.ignoredResponses,
      outcome:
        r.planned.scored && r.windowComplete
          ? classifyOutcome(r.planned.isTarget, r.response !== null)
          : null,
    }));
    const completed = interruption === null;
    const { config, sequence, levelIndex } = this.opts;
    const result: BlockResult = {
      id: `${this.startedAtEpochMs.toString(36)}-${sequence.seed.toString(36)}`,
      status: completed ? 'completed' : 'interrupted',
      levelIndex,
      n: config.n,
      soiMs: config.soiMs,
      stimulusDurationMs: config.stimulusDurationMs,
      seed: sequence.seed,
      startedAtEpochMs: this.startedAtEpochMs,
      startedAtMs: this.startedAtMs,
      endedAtMs,
      trials,
      metrics: completed ? computeMetrics(trials) : null,
      interruption,
    };
    this.result = result;
    this.emit();
    this.opts.onEnd?.(result);
    return result;
  }

  private scheduleAt(targetMs: number, fn: () => void): void {
    const delay = Math.max(0, targetMs - this.opts.clock.now());
    const handle = this.opts.scheduler.schedule(() => {
      this.timers.delete(handle);
      fn();
    }, delay);
    this.timers.add(handle);
  }

  private clearTimers(): void {
    this.timers.forEach((h) => this.opts.scheduler.cancel(h));
    this.timers.clear();
  }

  private emit(): void {
    this.opts.onChange?.(this.getSnapshot());
  }
}
