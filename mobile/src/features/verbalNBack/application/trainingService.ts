import { AdaptationDecision, AdaptationState, BlockResult, applyBlockResult } from '../engine';
import { VerbalNBackRepository } from '../persistence';

/**
 * Glue between engine and persistence: applies the adaptation rules to a
 * finished block and stores both the block and the new progress.
 * Interrupted blocks are stored for transparency but do not change progress.
 */
export async function recordBlock(
  repository: VerbalNBackRepository,
  state: AdaptationState,
  result: BlockResult,
): Promise<AdaptationDecision> {
  const decision = applyBlockResult(state, result);
  await repository.appendBlock(result);
  if (decision.action !== 'ignored') {
    await repository.saveProgress(decision.state);
  }
  return decision;
}
