import type { Anime } from './schema.ts';
export type InputProfile = 'basic' | 'full';

export function parseInputProfile(value: unknown): InputProfile {
  if (value !== 'basic' && value !== 'full')
    throw new Error('Input profile must be basic or full');
  return value;
}

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
