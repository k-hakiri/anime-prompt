import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeAnime } from '../../src/anilist/normalize.ts';
import {
  AXES,
  loadSchema,
  parseFeatureRecord,
  parseMoodProfile,
  parseVector,
} from '../../src/features/schema.ts';
import { projectAnime } from '../../src/features/profile.ts';
import { buildFeatures, scoreState } from '../../src/features/build.ts';
import {
  createJevEvaluator,
  JEV_MODEL,
  JEV_ENDPOINT,
} from '../../src/providers/jev.ts';
import type { JevEvaluator } from '../../src/providers/jev.ts';

const anime = normalizeAnime({
  id: 1,
  title: { native: '架空の旅' },
  tags: [{ name: 'Synthetic Travel', rank: 80 }],
  source: 'ORIGINAL',
  studios: { nodes: [{ name: 'Synthetic Studio' }] },
});
function result() {
  return {
    model: JEV_MODEL,
    answers: Object.fromEntries(
      AXES.map((axis) => [
        axis,
        { type: 'score', score: 3.2, confidence: 0.8 },
      ]),
    ),
    usage: { input_tokens: 100, output_tokens: 12 },
  };
}
const evaluate: JevEvaluator = async () => result();
test('basic/full profiles exclude studio and keep exact documented fields', () => {
  assert.deepEqual(
    Object.keys(projectAnime(anime, 'basic')).sort(),
    ['title', 'description', 'genres', 'format', 'episodes', 'duration'].sort(),
  );
  const full = projectAnime(anime, 'full');
  assert.deepEqual(full.tags, anime.tags);
  assert.equal(full.source, 'ORIGINAL');
  assert.equal('studio' in full, false);
  assert.equal('anime_id' in full, false);
});
test('one API call carries six Score questions; decimals, confidence and provenance survive', async () => {
  const schema = await loadSchema();
  let calls = 0;
  const record = await buildFeatures(
    anime,
    schema,
    'full',
    async (state, questions) => {
      calls++;
      assert.deepEqual(state, projectAnime(anime, 'full'));
      assert.equal(Object.keys(questions).length, 6);
      assert.equal(questions.healing?.type, 'score');
      assert.equal(questions.healing?.criteria.length, 5);
      return result();
    },
  );
  assert.equal(calls, 1);
  assert.equal(record.features.healing.score, 0.8);
  assert.equal(record.features.healing.confidence, 0.8);
  assert.equal(record.feature_schema_version, 'v1');
  assert.equal(record.anime_id, 1);
  assert.equal(record.input_profile, 'full');
  assert.equal(record.provider, 'typesafe');
  assert.equal(record.model, JEV_MODEL);
  assert.equal(record.usage.input_tokens, 100);
  assert.match(record.schema_sha256, /^[a-f0-9]{64}$/);
  assert.ok(record.latency_ms >= 0);
  assert.equal('title' in record, false);
  assert.deepEqual(parseFeatureRecord(record), record);
  const mood = {
    profile_schema_version: 'v1',
    original_prompt: '  旅がしたい  ',
    feature_schema_version: schema.version,
    schema_sha256: schema.hash,
    features: record.features,
  };
  assert.equal(parseMoodProfile(mood).original_prompt, mood.original_prompt);
});
test('invalid Score outputs, missing axes, versions and non-finite values fail validation', async () => {
  const schema = await loadSchema();
  for (const answer of [
    { type: 'choice', score: 2, confidence: 0.5 },
    { type: 'score', score: 5, confidence: 0.5 },
    { type: 'score', score: 2, confidence: -1 },
    { type: 'score', score: '2', confidence: 0.5 },
    null,
  ]) {
    await assert.rejects(
      scoreState(
        anime,
        schema,
        async () => ({
          ...result(),
          answers: { ...result().answers, healing: answer },
        }),
        'anime',
      ),
    );
  }
  const record = await buildFeatures(anime, schema, 'basic', evaluate);
  assert.throws(() =>
    parseVector({
      ...record.features,
      healing: { score: NaN, confidence: 0.5 },
    }),
  );
  assert.throws(() => parseVector({}));
  assert.throws(() =>
    parseFeatureRecord({ ...record, input_profile: 'unknown' }),
  );
  assert.throws(() =>
    parseFeatureRecord({ ...record, schema_sha256: 'invalid' }),
  );
  assert.throws(() => parseMoodProfile({ profile_schema_version: 'v2' }));
});
test('YAML schemas validate axes and ordered level count; content changes alter hash', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'anime-schema-'));
  try {
    const path = join(directory, 'schema.yaml');
    await writeFile(path, 'version: v1\nfeatures: {}\n');
    await assert.rejects(loadSchema(path));
    const source = {
      version: 'v2',
      features: Object.fromEntries(
        AXES.map((axis) => [
          axis,
          { description: axis, criteria: ['zero', 'one'] },
        ]),
      ),
    };
    await writeFile(path, JSON.stringify(source));
    const schema = await loadSchema(path);
    assert.equal(schema.version, 'v2');
    await writeFile(path, JSON.stringify(source) + '\n');
    assert.notEqual((await loadSchema(path)).hash, schema.hash);
    source.features.healing!.criteria = ['zero'];
    await writeFile(path, JSON.stringify(source));
    await assert.rejects(loadSchema(path));
  } finally {
    await rm(directory, { recursive: true });
  }
});
test('Jev adapter authenticates and validates response with redacted errors', async () => {
  const schema = await loadSchema();
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, JEV_ENDPOINT);
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'Bearer synthetic-test-key',
    );
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, JEV_MODEL);
    assert.equal(Object.keys(body.questions).length, 6);
    return Response.json(result());
  };
  await buildFeatures(
    anime,
    schema,
    'full',
    createJevEvaluator('synthetic-test-key', JEV_MODEL, request),
  );
  for (const request of [
    async () => new Response('synthetic-test-key', { status: 401 }),
    async () => {
      throw new Error('synthetic-test-key');
    },
    async () =>
      Response.json({
        model: JEV_MODEL,
        answers: {},
        usage: { input_tokens: -1, output_tokens: 0 },
      }),
  ]) {
    await assert.rejects(
      createJevEvaluator('synthetic-test-key', JEV_MODEL, request)({}, {}),
      (error: Error) => !error.message.includes('synthetic-test-key'),
    );
  }
  await assert.rejects(createJevEvaluator('')({}, {}), /TYPESAFE_API_KEY/);
});
