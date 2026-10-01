import { createHash } from 'node:crypto';
import type { Anime, Season } from '../anime/schema.ts';
import { integer, object, text } from '../anime/schema.ts';
import { projectAnime } from '../anime/profile.ts';
import { resolveOpenAIModel } from '../providers/openai.ts';
import type { OpenAIProvider, OpenAIRequester } from '../providers/openai.ts';
import { selectCandidates } from './choice.ts';

import { contextInstructions, userContext } from './context.ts';
import type { RecommendationContext } from './context.ts';

const OUTPUT_INSTRUCTIONS =
  '候補外の作品は出さず、IDを重複させないでください。候補が5件以上なら上位5件、5件未満なら全件を順位順に返してください。推薦理由や確率は生成しないでください。';
function digest(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}
export async function recommendOpenAI(
  prompt: string,
  anime: Anime[],
  request: OpenAIRequester,
  options: {
    provider: OpenAIProvider;
    season: Season;
    year: number;
    inputProfile: 'basic' | 'full';
    model?: string;
    rawSha256?: string;
    context?: RecommendationContext;
  },
) {
  text(prompt);
  if (options.inputProfile !== 'basic')
    throw new Error(
      'Luna / Sol support only basic input profile; specify --input-profile basic',
    );
  const model = resolveOpenAIModel(options.provider, options.model);
  const candidates = selectCandidates(anime, options);
  const count = Math.min(5, candidates.length);
  const body = {
    model,
    reasoning: { effort: 'none' },
    store: false,
    instructions: contextInstructions(options.context) + OUTPUT_INSTRUCTIONS,
    input: JSON.stringify({
      mood: prompt,
      ...userContext(options.context),
      candidates: candidates.map((row) => ({
        anime_id: row.anime_id,
        ...projectAnime(row, 'basic'),
      })),
    }),
    text: {
      format: {
        type: 'json_schema',
        name: 'anime_recommendations',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['recommendations'],
          properties: {
            recommendations: {
              type: 'array',
              minItems: count,
              maxItems: count,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['anime_id'],
                properties: {
                  anime_id: {
                    type: 'integer',
                    enum: candidates.map((row) => row.anime_id),
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  const start = performance.now();
  const response = await request(body);
  const latency = performance.now() - start;
  let recommendations: { rank: number; anime_id: number; title: string }[];
  try {
    resolveOpenAIModel(options.provider, response.model);
    const output = object(response.output);
    if (
      Object.keys(output).length !== 1 ||
      !Array.isArray(output.recommendations) ||
      output.recommendations.length !== count
    )
      throw new Error('Invalid count');
    const seen = new Set<number>();
    recommendations = output.recommendations.map((value, index) => {
      const row = object(value);
      if (Object.keys(row).length !== 1) throw new Error('Unexpected fields');
      const id = integer(row.anime_id, 1);
      const candidate = candidates.find((row) => row.anime_id === id);
      if (!candidate || seen.has(id)) throw new Error('Invalid ID');
      seen.add(id);
      return { rank: index + 1, anime_id: id, title: candidate.title };
    });
  } catch {
    throw new Error('Invalid OpenAI recommendations');
  }
  return {
    result_schema_version: 'v3',
    provider: options.provider,
    model: response.model,
    strategy: 'openai-one-shot-v1',
    input_profile: 'basic',
    input_prompt: prompt,
    recommendations,
    reasoning_effort: 'none',
    usage: response.usage,
    latency_ms: latency,
    runtime_cost_usd: null,
    timestamp: new Date().toISOString(),
    metadata: {
      requested_model: model,
      reasoning_effort: 'none',
      candidate_ids: candidates.map((row) => row.anime_id),
      raw_sha256: options.rawSha256 ?? digest(JSON.stringify(anime)),
      input_sha256: digest(JSON.stringify(body)),
      prompt_version: 'recommend-openai-v2',
      season: options.season,
      year: options.year,
      candidate_filter: 'isAdult-false-season-year-v1',
      top_k: 5,
    },
  };
}
export function renderOpenAIHuman(
  result: Awaited<ReturnType<typeof recommendOpenAI>>,
): string {
  return (
    `--- ${result.provider === 'luna' ? 'Luna' : 'Sol'} ---\n` +
    result.recommendations
      .map((row) => `${row.rank}. ${row.title} (ID ${row.anime_id})\n`)
      .join('') +
    `time: ${result.latency_ms.toFixed(1)} ms\nusage: input ${result.usage.input_tokens}, output ${result.usage.output_tokens} tokens\ncost: 未計算\n`
  );
}
