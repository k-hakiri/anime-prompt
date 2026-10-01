import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAnime } from '../../src/anilist/normalize.ts';
import { fetchSeason } from '../../src/anilist/client.ts';
import { parseAnime } from '../../src/anime/schema.ts';

test('normalization accepts nullable studio nodes and skips null elements', () => {
  for (const studios of [{}, { nodes: null }, { nodes: [null] }]) {
    assert.equal(normalizeAnime({ id: 1, studios }).studio, null);
  }
  assert.equal(
    normalizeAnime({
      id: 1,
      studios: { nodes: [null, { name: 'Synthetic Studio' }] },
    }).studio,
    'Synthetic Studio',
  );
  assert.throws(() => normalizeAnime({ id: 1, studios: { nodes: 'invalid' } }));
});

test('normalization uses stable IDs, title preference, nulls and provenance', () => {
  const anime = normalizeAnime({
    id: 1,
    title: { native: '架空の旅', romaji: 'Synthetic' },
    tags: [{ name: 'Travel', rank: 80 }],
  });
  assert.equal(anime.anime_id, 1);
  assert.equal(anime.title, '架空の旅');
  assert.equal(anime.description, null);
  assert.deepEqual(anime.genres, []);
  assert.equal(anime.data_source, 'anilist');
  assert.deepEqual(parseAnime(anime), anime);
  assert.equal(normalizeAnime({ id: 2 }).title, 'Anime 2');
  assert.throws(() => normalizeAnime({ id: '1' }));
  assert.throws(() => parseAnime({ ...anime, episodes: -1 }));
});
test('fetches all pages with fixed season/year and deterministic IDs', async () => {
  const calls: unknown[] = [];
  const request: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body.variables);
    assert.match(body.query, /isAdult: false/);
    assert.match(body.query, /id isAdult title/);
    return Response.json({
      data: {
        Page: {
          pageInfo: {
            currentPage: body.variables.page,
            hasNextPage: body.variables.page === 1,
          },
          media: [{ id: body.variables.page }],
        },
      },
    });
  };
  assert.deepEqual(await fetchSeason('FALL', 2026, request), [
    { id: 1 },
    { id: 2 },
  ]);
  assert.deepEqual(calls, [
    { page: 1, season: 'FALL', year: 2026 },
    { page: 2, season: 'FALL', year: 2026 },
  ]);
});
test('HTTP, GraphQL, malformed JSON/page and duplicate IDs fail', async () => {
  const responses = [
    new Response('private diagnostic', { status: 429 }),
    Response.json({ errors: [{ message: 'private diagnostic' }] }),
    new Response('invalid'),
    Response.json({
      data: {
        Page: { pageInfo: { currentPage: 1, hasNextPage: true }, media: [] },
      },
    }),
    Response.json({
      data: {
        Page: {
          pageInfo: { currentPage: 1, hasNextPage: false },
          media: [{ id: 1 }, { id: 1 }],
        },
      },
    }),
  ];
  for (const response of responses) {
    await assert.rejects(fetchSeason('FALL', 2026, async () => response));
  }
  await assert.rejects(
    fetchSeason('FALL', 2026, async () => {
      throw new Error('private diagnostic');
    }),
    /AniList request failed/,
  );
});

test('adult status is preserved; old cache status remains unknown and invalid status fails', () => {
  assert.equal(normalizeAnime({ id: 1, isAdult: false }).isAdult, false);
  assert.equal(normalizeAnime({ id: 2, isAdult: true }).isAdult, true);
  assert.equal(normalizeAnime({ id: 3 }).isAdult, null);
  assert.throws(() => normalizeAnime({ id: 4, isAdult: 'false' }));
});
