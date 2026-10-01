import { object, integer } from '../anime/schema.ts';
import type { Season } from '../anime/schema.ts';

export const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const QUERY = `query ($page: Int!, $season: MediaSeason!, $year: Int!) {
  Page(page: $page, perPage: 50) {
    pageInfo { currentPage hasNextPage }
    media(type: ANIME, season: $season, seasonYear: $year, isAdult: false, sort: ID) {
      id isAdult title { native romaji english } description(asHtml: false)
      genres tags { name rank } episodes duration format source season seasonYear
      studios(isMain: true) { nodes { name } }
    }
  }
}`;
export async function fetchSeason(
  season: Season,
  year: number,
  request: typeof fetch = fetch,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  const ids = new Set<number>();
  for (let page = 1; page <= 1000; page++) {
    let response: Response;
    try {
      response = await request(ANILIST_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: QUERY,
          variables: { page, season, year },
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error('AniList request failed');
    }
    if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
    let payload: Record<string, unknown>;
    try {
      payload = object(await response.json());
    } catch {
      throw new Error('Invalid AniList JSON response');
    }
    if (payload.errors !== undefined) throw new Error('AniList GraphQL error');
    const result = object(object(payload.data).Page);
    const info = object(result.pageInfo);
    if (
      info.currentPage !== page ||
      typeof info.hasNextPage !== 'boolean' ||
      !Array.isArray(result.media)
    )
      throw new Error('Invalid AniList page');
    if (info.hasNextPage && result.media.length === 0)
      throw new Error('Empty continuing AniList page');
    for (const media of result.media) {
      const id = integer(object(media).id, 1);
      if (ids.has(id)) throw new Error('Duplicate AniList anime ID');
      ids.add(id);
      rows.push(media);
    }
    if (!info.hasNextPage) return rows;
  }
  throw new Error('AniList pagination limit exceeded');
}
