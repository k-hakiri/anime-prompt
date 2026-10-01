import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { normalizeAnime } from '../../src/anilist/normalize.ts';
import {
  CONTEXT_MODES,
  contextForMode,
  parseContextExperiment,
  runContextExperiment,
  sha256,
} from '../../src/experiments/context.ts';
import { recommendChoice } from '../../src/recommend/choice.ts';
import { recommendOpenAI } from '../../src/recommend/openai.ts';
import { RECOMMENDATION_INSTRUCTIONS } from '../../src/recommend/instructions.ts';
import { OPENAI_MODELS } from '../../src/providers/openai.ts';
import type { JevEvaluator } from '../../src/providers/jev.ts';
import type { OpenAIRequester } from '../../src/providers/openai.ts';

const source = readFileSync('experiments/smoking-context-v1.yaml', 'utf8');
const experiment = parseContextExperiment(source);
const rows = Array.from({ length: 106 }, (_, index) =>
  normalizeAnime({
    id: index + 1,
    title: { native: `Synthetic ${index + 1}` },
    isAdult: false,
    season: 'SUMMER',
    seasonYear: 2026,
  }),
);
const hashes = {
  rawSha256: sha256('synthetic raw'),
  experimentSha256: sha256(source),
};
const jevResponse = {
  model: 'jev-1.13.0',
  answers: {
    recommend: {
      type: 'choice',
      choice: '1',
      probabilities: Object.fromEntries(
        rows.map((row) => [String(row.anime_id), 1 / rows.length]),
      ),
      confidence: 0.9,
    },
  },
  usage: { input_tokens: 10, output_tokens: 5 },
};

