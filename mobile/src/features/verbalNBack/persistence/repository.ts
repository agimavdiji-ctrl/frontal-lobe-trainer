import {
  AdaptationState,
  BlockResult,
  INITIAL_LEVEL_INDEX,
  LEVEL_LADDER,
  clampLevelIndex,
  initialAdaptationState,
} from '../engine';
import { KeyValueStore } from './keyValueStore';

export const SCHEMA_VERSION = 1;
const PREFIX = 'verbalNBack:v1';
export const STORAGE_KEYS = {
  progress: `${PREFIX}:progress`,
  blockIndex: `${PREFIX}:blocks`,
  block: (id: string) => `${PREFIX}:block:${id}`,
} as const;

export interface StoredProgress {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly adaptation: AdaptationState;
  readonly updatedAtEpochMs: number;
}

export interface VerbalNBackRepository {
  loadProgress(): Promise<StoredProgress>;
  saveProgress(adaptation: AdaptationState): Promise<StoredProgress>;
  /** Stores a block (completed or interrupted) and prunes old entries. */
  appendBlock(result: BlockResult): Promise<void>;
  /** Newest first. */
  loadHistory(limit?: number): Promise<BlockResult[]>;
  clear(): Promise<void>;
}

export interface RepositoryOptions {
  /** Maximum number of stored blocks; older ones are deleted. */
  readonly historyLimit?: number;
  readonly now?: () => number;
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** Parses stored progress defensively; corrupt data fall back to defaults. */
export function parseProgress(raw: string | null): StoredProgress | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<StoredProgress>;
    const a = data?.adaptation as Partial<AdaptationState> | undefined;
    if (
      data?.schemaVersion !== SCHEMA_VERSION ||
      !a ||
      !isNonNegativeInt(a.levelIndex) ||
      !isNonNegativeInt(a.consecutivePromotionBlocks) ||
      !isNonNegativeInt(a.consecutiveLowBlocks)
    ) {
      return null;
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      adaptation: {
        levelIndex: clampLevelIndex(a.levelIndex, LEVEL_LADDER),
        consecutivePromotionBlocks: a.consecutivePromotionBlocks,
        consecutiveLowBlocks: a.consecutiveLowBlocks,
      },
      updatedAtEpochMs: typeof data.updatedAtEpochMs === 'number' ? data.updatedAtEpochMs : 0,
    };
  } catch {
    return null;
  }
}

function parseIndex(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function createVerbalNBackRepository(
  store: KeyValueStore,
  { historyLimit = 300, now = Date.now }: RepositoryOptions = {},
): VerbalNBackRepository {
  // Serialise writes so that concurrent appends cannot lose index entries.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    async loadProgress() {
      const parsed = parseProgress(await store.getItem(STORAGE_KEYS.progress));
      return (
        parsed ?? {
          schemaVersion: SCHEMA_VERSION,
          adaptation: initialAdaptationState(INITIAL_LEVEL_INDEX),
          updatedAtEpochMs: 0,
        }
      );
    },

    saveProgress(adaptation) {
      return enqueue(async () => {
        const progress: StoredProgress = {
          schemaVersion: SCHEMA_VERSION,
          adaptation,
          updatedAtEpochMs: now(),
        };
        await store.setItem(STORAGE_KEYS.progress, JSON.stringify(progress));
        return progress;
      });
    },

    appendBlock(result) {
      return enqueue(async () => {
        // One key per block keeps every entry small (Android limits row size).
        await store.setItem(STORAGE_KEYS.block(result.id), JSON.stringify(result));
        const ids = parseIndex(await store.getItem(STORAGE_KEYS.blockIndex)).filter(
          (id) => id !== result.id,
        );
        ids.push(result.id);
        const overflow = Math.max(0, ids.length - historyLimit);
        const removed = ids.splice(0, overflow);
        await store.setItem(STORAGE_KEYS.blockIndex, JSON.stringify(ids));
        await Promise.all(removed.map((id) => store.removeItem(STORAGE_KEYS.block(id))));
      });
    },

    async loadHistory(limit = Infinity) {
      const ids = parseIndex(await store.getItem(STORAGE_KEYS.blockIndex)).reverse();
      const selected = ids.slice(0, Math.min(ids.length, limit));
      const raws = await Promise.all(selected.map((id) => store.getItem(STORAGE_KEYS.block(id))));
      const blocks: BlockResult[] = [];
      for (const raw of raws) {
        if (!raw) continue;
        try {
          blocks.push(JSON.parse(raw) as BlockResult);
        } catch {
          // Skip corrupt entries instead of failing the whole history.
        }
      }
      return blocks;
    },

    clear() {
      return enqueue(async () => {
        const ids = parseIndex(await store.getItem(STORAGE_KEYS.blockIndex));
        await Promise.all(ids.map((id) => store.removeItem(STORAGE_KEYS.block(id))));
        await store.removeItem(STORAGE_KEYS.blockIndex);
        await store.removeItem(STORAGE_KEYS.progress);
      });
    },
  };
}
