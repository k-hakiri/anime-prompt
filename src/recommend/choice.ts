import { createHash } from 'node:crypto';
import type { Anime, Season } from '../anime/schema.ts';
import { integer, number, object, text } from '../anime/schema.ts';
import { parseInputProfile, projectAnime } from '../anime/profile.ts';
import type { InputProfile } from '../anime/profile.ts';
import type { ChoiceQuestion, JevEvaluator } from '../providers/jev.ts';
import { JEV_MODEL } from '../providers/jev.ts';

import { RECOMMENDATION_INSTRUCTIONS } from './instructions.ts';
// Preserve the existing tolerance; observed cent-grid responses may miss one point.
const SUM_TOLERANCE = 0.001;
const CENT_GRID_SUM_TOLERANCE = 0.01;
const FLOAT_TOLERANCE = 1e-12;
function digest(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}
export async function recommendChoice(
  prompt: string,
  anime: Anime[],
  evaluate: JevEvaluator,
  options: {
    season: Season;
    year: number;
    inputProfile?: InputProfile;
    model?: string;
    rawSha256?: string;
  },
) {
  text(prompt);
  const profile = parseInputProfile(options.inputProfile ?? 'full');
  const candidates = selectCandidates(anime, options);
  if (candidates.length > 255)
    throw new Error('Jev Choice supports at most 255 candidates');
  const state = { mood: prompt };
  const questions: Record<string, ChoiceQuestion> = {
    recommend: {
      type: 'choice',
      instructions: RECOMMENDATION_INSTRUCTIONS,
      criteria: Object.fromEntries(
        candidates.map((row) => [
          String(row.anime_id),
          projectAnime(row, profile),
        ]),
      ),
    },
  };
  const start = performance.now();
  const response = await evaluate(state, questions);
  const answer = object(response.answers.recommend);
  if (answer.type !== 'choice') throw new Error('Jev answer must be Choice');
  const probabilities = object(answer.probabilities);
  if (
    Object.keys(probabilities).length !== candidates.length ||
    candidates.some(
      (row) => !Object.hasOwn(probabilities, String(row.anime_id)),
    )
  )
    throw new Error('Jev probabilities must match candidate IDs');
  const ranked = candidates
    .map((row) => ({
      anime_id: row.anime_id,
      title: row.title,
      probability: number(probabilities[String(row.anime_id)], 0, 1),
    }))
    .sort((a, b) => b.probability - a.probability || a.anime_id - b.anime_id);
  const total = ranked.reduce((sum, row) => sum + row.probability, 0);
  const centGrid = ranked.every(
    (row) =>
      Math.abs(row.probability * 100 - Math.round(row.probability * 100)) <=
      FLOAT_TOLERANCE,
  );
  const tolerance = centGrid ? CENT_GRID_SUM_TOLERANCE : SUM_TOLERANCE;
  if (total <= 0 || Math.abs(total - 1) > tolerance + FLOAT_TOLERANCE)
    throw new Error(`Jev probabilities must sum to 1 (sum=${total})`);
  const choice = text(answer.choice);
  if (
    !Object.hasOwn(probabilities, choice) ||
    probabilities[choice] !== ranked[0]!.probability
  )
    throw new Error('Jev choice must have the highest probability');
  const confidence = number(answer.confidence, 0, 1);
  const recommendations = ranked.slice(0, 5).map((row, index) => ({
    rank: index + 1,
    ...row,
    probability: row.probability / total,
  }));
  return {
    result_schema_version: 'v2',
    input_prompt: prompt,
    input_profile: profile,
    provider: 'typesafe',
    model: text(response.model),
    strategy: 'jev-choice-v1',
    recommendations,
    probabilities: Object.fromEntries(
      candidates.map((row) => [
        String(row.anime_id),
        probabilities[String(row.anime_id)],
      ]),
    ),
    normalized_probabilities: Object.fromEntries(
      ranked.map((row) => [String(row.anime_id), row.probability / total]),
    ),
    confidence,
    usage: {
      input_tokens: integer(response.usage.input_tokens),
      output_tokens: integer(response.usage.output_tokens),
    },
    runtime_cost_usd: null,
    latency_ms: performance.now() - start,
    timestamp: new Date().toISOString(),
    metadata: {
      requested_model: options.model ?? JEV_MODEL,
      reasoning_effort: null,
      prompt_version: 'recommend-choice-v2',
      top_k: 5,
      probability_sum: total,
      probability_sum_tolerance: tolerance,
      probability_policy: 'bounded-cent-grid-v1',
      season: options.season,
      year: options.year,
      candidate_filter: 'isAdult-false-season-year-v1',
      candidate_ids: candidates.map((row) => row.anime_id),
      raw_sha256: options.rawSha256 ?? digest(JSON.stringify(anime)),
      input_sha256: digest(JSON.stringify({ state, questions })),
    },
  };
}

export function selectCandidates(
  anime: Anime[],
  options: { season: Season; year: number },
): Anime[] {
  const ids = new Set<number>();
  for (const row of anime) {
    integer(row.anime_id, 1);
    if (ids.has(row.anime_id)) throw new Error('Duplicate candidate anime ID');
    ids.add(row.anime_id);
  }
  const candidates = anime
    .filter(
      (row) =>
        row.isAdult === false &&
        row.season === options.season &&
        row.year === options.year,
    )
    .sort((a, b) => a.anime_id - b.anime_id);
  if (!candidates.length)
    throw new Error(
      'No non-adult candidates for season/year; fetch raw data again',
    );
  return candidates;
}