test('all 12 requests preserve common context semantics, baseline bytes and output contracts; calls are sequential', async () => {
  let active = 0;
  let calls = 0;
  const instructions: string[] = [];
  const progress: string[] = [];
  const states: unknown[] = [];
  const bodies: Record<string, unknown>[] = [];
  async function enter() {
    assert.equal(active++, 0, 'requests must never overlap');
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    calls++;
  }
  const jev: JevEvaluator = async (state, questions) => {
    states.push(state);
    instructions.push(questions.recommend!.instructions);
    // Context never changes the candidate criteria.
    assert.equal(Object.keys(questions.recommend!.criteria).length, 106);
    for (const criteria of Object.values(questions.recommend!.criteria)) {
      assert.ok(!Object.hasOwn(criteria, 'preferences'));
      assert.ok(!Object.hasOwn(criteria, 'policy'));
      assert.equal(Object.keys(criteria).length, 6);
    }
    await enter();
    return jevResponse;
  };
  const openai: OpenAIRequester = async (body) => {
    bodies.push(body);
    assert.deepEqual(body.reasoning, { effort: 'none' });
    await enter();
    return {
      model: String(body.model),
      output: {
        recommendations: [1, 2, 3, 4, 5].map((anime_id) => ({ anime_id })),
      },
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  };
  const results = await runContextExperiment(
    experiment,
    rows,
    { jev, openai },
    hashes,
    (message) => progress.push(message),
  );
  assert.equal(calls, 12);
  assert.equal(results.length, 12);
  assert.equal(new Set(results.map((row) => row.batch_id)).size, 1);
  assert.deepEqual(
    results.map((row) => row.run_index),
    Array.from({ length: 12 }, (_, i) => i + 1),
  );
  assert.deepEqual(
    progress,
    ['jev', 'luna', 'sol'].flatMap((provider, p) =>
      CONTEXT_MODES.map(
        (mode, i) => `${p * 4 + i + 1}/12 ${provider} × ${mode}`,
      ),
    ),
  );
  for (let i = 0; i < 12; i++) {
    const mode = CONTEXT_MODES[i % 4]!;
    const result = results[i]!;
    const context = contextForMode(experiment, mode);
    const expectedState = {
      mood: experiment.prompt,
      ...(context.preferences ? { preferences: experiment.preferences } : {}),
    };
    const expectedInstructions =
      RECOMMENDATION_INSTRUCTIONS +
      (context.policy ? '\n' + experiment.policy : '');
    if (i < 4) {
      assert.deepEqual(states[i], expectedState);
      assert.equal(instructions[i], expectedInstructions);
      assert.ok(Object.hasOwn(result, 'probabilities'));
      assert.ok(Object.hasOwn(result, 'confidence'));
    } else {
      const body = bodies[i - 4]!;
      const input = JSON.parse(String(body.input));
      const { candidates, ...state } = input;
      assert.deepEqual(state, expectedState);
      assert.equal(candidates.length, 106);
      assert.ok(String(body.instructions).startsWith(expectedInstructions));
      assert.ok(!Object.hasOwn(result, 'probabilities'));
      assert.ok(!Object.hasOwn(result, 'confidence'));
    }
    assert.equal(result.input_prompt, experiment.prompt);
    assert.equal(result.context_mode, mode);
    assert.equal(
      result.context_sha256,
      sha256(JSON.stringify({ version: experiment.context_version, context })),
    );
    assert.equal(result.experiment_sha256, hashes.experimentSha256);
    assert.equal(result.metadata.raw_sha256, hashes.rawSha256);
    assert.deepEqual(
      result.metadata.candidate_ids,
      rows.map((row) => row.anime_id),
    );
    assert.equal(result.recommendations.length, 5);
    assert.equal(result.run_count, 12);
  }
  assert.equal(new Set(results.map((row) => row.context_sha256)).size, 4);
  // The no-context baseline must have exactly the same actual provider-bound input/hash.
  const baselineOptions = {
    season: experiment.season,
    year: experiment.year,
    inputProfile: 'basic' as const,
    rawSha256: hashes.rawSha256,
  };
  const baselineJev = await recommendChoice(
    experiment.prompt,
    rows,
    jev,
    baselineOptions,
  );
  assert.equal(
    baselineJev.metadata.input_sha256,
    results[0]!.metadata.input_sha256,
  );
  assert.equal(
    baselineJev.metadata.prompt_version,
    results[0]!.metadata.prompt_version,
  );
  for (const [provider, index] of [
    ['luna', 4],
    ['sol', 8],
  ] as const) {
    const baseline = await recommendOpenAI(experiment.prompt, rows, openai, {
      ...baselineOptions,
      provider,
    });
    assert.equal(baseline.model, OPENAI_MODELS[provider]);
    assert.equal(
      baseline.metadata.input_sha256,
      results[index]!.metadata.input_sha256,
    );
    assert.equal(
      baseline.metadata.prompt_version,
      results[index]!.metadata.prompt_version,
    );
  }
});

test('invalid definitions and mismatched candidates fail before API calls; failed batch stops immediately', async () => {
  for (const value of [
    'null',
    '{}',
    source.replace('year: 2026', 'year: 10000'),
    source.replace('candidate_count: 106', 'candidate_count: 256'),
    source.replace('season: SUMMER', 'season: invalid'),
    source.replace('likes:', 'wrong:'),
  ]) {
    assert.throws(
      () => parseContextExperiment(value),
      /^Error: Invalid context experiment definition$/,
    );
  }
  let calls = 0;
  const jev: JevEvaluator = async () => {
    calls++;
    return jevResponse;
  };
  const openai: OpenAIRequester = async () => {
    calls++;
    throw new Error('synthetic failure');
  };
  await assert.rejects(
    runContextExperiment(
      experiment,
      rows.slice(0, 105),
      { jev, openai },
      hashes,
    ),
    /Expected 106 candidates; got 105/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    runContextExperiment(experiment, rows, { jev, openai }, hashes),
    /synthetic failure/,
  );
  assert.equal(calls, 5);
  const changed = {
    ...experiment,
    policy: experiment.policy + ' Synthetic change',
  };
  assert.notEqual(
    sha256(JSON.stringify(contextForMode(changed, 'policy'))),
    sha256(JSON.stringify(contextForMode(experiment, 'policy'))),
  );
});
