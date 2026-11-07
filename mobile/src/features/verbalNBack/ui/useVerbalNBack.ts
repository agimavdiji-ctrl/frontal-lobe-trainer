import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { recordBlock } from '../application/trainingService';
import {
  AdaptationDecision,
  AdaptationState,
  BlockResult,
  BlockRunner,
  BlockSnapshot,
  MonotonicClock,
  Scheduler,
  createMonotonicClock,
  getLevel,
  initialAdaptationState,
  prepareBlock,
  systemScheduler,
} from '../engine';
import { VerbalNBackRepository } from '../persistence';

const KEEP_AWAKE_TAG = 'verbal-n-back-block';

export type ScreenStatus = 'loading' | 'ready' | 'running' | 'result';

export interface UseVerbalNBackOptions {
  readonly repository: VerbalNBackRepository;
  readonly clock?: MonotonicClock;
  readonly scheduler?: Scheduler;
}

/**
 * Thin React adapter around the engine. All rules live in `engine/`; this hook
 * only wires lifecycle events (AppState, unmount) and persistence.
 */
export function useVerbalNBack({ repository, clock, scheduler }: UseVerbalNBackOptions) {
  const clockRef = useRef<MonotonicClock>(clock ?? createMonotonicClock());
  const schedulerRef = useRef<Scheduler>(scheduler ?? systemScheduler);
  const runnerRef = useRef<BlockRunner | null>(null);
  const adaptationRef = useRef<AdaptationState>(initialAdaptationState());
  const mountedRef = useRef(true);

  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [adaptation, setAdaptation] = useState<AdaptationState>(adaptationRef.current);
  const [snapshot, setSnapshot] = useState<BlockSnapshot | null>(null);
  const [lastResult, setLastResult] = useState<BlockResult | null>(null);
  const [lastDecision, setLastDecision] = useState<AdaptationDecision | null>(null);
  const [error, setError] = useState<'load' | 'save' | null>(null);

  const updateAdaptation = useCallback((next: AdaptationState) => {
    adaptationRef.current = next;
    if (mountedRef.current) setAdaptation(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    repository
      .loadProgress()
      .then((p) => updateAdaptation(p.adaptation))
      .catch(() => mountedRef.current && setError('load'))
      .finally(() => mountedRef.current && setStatus('ready'));
    return () => {
      mountedRef.current = false;
    };
  }, [repository, updateAdaptation]);

  const handleEnd = useCallback(
    (result: BlockResult) => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
      runnerRef.current = null;
      if (mountedRef.current) {
        setLastResult(result);
        setStatus('result');
      }
      recordBlock(repository, adaptationRef.current, result)
        .then((decision) => {
          updateAdaptation(decision.state);
          if (mountedRef.current) setLastDecision(decision);
        })
        .catch(() => mountedRef.current && setError('save'));
    },
    [repository, updateAdaptation],
  );

  const startBlock = useCallback(() => {
    if (runnerRef.current) return;
    const levelIndex = adaptationRef.current.levelIndex;
    const { config, sequence } = prepareBlock(levelIndex);
    const runner = new BlockRunner({
      config,
      sequence,
      levelIndex,
      clock: clockRef.current,
      scheduler: schedulerRef.current,
      onChange: (s) => mountedRef.current && setSnapshot(s),
      onEnd: handleEnd,
    });
    runnerRef.current = runner;
    setLastResult(null);
    setLastDecision(null);
    setError(null);
    setStatus('running');
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    runner.start();
  }, [handleEnd]);

  /** Called from `onPressIn` for the lowest input latency. */
  const respond = useCallback(() => runnerRef.current?.respond() ?? 'not-running', []);

  const abort = useCallback(() => {
    runnerRef.current?.interrupt('user-abort');
  }, []);

  // Any departure from the foreground invalidates the running block.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') runnerRef.current?.interrupt('app-background');
    });
    return () => sub.remove();
  }, []);

  useEffect(
    () => () => {
      runnerRef.current?.interrupt('unmounted');
      runnerRef.current?.dispose();
    },
    [],
  );

  return {
    status,
    level: getLevel(adaptation.levelIndex),
    adaptation,
    snapshot,
    lastResult,
    lastDecision,
    error,
    startBlock,
    respond,
    abort,
  };
}
