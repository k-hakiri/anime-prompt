import { integer, object, parseAnime } from '../anime/schema.ts';
import type { Anime } from '../anime/schema.ts';

// AniList-only fields end here; nulls and empty lists remain explicit downstream.
export function normalizeAnime(value: unknown): Anime {
  const media = object(value);
  const id = integer(media.id, 1);
  const titles = media.title == null ? {} : object(media.title);
  const title =
    [titles.native, titles.romaji, titles.english].find(
      (value) => typeof value === 'string' && value.trim(),
    ) ?? `Anime ${id}`;
  const studioNodes = media.studios == null ? [] : object(media.studios).nodes;
  if (!Array.isArray(studioNodes)) throw new Error('Invalid AniList studios');
  const studios = studioNodes
    .map((node) => object(node).name)
    .filter((name) => typeof name === 'string' && name.trim());
  return parseAnime({
    anime_id: id,
    title,
    description: media.description || null,
    genres: media.genres ?? [],
    tags: media.tags ?? [],
    episodes: media.episodes ?? null,
    duration: media.duration ?? null,
    format: media.format ?? null,
    source: media.source ?? null,
    studio: studios.length ? studios.join(', ') : null,
    season: media.season ?? null,
    year: media.seasonYear ?? null,
    data_source: 'anilist',
    source_url: `https://anilist.co/anime/${id}`,
  });
}
