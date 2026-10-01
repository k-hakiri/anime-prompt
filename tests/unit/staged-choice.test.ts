import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { normalizeAnime } from '../../src/anilist/normalize.ts';
import { projectAnime } from '../../src/anime/profile.ts';
import {
  assignGroups,
  recommend,
  renderHuman,
} from '../../src/recommend/run.ts';
import type { JevEvaluator, JevResult } from '../../src/providers/jev.ts';

const options = {
  season: 'SUMMER' as const,
  year: 2026,
  rawSha256: 'raw-hash',
};
function candidate(id: number) {
  return normalizeAnime({
    id,
    isAdult: false,
    season: 'SUMMER',
    seasonYear: 2026,
    title: { native: `Synthetic ${id}` },
    description: 'Synthetic complete description',
    genres: ['Adventure'],
    format: 'TV',
    episodes: 12,
    duration: 24,
    tags: Array.from({ length: 40 }, (_, i) => ({ name: `Tag ${i}`, rank: i })),
    source: 'ORIGINAL',
  });
}
function response(ids: number[], call: number): JevResult {
  // Highest IDs win; ties in zero probability exercise deterministic ordering.
  const winners = ids.slice(-5);
  return {
    model: 'jev-resolved',
    answers: {
      recommend: {
        type: 'choice',
        choice: String(winners[0]),
        probabilities: Object.fromEntries(
          ids.map((id) => [
            String(id),
            winners.includes(id) ? 1 / winners.length : 0,
          ]),
        ),
        confidence: 0.7,
      },
    },
    usage: { input_tokens: 100 + call, output_tokens: 10 + call },
  };
}
function deferred() {
  let resolve!: (value: JevResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<JevResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
test('round-robin grouping is deterministic, balanced, covers every candidate and scales by count', () => {
  for (const count of [1, 5, 27, 28, 106, 255]) {
    const anime = Array.from({ length: count }, (_, i) => candidate(i + 1));
    const groups = assignGroups(anime);
    assert.deepEqual(groups, assignGroups([...anime].reverse()));
    assert.equal(groups.length, Math.ceil(count / 27));
    assert.ok(groups.every((group) => group.length <= 27));
    assert.equal(new Set(groups.flat().map((row) => row.anime_id)).size, count);
    assert.ok(
      Math.max(...groups.map((g) => g.length)) -
        Math.min(...groups.map((g) => g.length)) <=
        1,
    );
    assert.deepEqual(
      anime.map((row) => row.anime_id),
      Array.from({ length: count }, (_, i) => i + 1),
    );
    if (count === 106) {
      assert.deepEqual(
        groups.map((group) => group.length),
        [27, 27, 26, 26],
      );
      assert.deepEqual(
        groups[0]!.slice(0, 3).map((row) => row.anime_id),
        [1, 5, 9],
      );
    }
  }
});
test('full stages start in parallel, wait for all groups, preserve metadata and sum usage/latency', async () => {
  const anime = Array.from({ length: 106 }, (_, i) => candidate(i + 1));
  const groups = assignGroups(anime);
  const pending = groups.map(() => deferred());
  const inputs: number[][] = [];
  const hashes: string[] = [];
  const prompt = '  Exact synthetic mood  ';
  const evaluate: JevEvaluator = async (state, questions) => {
    assert.deepEqual(state, { mood: prompt });
    assert.equal(questions.recommend!.type, 'choice');
    if (questions.recommend!.type !== 'choice')
      throw new Error('Expected Choice');
    const ids = Object.keys(questions.recommend!.criteria).map(Number);
    const call = inputs.length;
    inputs.push(ids);
    hashes.push(
      createHash('sha256')
        .update(JSON.stringify({ state, questions }))
        .digest('hex'),
    );
    for (const id of ids)
      assert.deepEqual(
        questions.recommend!.criteria[String(id)],
        projectAnime(anime[id - 1]!, 'full'),
      );
    return call < 4 ? pending[call]!.promise : response(ids, call);
  };
  const running = recommend(prompt, [...anime].reverse(), evaluate, options);
  assert.equal(inputs.length, 4); // A sequential implementation cannot reach this.
  for (const i of [2, 0, 3]) pending[i]!.resolve(response(inputs[i]!, i));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(inputs.length, 4);
  pending[1]!.resolve(response(inputs[1]!, 1));
  const result = await running;
  assert.equal(inputs.length, 5);
  assert.equal(result.strategy, 'jev-staged-choice-v1');
  assert.ok('first_stages' in result);
  if (!('first_stages' in result)) return;
  const finalists = groups
    .flatMap((g) => g.slice(-5).map((row) => row.anime_id))
    .sort((a, b) => a - b);
  assert.deepEqual(inputs[4], finalists);
  assert.deepEqual(result.finalists, finalists);
  assert.deepEqual(result.metadata.group_assignment, inputs.slice(0, 4));
  assert.deepEqual(
    result.metadata.candidate_ids,
    anime.map((row) => row.anime_id),
  );
  assert.equal(result.metadata.raw_sha256, 'raw-hash');
  assert.equal(result.metadata.prompt_version, 'recommend-staged-choice-v2');
  assert.match(result.metadata.input_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.group_count, 4);
  assert.equal(result.api_call_count, 5);
  assert.deepEqual(result.usage, { input_tokens: 510, output_tokens: 60 });
  for (const [i, stage] of result.first_stages.entries()) {
    assert.deepEqual(stage.candidate_ids, inputs[i]);
    assert.deepEqual(
      stage.selected_ids,
      groups[i]!.slice(-5).map((row) => row.anime_id),
    );
    assert.equal(stage.input_sha256, hashes[i]);
    assert.equal(stage.confidence, 0.7);
  }
  assert.equal(result.final_stage.input_sha256, hashes[4]);
  assert.deepEqual(result.probabilities, result.final_stage.probabilities);
  assert.deepEqual(
    result.recommendations.map((row) => row.anime_id),
    finalists.slice(-5),
  );
  assert.equal(
    result.api_latency_sum_ms,
    [...result.first_stages, result.final_stage].reduce(
      (s, stage) => s + stage.latency_ms,
      0,
    ),
  );
  assert.equal(result.latency_ms, result.wall_clock_latency_ms);
  assert.ok(
    result.wall_clock_latency_ms >=
      Math.max(...result.first_stages.map((s) => s.latency_ms)),
  );
  assert.equal(
    renderHuman(result)
      .split('\n')
      .filter((line) => /^\d+\./.test(line)).length,
    5,
  );
  assert.doesNotMatch(renderHuman(result), /probabilities|Tag/);
});
test('any first-stage failure rejects promptly and never calls final, even after remaining groups finish', async () => {
  const anime = Array.from({ length: 106 }, (_, i) => candidate(i + 1));
  for (const failure of ['HTTP', 'distribution', 'usage']) {
    const pending = Array.from({ length: 4 }, () => deferred());
    const ids: number[][] = [];
    const run = recommend(
      'mood',
      anime,
      async (_state, questions) => {
        ids.push(Object.keys(questions.recommend!.criteria).map(Number));
        return pending[ids.length - 1]!.promise;
      },
      options,
    );
    const rejected = assert.rejects(run);
    assert.equal(ids.length, 4);
    if (failure === 'HTTP') pending[1]!.reject(new Error('Jev HTTP 400'));
    else {
      const invalid = response(ids[1]!, 1);
      if (failure === 'distribution')
        invalid.answers.recommend = { type: 'choice', probabilities: {} };
      else invalid.usage.input_tokens = -1;
      pending[1]!.resolve(invalid);
    }
    await rejected; // Other groups are still pending: fail-fast, not allSettled.
    for (const i of [0, 2, 3]) pending[i]!.resolve(response(ids[i]!, i));
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(ids.length, 4);
  }
});
test('small candidate sets retain all available finalists and final failure produces no result', async () => {
  for (const count of [1, 4, 5, 7]) {
    let calls = 0;
    const anime = Array.from({ length: count }, (_, i) => candidate(i + 1));
    const result = await recommend(
      'mood',
      anime,
      async (_state, questions) =>
        response(
          Object.keys(questions.recommend!.criteria).map(Number),
          calls++,
        ),
      options,
    );
    assert.equal(calls, 2);
    assert.equal(result.recommendations.length, Math.min(count, 5));
  }
  for (const failure of ['http', 'invalid', 'model']) {
    let calls = 0;
    await assert.rejects(
      recommend(
        'mood',
        [candidate(1)],
        async () => {
          calls++;
          if (calls === 2 && failure === 'http')
            throw new Error('Jev HTTP 400');
          const value = response([1], calls);
          if (calls === 2 && failure === 'invalid')
            value.answers.recommend = {};
          if (calls === 2 && failure === 'model') value.model = 'other-model';
          return value;
        },
        options,
      ),
    );
    assert.equal(calls, 2);
  }
});
test('basic still makes exactly one call for all candidates', async () => {
  let calls = 0;
  const anime = Array.from({ length: 106 }, (_, i) => candidate(i + 1));
  const result = await recommend(
    'mood',
    anime,
    async (_state, questions) => {
      calls++;
      assert.equal(questions.recommend!.type, 'choice');
      if (questions.recommend!.type !== 'choice')
        throw new Error('Expected Choice');
      assert.equal(Object.keys(questions.recommend!.criteria).length, 106);
      assert.ok(!Object.hasOwn(questions.recommend!.criteria['1']!, 'tags'));
      return response(
        anime.map((row) => row.anime_id),
        0,
      );
    },
    { ...options, inputProfile: 'basic' },
  );
  assert.equal(calls, 1);
  assert.equal(result.strategy, 'jev-choice-v1');
  assert.ok(!('first_stages' in result));
});
