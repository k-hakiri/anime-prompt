import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { normalizeAnime } from '../../src/anilist/normalize.ts';
import {
  AXES,
  loadSchema,
  parseMoodProfile,
} from '../../src/features/schema.ts';
import { buildFeatures } from '../../src/features/build.ts';
import { prepareCandidates, rankCandidates } from '../../src/recommend/rank.ts';
import { recommend } from '../../src/recommend/legacy.ts';
import { readPrompt } from '../../src/cli/prompt.ts';
import type { JevEvaluator } from '../../src/providers/jev.ts';

function evaluator(score: number): JevEvaluator {
  return async () => ({
    model: 'jev-1.13.0',
    answers: Object.fromEntries(
      AXES.map((axis) => [axis, { type: 'score', score, confidence: 0.9 }]),
    ),
    usage: { input_tokens: 100, output_tokens: 12 },
  });
}
test('Euclidean ranking preserves candidate IDs, deterministic ties, Top 5 and ignores confidence', async () => {
  const schema = await loadSchema();
  const anime = [7, 6, 5, 4, 3, 2, 1].map((id) => normalizeAnime({ id }));
  const features = await Promise.all(
    anime.map((row) =>
      buildFeatures(row, schema, 'full', evaluator(row.anime_id === 7 ? 4 : 2)),
    ),
  );
  features[0]!.features.healing.confidence = 0;
  const profile = parseMoodProfile({
    profile_schema_version: 'v1',
    original_prompt: 'synthetic mood',
    feature_schema_version: schema.version,
    schema_sha256: schema.hash,
    features: Object.fromEntries(
      AXES.map((axis) => [axis, { score: 1, confidence: 0.2 }]),
    ),
  });
  const result = rankCandidates(
    prepareCandidates(anime, features, schema),
    profile,
  );
  assert.deepEqual(
    result.map((row) => row.anime_id),
    [7, 1, 2, 3, 4],
  );
  assert.equal(result[0]!.score, 1);
  assert.equal(result[1]!.score, 0.5);
  assert.deepEqual(
    result.map((row) => row.rank),
    [1, 2, 3, 4, 5],
  );
  assert.ok(result[0]!.reason);
});
test('joins fail on missing, duplicate, stale or incompatible features before API cost', async () => {
  const schema = await loadSchema();
  const anime = [normalizeAnime({ id: 1 }), normalizeAnime({ id: 2 })];
  const features = await Promise.all(
    anime.map((row) => buildFeatures(row, schema, 'full', evaluator(2))),
  );
  let calls = 0;
  const evaluate: JevEvaluator = async () => {
    calls++;
    return evaluator(2)({}, {});
  };
  const badSets = [
    [],
    features.slice(0, 1),
    [features[0]!, features[0]!],
    [{ ...features[0]!, anime_id: 3 }, features[1]!],
    [{ ...features[0]!, schema_sha256: 'a'.repeat(64) }, features[1]!],
    [{ ...features[0]!, feature_schema_version: 'v2' }, features[1]!],
    [{ ...features[0]!, input_sha256: 'a'.repeat(64) }, features[1]!],
    [{ ...features[0]!, input_profile: 'basic' as const }, features[1]!],
    [{ ...features[0]!, model: 'different' }, features[1]!],
  ];
  for (const invalid of badSets)
    await assert.rejects(recommend('mood', anime, invalid, schema, evaluate));
  await assert.rejects(
    recommend('mood', [anime[0]!, anime[0]!], features, schema, evaluate),
  );
  assert.equal(calls, 0);
});
test('recommendation makes one mood request and preserves exact prompt and conditions', async () => {
  const schema = await loadSchema();
  const anime = [normalizeAnime({ id: 1 })];
  const features = [
    await buildFeatures(anime[0]!, schema, 'full', evaluator(2)),
  ];
  const prompt = '  仕事帰り。旅を気楽に見たい  ';
  let calls = 0;
  const result = await recommend(
    prompt,
    anime,
    features,
    schema,
    async (state, questions) => {
      calls++;
      assert.deepEqual(state, { mood: prompt });
      assert.equal(Object.keys(questions).length, 6);
      return evaluator(2)(state, questions);
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.input_prompt, prompt);
  assert.equal(result.input_profile.original_prompt, prompt);
  assert.equal(result.strategy, 'jev-euclidean-v1');
  assert.deepEqual(result.metadata.candidate_ids, [1]);
  assert.match(result.metadata.raw_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.usage.input_tokens, 100);
  assert.equal(result.runtime_cost_usd, null);
});
test('prompt helper refuses pipes, preserves explicit text, handles TTY input and EOF', async () => {
  assert.equal(await readPrompt('  mood  '), '  mood  ');
  await assert.rejects(readPrompt('   '));
  await assert.rejects(readPrompt(undefined, new PassThrough()), /TTY/);
  const input = Object.assign(new PassThrough(), { isTTY: true });
  const output = new PassThrough();
  let ui = '';
  output.on('data', (chunk) => {
    ui += String(chunk);
  });
  const pending = readPrompt(undefined, input, output);
  input.end('架空の気分\n');
  assert.equal(await pending, '架空の気分');
  assert.match(ui, /今の気分/);
  const eof = Object.assign(new PassThrough(), { isTTY: true });
  const missing = readPrompt(undefined, eof, new PassThrough());
  eof.end();
  await assert.rejects(missing, /No prompt/);
});
