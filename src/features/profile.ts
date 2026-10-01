import type { Anime } from '../anime/schema.ts';
import type { InputProfile } from './schema.ts';

export function projectAnime(
  anime: Anime,
  profile: InputProfile,
): Record<string, unknown> {
  const basic = {
    title: anime.title,
    description: anime.description,
    genres: anime.genres,
    format: anime.format,
    episodes: anime.episodes,
    duration: anime.duration,
  };
  return profile === 'basic'
    ? basic
    : { ...basic, tags: anime.tags, source: anime.source };
}
