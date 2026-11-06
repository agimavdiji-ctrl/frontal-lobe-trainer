import { recordBlock } from '../application/trainingService';
import { BlockResult, initialAdaptationState } from '../engine';
import {
  STORAGE_KEYS,
  createMemoryKeyValueStore,
  createVerbalNBackRepository,
} from '../persistence';
import { metricsWith } from './helpers';

function fakeBlock(id: string, overrides: Partial<BlockResult> = {}): BlockResult {
  return {
    id,
    status: 'completed',
    levelIndex: 0,
    n: 2,
    soiMs: 3000,
    stimulusDurationMs: 500,
    seed: 1,
    startedAtEpochMs: 0,
    startedAtMs: 0,
    endedAtMs: 127_500,
    trials: [],
    metrics: metricsWith(0.9, 0.9),
    interruption: null,
    ...overrides,
  };
}

describe('repository', () => {
  it('returns the initial level when nothing is stored', async () => {
    const repo = createVerbalNBackRepository(createMemoryKeyValueStore());
    const p = await repo.loadProgress();
    expect(p.adaptation).toEqual(initialAdaptationState(0));
  });

  it('round-trips progress', async () => {
    const repo = createVerbalNBackRepository(createMemoryKeyValueStore(), { now: () => 42 });
    const state = { levelIndex: 3, consecutivePromotionBlocks: 1, consecutiveLowBlocks: 0 };
    await repo.saveProgress(state);
    const p = await repo.loadProgress();
    expect(p.adaptation).toEqual(state);
    expect(p.updatedAtEpochMs).toBe(42);
  });

  it('falls back to defaults on corrupt or foreign data and clamps the level', async () => {
    const corrupt = createVerbalNBackRepository(
      createMemoryKeyValueStore({ [STORAGE_KEYS.progress]: '{not json' }),
    );
    expect((await corrupt.loadProgress()).adaptation.levelIndex).toBe(0);

    const tooHigh = createVerbalNBackRepository(
      createMemoryKeyValueStore({
        [STORAGE_KEYS.progress]: JSON.stringify({
          schemaVersion: 1,
          adaptation: { levelIndex: 99, consecutivePromotionBlocks: 0, consecutiveLowBlocks: 0 },
        }),
      }),
    );
    expect((await tooHigh.loadProgress()).adaptation.levelIndex).toBe(5);
  });

  it('stores blocks individually, newest first, and prunes old ones', async () => {
    const store = createMemoryKeyValueStore();
    const repo = createVerbalNBackRepository(store, { historyLimit: 3 });
    await Promise.all(['a', 'b', 'c', 'd'].map((id) => repo.appendBlock(fakeBlock(id))));
    const history = await repo.loadHistory();
    expect(history.map((b) => b.id)).toEqual(['d', 'c', 'b']);
    expect(store.dump()[STORAGE_KEYS.block('a')]).toBeUndefined();
    expect((await repo.loadHistory(1)).map((b) => b.id)).toEqual(['d']);
  });

  it('clears everything', async () => {
    const store = createMemoryKeyValueStore();
    const repo = createVerbalNBackRepository(store);
    await repo.appendBlock(fakeBlock('x'));
    await repo.saveProgress(initialAdaptationState(2));
    await repo.clear();
    expect(store.dump()).toEqual({});
  });
});

describe('recordBlock', () => {
  it('persists the block and the new adaptation state', async () => {
    const repo = createVerbalNBackRepository(createMemoryKeyValueStore());
    let state = initialAdaptationState();
    state = (await recordBlock(repo, state, fakeBlock('1'))).state;
    const d = await recordBlock(repo, state, fakeBlock('2'));
    expect(d.action).toBe('promote');
    expect((await repo.loadProgress()).adaptation.levelIndex).toBe(1);
    expect(await repo.loadHistory()).toHaveLength(2);
  });

  it('stores interrupted blocks but leaves progress untouched', async () => {
    const repo = createVerbalNBackRepository(createMemoryKeyValueStore());
    await repo.saveProgress({ levelIndex: 2, consecutivePromotionBlocks: 1, consecutiveLowBlocks: 0 });
    const d = await recordBlock(
      repo,
      (await repo.loadProgress()).adaptation,
      fakeBlock('i', {
        status: 'interrupted',
        metrics: null,
        interruption: { reason: 'app-background', atTrialIndex: 7 },
      }),
    );
    expect(d.action).toBe('ignored');
    expect((await repo.loadProgress()).adaptation).toEqual({
      levelIndex: 2,
      consecutivePromotionBlocks: 1,
      consecutiveLowBlocks: 0,
    });
    expect((await repo.loadHistory())[0].status).toBe('interrupted');
  });
});
