import type { Anime } from '../anime/schema.ts';
import { AXES, digest } from '../features/schema.ts';
import type {
  FeatureRecord,
  FeatureSchema,
  MoodProfile,
} from '../features/schema.ts';
import { projectAnime } from '../features/profile.ts';

export interface Candidate {
  anime: Anime;
  feature: FeatureRecord;
}
export function prepareCandidates(
  anime: Anime[],
  features: FeatureRecord[],
  schema: FeatureSchema,
): Candidate[] {
  if (!anime.length || anime.length !== features.length)
    throw new Error(
      'Raw and feature candidate sets must be nonempty and identical',
    );
  const rawIds = new Set(anime.map((row) => row.anime_id));
  const featureMap = new Map(features.map((row) => [row.anime_id, row]));
  if (rawIds.size !== anime.length || featureMap.size !== features.length)
    throw new Error('Duplicate anime IDs');
  const first = features[0]!;
  return anime.map((row) => {
    const feature = featureMap.get(row.anime_id);
    if (!feature) throw new Error('Missing candidate features');
    if (
      feature.feature_schema_version !== schema.version ||
      feature.schema_sha256 !== schema.hash
    )
      throw new Error('Feature schema version or content mismatch');
    if (
      feature.input_profile !== first.input_profile ||
      feature.model !== first.model ||
      feature.requested_model !== first.requested_model ||
      feature.prompt_version !== 'anime-score-v1'
    )
      throw new Error('Incompatible feature generation conditions');
    if (
      feature.input_sha256 !==
      digest(JSON.stringify(projectAnime(row, feature.input_profile)))
    )
      throw new Error('Features do not match normalized anime input');
    return { anime: row, feature };
  });
}
export interface Recommendation {
  rank: number;
  anime_id: number;
  title: string;
  score: number;
  reason: string;
}
export function rankCandidates(
  candidates: Candidate[],
  profile: MoodProfile,
): Recommendation[] {
  const ranked = candidates
    .map(({ anime, feature }) => {
      if (
        feature.feature_schema_version !== profile.feature_schema_version ||
        feature.schema_sha256 !== profile.schema_sha256
      )
        throw new Error('Mood and anime feature schemas differ');
      const differences = AXES.map((axis) => ({
        axis,
        difference: Math.abs(
          feature.features[axis].score - profile.features[axis].score,
        ),
      }));
      const distance = Math.sqrt(
        differences.reduce((sum, row) => sum + row.difference ** 2, 0) /
          AXES.length,
      );
      const closest = [...differences]
        .sort((a, b) => a.difference - b.difference)
        .slice(0, 3);
      const reason = closest
        .map(
          ({ axis }) =>
            `${axis}: 希望 ${profile.features[axis].score.toFixed(2)} / 作品 ${feature.features[axis].score.toFixed(2)}`,
        )
        .join('、');
      return {
        anime_id: anime.anime_id,
        title: anime.title,
        score: 1 - distance,
        reason,
      };
    })
    .sort((a, b) => b.score - a.score || a.anime_id - b.anime_id);
  return ranked.slice(0, 5).map((row, index) => ({ rank: index + 1, ...row }));
}
