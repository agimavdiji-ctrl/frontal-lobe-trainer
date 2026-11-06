export * from './types';
export * from './config';
export * from './random';
export * from './sequence';
export * from './scoring';
export * from './adaptation';
export * from './clock';
export * from './blockRunner';

import { createBlockConfig, getLevel } from './config';
import { createRng, randomSeed } from './random';
import { generateSequence } from './sequence';
import { BlockConfig, GeneratedSequence } from './types';

/** Convenience: config + validated sequence for a ladder level. */
export function prepareBlock(
  levelIndex: number,
  seed: number = randomSeed(),
  overrides: Partial<BlockConfig> = {},
): { config: BlockConfig; sequence: GeneratedSequence } {
  const config = createBlockConfig(getLevel(levelIndex), overrides);
  const sequence = generateSequence(config, createRng(seed), seed);
  return { config, sequence };
}
