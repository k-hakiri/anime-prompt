import type { Anime } from '../anime/schema.ts';
import { text } from '../anime/schema.ts';
import { scoreState } from '../features/build.ts';
import {
  digest,
  parseMoodProfile,
  parseProvenance,
} from '../features/schema.ts';
import type { FeatureRecord, FeatureSchema } from '../features/schema.ts';
import type { JevEvaluator } from '../providers/jev.ts';
import { JEV_MODEL } from '../providers/jev.ts';
import { prepareCandidates, rankCandidates } from './rank.ts';

export async function recommend(
  prompt: string,
  anime: Anime[],
  features: FeatureRecord[],
  schema: FeatureSchema,
  evaluate: JevEvaluator,
  model = JEV_MODEL,
) {
  text(prompt);
  const candidates = prepareCandidates(anime, features, schema);
  const start = performance.now();
  const scored = await scoreState(
    { mood: prompt },
    schema,
    evaluate,
    'mood',
    model,
  );
  const provenance = parseProvenance(scored.provenance);
  const profile = parseMoodProfile({
    profile_schema_version: 'v1',
    original_prompt: prompt,
    feature_schema_version: schema.version,
    schema_sha256: schema.hash,
    features: scored.features,
  });
  const recommendations = rankCandidates(candidates, profile);
  return {
    result_schema_version: 'v1',
    input_prompt: prompt,
    input_profile: profile,
    provider: provenance.provider,
    model: provenance.model,
    strategy: 'jev-euclidean-v1',
    recommendations,
    usage: provenance.usage,
    runtime_cost_usd: null,
    latency_ms: performance.now() - start,
    timestamp: new Date().toISOString(),
    metadata: {
      ...provenance,
      reasoning_effort: null,
      weights: Object.fromEntries(
        Object.keys(schema.features).map((axis) => [axis, 1]),
      ),
      top_k: 5,
      candidate_ids: anime.map((row) => row.anime_id).sort((a, b) => a - b),
      raw_sha256: digest(JSON.stringify(anime)),
      features_sha256: digest(JSON.stringify(features)),
      feature_generation: {
        input_profile: features[0]!.input_profile,
        provider: features[0]!.provider,
        model: features[0]!.model,
        requested_model: features[0]!.requested_model,
        prompt_version: features[0]!.prompt_version,
      },
    },
  };
}
export function renderHuman(
  result: Awaited<ReturnType<typeof recommend>>,
): string {
  const labels: Record<string, string> = {
    healing: '癒やし度',
    cognitive_load: '頭を使う度合い',
    seriousness: 'シリアス度',
    world_building: '世界観',
    character_focus: 'キャラクター',
    travel: '旅・土地性',
  };
  return (
    `--- Jev ---\n` +
    result.recommendations
      .map(
        (row) =>
          `${row.rank}. ${row.title} (ID ${row.anime_id})\n   ${row.reason.replace(
            /(healing|cognitive_load|seriousness|world_building|character_focus|travel):/g,
            (_, axis: string) => labels[axis] + ':',
          )}\n`,
      )
      .join('') +
    `time: ${result.latency_ms.toFixed(1)} ms\nusage: input ${result.usage.input_tokens}, output ${result.usage.output_tokens} tokens\ncost: 未計算\n`
  );
}
