export const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;
export type Season = (typeof SEASONS)[number];
export interface Anime {
  anime_id: number;
  isAdult: boolean | null;
  title: string;
  description: string | null;
  genres: string[];
  tags: { name: string; rank: number | null }[];
  episodes: number | null;
  duration: number | null;
  format: string | null;
  source: string | null;
  studio: string | null;
  season: Season | null;
  year: number | null;
  data_source: 'anilist';
  source_url: string;
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Expected a nonempty string');
  return value;
}
export function number(value: unknown, min = 0, max = Infinity): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error('Number out of range');
  return value;
}
export function integer(value: unknown, min = 0): number {
  const result = number(value, min);
  if (!Number.isSafeInteger(result)) throw new Error('Expected an integer');
  return result;
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
function nullableInteger(value: unknown): number | null {
  return value === null ? null : integer(value);
}
export function parseAnime(value: unknown): Anime {
  const row = object(value);
  const anime_id = integer(row.anime_id, 1);
  if (row.data_source !== 'anilist') throw new Error('Unsupported data source');
  if (row.season !== null && !SEASONS.includes(row.season as Season))
    throw new Error('Invalid season');
  if (!Array.isArray(row.genres) || !Array.isArray(row.tags))
    throw new Error('Expected genres and tags arrays');
  if (row.isAdult != null && typeof row.isAdult !== 'boolean')
    throw new Error('Invalid isAdult');
  return {
    anime_id,
    isAdult: row.isAdult == null ? null : (row.isAdult as boolean),
    title: text(row.title),
    description: row.description === null ? null : text(row.description),
    genres: row.genres.map(text),
    tags: row.tags.map((value) => {
      const tag = object(value);
      return {
        name: text(tag.name),
        rank: tag.rank === null ? null : number(tag.rank, 0, 100),
      };
    }),
    episodes: nullableInteger(row.episodes),
    duration: nullableInteger(row.duration),
    format: nullableText(row.format),
    source: nullableText(row.source),
    studio: nullableText(row.studio),
    season: row.season as Season | null,
    year: nullableInteger(row.year),
    data_source: 'anilist',
    source_url: text(row.source_url),
  };
}
