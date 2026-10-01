import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAnime } from '../../src/anilist/normalize.ts';
import { projectAnime } from '../../src/anime/profile.ts';
import { recommend, renderHuman } from '../../src/recommend/run.ts';
import type { JevEvaluator } from '../../src/providers/jev.ts';

const options = { season: 'SUMMER' as const, year: 2026 };
function candidate(id: number) {
  return normalizeAnime({
    id,
    isAdult: false,
    season: 'SUMMER',
    seasonYear: 2026,
    title: { native: 'Synthetic shared title' },
    description: 'Synthetic story',
    genres: ['Comedy'],
    format: 'ONA',
    episodes: 1,
    duration: 3,
    tags: [{ name: 'Synthetic tag', rank: 80 }],
    source: 'ORIGINAL',
  });
}
function evaluator(probabilities: Record<string, number>): JevEvaluator {
  return async () => ({
    model: 'jev-resolved',
    answers: {
      recommend: {
        type: 'choice',
        choice: Object.keys(probabilities).sort(
          (a, b) => probabilities[b]! - probabilities[a]!,
        )[0],
        probabilities,
        confidence: 0.7,
      },
    },
    usage: { input_tokens: 123, output_tokens: 10 },
  });
}
test('one direct Choice uses ID keys and exact basic/full projections, records probabilities and reproducibility', async () => {
  const anime = [7, 6, 5, 4, 3, 2, 1].map(candidate);
  const probabilities = {
    '1': 0.05,
    '2': 0.05,
    '3': 0.1,
    '4': 0.1,
    '5': 0.15,
    '6': 0.15,
    '7': 0.4,
  };
  for (const profile of [undefined, 'basic', 'full'] as const) {
    let calls = 0;
    const prompt = '  Synthetic exact mood  ';
    const result = await recommend(
      prompt,
      anime,
      async (state, questions) => {
        calls++;
        assert.deepEqual(state, { mood: prompt });
        assert.deepEqual(Object.keys(questions), ['recommend']);
        assert.equal(questions.recommend!.type, 'choice');
        const criteria = questions.recommend!.criteria;
        assert.deepEqual(Object.keys(criteria), [
          '1',
          '2',
          '3',
          '4',
          '5',
          '6',
          '7',
        ]);
        assert.deepEqual(
          criteria['1'],
          projectAnime(anime[6]!, profile ?? 'full'),
        );
        assert.deepEqual(
          Object.keys(criteria['1']!).sort(),
          (profile === 'basic'
            ? [
                'title',
                'description',
                'genres',
                'format',
                'episodes',
                'duration',
              ]
            : [
                'title',
                'description',
                'genres',
                'format',
                'episodes',
                'duration',
                'tags',
                'source',
              ]
          ).sort(),
        );
        return evaluator(probabilities)(state, questions);
      },
      { ...options, inputProfile: profile, model: 'jev-requested' },
    );
    assert.equal(calls, 1);
    assert.equal(result.input_prompt, prompt);
    assert.equal(result.input_profile, profile ?? 'full');
    assert.equal(result.model, 'jev-resolved');
    assert.equal(result.metadata.requested_model, 'jev-requested');
    assert.equal(result.strategy, 'jev-choice-v1');
    assert.equal(result.result_schema_version, 'v2');
    assert.deepEqual(
      result.recommendations.map((row) => row.anime_id),
      [7, 5, 6, 3, 4],
    );
    assert.deepEqual(
      result.recommendations.map((row) => row.rank),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(result.probabilities, probabilities);
    assert.equal(result.confidence, 0.7);
    assert.equal(result.usage.input_tokens, 123);
    assert.ok(result.latency_ms >= 0);
    assert.ok(Number.isFinite(Date.parse(result.timestamp)));
    assert.match(result.metadata.raw_sha256, /^[a-f0-9]{64}$/);
    assert.match(result.metadata.input_sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.runtime_cost_usd, null);
    assert.match(
      renderHuman(result),
      /1\. Synthetic shared title \(ID 7\)  40\.0%/,
    );
  }
});
test('candidate set excludes adult, unknown adult status and other seasons; no popularity/format cutoffs', async () => {
  const anime = [
    candidate(1),
    { ...candidate(2), isAdult: true },
    { ...candidate(3), isAdult: null },
    { ...candidate(4), season: 'FALL' as const },
    { ...candidate(5), year: 2025 },
    { ...candidate(6), season: null },
  ];
  const result = await recommend(
    'mood',
    anime,
    async (state, questions) => {
      assert.deepEqual(Object.keys(questions.recommend!.criteria), ['1']);
      return evaluator({ '1': 1 })(state, questions);
    },
    options,
  );
  assert.deepEqual(result.metadata.candidate_ids, [1]);
  assert.equal(result.recommendations.length, 1);
  let calls = 0;
  const never: JevEvaluator = async () => {
    calls++;
    throw new Error('unexpected call');
  };
  for (const invalid of [
    [],
    anime.slice(1),
    [candidate(1), candidate(1)],
    Array.from({ length: 256 }, (_, i) => candidate(i + 1)),
  ])
    await assert.rejects(recommend('mood', invalid, never, options));
  assert.equal(calls, 0);
  const max = Array.from({ length: 255 }, (_, i) => candidate(i + 1));
  const distribution = Object.fromEntries(
    max.map((row) => [String(row.anime_id), 1 / 255]),
  );
  assert.equal(
    (await recommend('mood', max, evaluator(distribution), options))
      .recommendations.length,
    5,
  );
});
test('rejects malformed Choice distributions, keys, confidence, chosen option and usage', async () => {
  const base = await evaluator({ '1': 0.6, '2': 0.4 })({}, {});
  const answer = base.answers.recommend as Record<string, unknown>;
  const invalid = [
    { type: 'score' },
    { probabilities: { '1': 1 } },
    { probabilities: { '1': 0.6, '3': 0.4 } },
    { probabilities: { '1': 0.6, '2': 0.4, '3': 0 } },
    { probabilities: { '1': -0.1, '2': 1.1 } },
    { probabilities: { '1': NaN, '2': 0.4 } },
    { probabilities: { '1': '0.6', '2': 0.4 } },
    { probabilities: { '1': 0.5, '2': 0.4 } },
    { confidence: Infinity },
    { confidence: -0.1 },
    { choice: '3' },
    { choice: '2' },
    { choice: undefined },
  ];
  for (const patch of invalid)
    await assert.rejects(
      recommend(
        'mood',
        [candidate(1), candidate(2)],
        async () => ({
          ...base,
          answers: { recommend: { ...answer, ...patch } },
        }),
        options,
      ),
    );
  await assert.rejects(
    recommend(
      'mood',
      [candidate(1), candidate(2)],
      async () => ({ ...base, usage: { input_tokens: -1, output_tokens: 10 } }),
      options,
    ),
  );
});

test('sum failures expose only the numeric sum, and a subsequent valid response succeeds', async () => {
  const anime = [candidate(1), candidate(2)];
  await assert.rejects(
    recommend(
      'private mood',
      anime,
      evaluator({ '1': 0.6, '2': 0.38 }),
      options,
    ),
    { message: 'Jev probabilities must sum to 1 (sum=0.98)' },
  );
  const result = await recommend(
    'private mood',
    anime,
    evaluator({ '1': 0.6, '2': 0.4 }),
    options,
  );
  assert.deepEqual(result.probabilities, { '1': 0.6, '2': 0.4 });
});

test('bounded cent-grid drift is normalized without losing raw probabilities', async () => {
  const anime = [candidate(1), candidate(2), candidate(3)];
  // Synthetic fixtures reproduce observed numeric shapes, not acquired anime data.
  for (const probabilities of [
    { '1': 0.9400000000000001, '2': 0.04, '3': 0.01 },
    { '1': 0.94, '2': 0.05, '3': 0 },
    { '1': 0.94, '2': 0.06, '3': 0.01 },
    { '1': 0.6004, '2': 0.3991, '3': 0 },
    { '1': 0.601, '2': 0.4, '3': 0 },
  ]) {
    const total = Object.values(probabilities).reduce((sum, p) => sum + p, 0);
    const result = await recommend(
      'mood',
      anime,
      evaluator(probabilities),
      options,
    );
    assert.deepEqual(result.probabilities, probabilities);
    assert.equal(result.metadata.probability_sum, total);
    assert.ok(
      Math.abs(
        Object.values(result.normalized_probabilities).reduce(
          (s, p) => s + p,
          0,
        ) - 1,
      ) < 1e-12,
    );
    for (const row of result.recommendations) {
      assert.equal(
        row.probability,
        probabilities[String(row.anime_id) as keyof typeof probabilities] /
          total,
      );
      assert.equal(
        row.probability,
        result.normalized_probabilities[String(row.anime_id)],
      );
    }
  }
});

test('rejects excessive drift, non-cent-grid drift, zero totals and nonfinite values', async () => {
  for (const probabilities of [
    { '1': 0.94, '2': 0.04 },
    { '1': 0.98, '2': 0.04 },
    { '1': 0.604, '2': 0.386 },
    { '1': 0.6006, '2': 0.3983 },
    { '1': 0, '2': 0 },
    { '1': Infinity, '2': 0 },
    { '1': -Infinity, '2': 1 },
    { '1': 1.01, '2': -0.01 },
  ])
    await assert.rejects(
      recommend(
        'mood',
        [candidate(1), candidate(2)],
        evaluator(probabilities),
        options,
      ),
    );
});

test('the same prompt handles a transient cent-grid deficit followed by an exact distribution', async () => {
  let calls = 0;
  const responses = [
    { '1': 0.94, '2': 0.05 },
    { '1': 0.94, '2': 0.06 },
  ];
  const transient: JevEvaluator = async (state, questions) =>
    evaluator(responses[calls++]!)(state, questions);
  const first = await recommend(
    'same mood',
    [candidate(1), candidate(2)],
    transient,
    options,
  );
  const second = await recommend(
    'same mood',
    [candidate(1), candidate(2)],
    transient,
    options,
  );
  assert.equal(calls, 2);
  assert.deepEqual(first.probabilities, responses[0]);
  assert.deepEqual(second.probabilities, responses[1]);
  assert.equal(first.recommendations[0]!.probability, 0.94 / 0.99);
  assert.equal(second.recommendations[0]!.probability, 0.94);
});
