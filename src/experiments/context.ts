import { createHash, randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import type { Anime, Season } from '../anime/schema.ts';
import { object, text, integer, SEASONS } from '../anime/schema.ts';
import type {
  Preferences,
  RecommendationContext,
} from '../recommend/context.ts';
import { selectCandidates } from '../recommend/choice.ts';
import { recommend } from '../recommend/run.ts';
import { recommendOpenAI } from '../recommend/openai.ts';
import type { JevEvaluator } from '../providers/jev.ts';
import type { OpenAIRequester } from '../providers/openai.ts';

export const CONTEXT_MODES = [
  'baseline',
  'policy',
  'preference',
  'combined',
] as const;
export type ContextMode = (typeof CONTEXT_MODES)[number];
export interface ContextExperiment {
  id: string;
  context_version: string;
  season: Season;
  year: number;
  candidate_count: number;
  prompt: string;
  policy: string;
  preferences: Preferences;
}
export function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}
export function parseContextExperiment(source: string): ContextExperiment {
  try {
    const row = object(parse(source));
    const preferences = object(row.preferences);
    function strings(value: unknown): string[] {
      if (!Array.isArray(value) || !value.length) throw new Error();
      return value.map((item) => text(item));
    }
    function boundedInteger(value: unknown, min: number, max: number): number {
      const result = integer(value, min);
      if (result > max) throw new Error();
      return result;
    }
    const season = text(row.season) as Season;
    if (!SEASONS.includes(season)) throw new Error();
    return {
      id: text(row.id),
      context_version: text(row.context_version),
      season,
      year: boundedInteger(row.year, 1940, 9999),
      candidate_count: boundedInteger(row.candidate_count, 5, 255),
      prompt: text(row.prompt),
      policy: text(row.policy),
      preferences: {
        likes: strings(preferences.likes),
        dislikes: strings(preferences.dislikes),
      },
    };
  } catch {
    throw new Error('Invalid context experiment definition');
  }
}
export function contextForMode(
  experiment: ContextExperiment,
  mode: ContextMode,
): RecommendationContext {
  return {
    ...(mode === 'policy' || mode === 'combined'
      ? { policy: experiment.policy }
      : {}),
    ...(mode === 'preference' || mode === 'combined'
      ? { preferences: experiment.preferences }
      : {}),
  };
}

// Buffer records until every run succeeds. A failed batch emits no result rows.
export async function runContextExperiment(
  experiment: ContextExperiment,
  anime: Anime[],
  adapters: { jev: JevEvaluator; openai: OpenAIRequester },
  hashes: { rawSha256: string; experimentSha256: string },
  progress: (message: string) => void = () => {},
) {
  const candidates = selectCandidates(anime, experiment);
  if (candidates.length !== experiment.candidate_count)
    throw new Error(
      `Expected ${experiment.candidate_count} candidates; got ${candidates.length}`,
    );
  const batchId = randomUUID();
  const results = [];
  for (const provider of ['jev', 'luna', 'sol'] as const) {
    for (const mode of CONTEXT_MODES) {
      const index: number = results.length + 1;
      progress(`${index}/12 ${provider} × ${mode}`);
      const context = contextForMode(experiment, mode);
      const options = {
        season: experiment.season,
        year: experiment.year,
        inputProfile: 'basic' as const,
        rawSha256: hashes.rawSha256,
        ...(mode === 'baseline' ? {} : { context }),
      };
      const result =
        provider === 'jev'
          ? await recommend(experiment.prompt, anime, adapters.jev, options)
          : await recommendOpenAI(experiment.prompt, anime, adapters.openai, {
              ...options,
              provider,
            });
      results.push({
        ...result,
        experiment_id: experiment.id,
        experiment_sha256: hashes.experimentSha256,
        batch_id: batchId,
        run_index: index,
        run_count: 12,
        context_mode: mode,
        context_version: experiment.context_version,
        context_sha256: sha256(
          JSON.stringify({ version: experiment.context_version, context }),
        ),
        reasoning_effort: result.metadata.reasoning_effort,
      });
    }
  }
  return results;
}
