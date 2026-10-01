import { createHash } from 'node:crypto';
import type { Anime } from '../anime/schema.ts';
import { recommendChoice, selectCandidates } from './choice.ts';

// Empirically validated with SUMMER 2026 full metadata; not a token guarantee.
export const STAGED_GROUP_MAX_CANDIDATES = 27;
export function assignGroups(candidates: Anime[]): Anime[][] {
  const count = Math.ceil(candidates.length / STAGED_GROUP_MAX_CANDIDATES);
  const groups: Anime[][] = Array.from({ length: count }, () => []);
  [...candidates]
    .sort((a, b) => a.anime_id - b.anime_id)
    .forEach((row, index) => groups[index % count]!.push(row));
  return groups;
}
function stageRecord(result: Awaited<ReturnType<typeof recommendChoice>>) {
  return {
    candidate_ids: result.metadata.candidate_ids,
    model: result.model,
    probabilities: result.probabilities,
    normalized_probabilities: result.normalized_probabilities,
    confidence: result.confidence,
    usage: result.usage,
    latency_ms: result.latency_ms,
    input_sha256: result.metadata.input_sha256,
    prompt_version: result.metadata.prompt_version,
    probability_sum: result.metadata.probability_sum,
    probability_sum_tolerance: result.metadata.probability_sum_tolerance,
    probability_policy: result.metadata.probability_policy,
    selected_ids: result.recommendations.map((row) => row.anime_id),
  };
}
export async function recommend(
  ...[prompt, anime, evaluate, options]: Parameters<typeof recommendChoice>
) {
  if ((options.inputProfile ?? 'full') === 'basic')
    return recommendChoice(prompt, anime, evaluate, options);

  // Validate/filter the full candidate set before any API request.
  const candidates = selectCandidates(anime, options);
  if (candidates.length > 255)
    throw new Error('Jev Choice supports at most 255 candidates');
  const groups = assignGroups(candidates);
  const start = performance.now();
  const first = await Promise.all(
    groups.map((group) => recommendChoice(prompt, group, evaluate, options)),
  );
  const finalistIds = new Set(
    first.flatMap((result) =>
      result.recommendations.map((row) => row.anime_id),
    ),
  );
  const finalists = candidates.filter((row) => finalistIds.has(row.anime_id));
  const final = await recommendChoice(prompt, finalists, evaluate, options);
  if (first.some((result) => result.model !== final.model))
    throw new Error('Jev staged responses must use the same model');
  const wallClock = performance.now() - start;
  const firstStages = first.map((result, index) => ({
    group_index: index,
    ...stageRecord(result),
  }));
  const finalStage = stageRecord(final);
  const all = [...first, final];
  const usage = all.reduce(
    (total, result) => ({
      input_tokens: total.input_tokens + result.usage.input_tokens,
      output_tokens: total.output_tokens + result.usage.output_tokens,
    }),
    { input_tokens: 0, output_tokens: 0 },
  );
  return {
    ...final,
    strategy: 'jev-staged-choice-v1',
    group_count: groups.length,
    first_stages: firstStages,
    finalists: finalists.map((row) => row.anime_id),
    final_stage: finalStage,
    api_call_count: all.length,
    usage,
    api_latency_sum_ms: all.reduce((sum, result) => sum + result.latency_ms, 0),
    wall_clock_latency_ms: wallClock,
    latency_ms: wallClock,
    metadata: {
      ...final.metadata,
      prompt_version: 'recommend-staged-choice-v1',
      grouping_version: 'anime-id-round-robin-v1',
      group_max_candidates: STAGED_GROUP_MAX_CANDIDATES,
      group_assignment: groups.map((group) => group.map((row) => row.anime_id)),
      candidate_ids: candidates.map((row) => row.anime_id),
      raw_sha256: options.rawSha256 ?? digest(JSON.stringify(anime)),
      input_sha256: digest(
        JSON.stringify({
          strategy: 'jev-staged-choice-v1',
          grouping_version: 'anime-id-round-robin-v1',
          group_max_candidates: STAGED_GROUP_MAX_CANDIDATES,
          first_stage_inputs: firstStages.map((stage) => stage.input_sha256),
          final_stage_input: finalStage.input_sha256,
        }),
      ),
    },
  };
}
function digest(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}
export function renderHuman(
  result: Awaited<ReturnType<typeof recommend>>,
): string {
  return (
    '--- Jev ---\n' +
    result.recommendations
      .map(
        (row) =>
          `${row.rank}. ${row.title} (ID ${row.anime_id})  ${(row.probability * 100).toFixed(1)}%\n`,
      )
      .join('') +
    `confidence: ${result.confidence.toFixed(3)}\ntime: ${result.latency_ms.toFixed(1)} ms\nusage: input ${result.usage.input_tokens}, output ${result.usage.output_tokens} tokens\ncost: 未計算\n`
  );
}
