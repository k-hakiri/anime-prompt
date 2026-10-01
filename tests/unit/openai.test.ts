import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { normalizeAnime } from '../../src/anilist/normalize.ts';
import {
  createOpenAIRequester,
  OPENAI_MODELS,
  resolveOpenAIModel,
} from '../../src/providers/openai.ts';
import type { OpenAIResult } from '../../src/providers/openai.ts';
import { recommendOpenAI } from '../../src/recommend/openai.ts';
import { projectAnime } from '../../src/anime/profile.ts';
import { selectCandidates } from '../../src/recommend/choice.ts';

const rows = Array.from({ length: 6 }, (_, i) =>
  normalizeAnime({
    id: i + 1,
    title: { native: `Synthetic ${i}` },
    description: 'Synthetic plot',
    isAdult: false,
    season: 'SUMMER',
    seasonYear: 2026,
    tags: [{ name: 'Excluded tag', rank: 99 }],
    source: 'MANGA',
  }),
);
const options = {
  provider: 'luna',
  season: 'SUMMER',
  year: 2026,
  inputProfile: 'basic',
} as const;
const valid: OpenAIResult = {
  model: OPENAI_MODELS.luna,
  output: { recommendations: [6, 3, 2, 1, 5].map((id) => ({ anime_id: id })) },
  usage: {
    input_tokens: 100,
    output_tokens: 30,
    input_tokens_details: { cached_tokens: 10 },
    output_tokens_details: { reasoning_tokens: 0 },
  },
};
function payload(overrides: Record<string, unknown> = {}) {
  return {
    status: 'completed',
    model: valid.model,
    usage: valid.usage,
    output: [
      {
        type: 'message',
        status: 'completed',
        content: [{ type: 'output_text', text: JSON.stringify(valid.output) }],
      },
    ],
    ...overrides,
  };
}

test('Luna / Sol share one-shot basic inputs, schema, effort and local titles with complete provenance', async () => {
  const requests: Record<string, unknown>[] = [];
  const prompt = '  Synthetic mood  ';
  const anime = [...rows]
    .reverse()
    .concat({ ...rows[0]!, anime_id: 9, isAdult: true });
  for (const provider of ['luna', 'sol'] as const) {
    const result = await recommendOpenAI(
      prompt,
      anime,
      async (body) => {
        requests.push(body);
        return { ...valid, model: OPENAI_MODELS[provider] };
      },
      { ...options, provider, rawSha256: 'raw-hash' },
    );
    assert.equal(result.provider, provider);
    assert.equal(result.model, OPENAI_MODELS[provider]);
    assert.equal(result.metadata.requested_model, OPENAI_MODELS[provider]);
    assert.equal(result.input_prompt, prompt);
    assert.equal(result.result_schema_version, 'v3');
    assert.equal(result.strategy, 'openai-one-shot-v1');
    assert.equal(result.input_profile, 'basic');
    assert.equal(result.reasoning_effort, 'none');
    assert.deepEqual(result.usage, valid.usage);
    assert.equal(result.runtime_cost_usd, null);
    assert.ok(result.latency_ms >= 0);
    assert.ok(Number.isFinite(Date.parse(result.timestamp)));
    assert.deepEqual(result.metadata.candidate_ids, [1, 2, 3, 4, 5, 6]);
    assert.equal(result.metadata.raw_sha256, 'raw-hash');
    assert.equal(
      result.metadata.input_sha256,
      createHash('sha256')
        .update(JSON.stringify(requests.at(-1)))
        .digest('hex'),
    );
    assert.deepEqual(result.recommendations[0], {
      rank: 1,
      anime_id: 6,
      title: rows[5]!.title,
    });
    assert.ok(!Object.hasOwn(result, 'probabilities'));
    assert.ok(!Object.hasOwn(result, 'confidence'));
    assert.ok(!Object.hasOwn(result.recommendations[0]!, 'probability'));
    const input = JSON.parse(requests.at(-1)!.input as string);
    assert.deepEqual(input, {
      mood: prompt,
      candidates: selectCandidates(anime, options).map((row) => ({
        anime_id: row.anime_id,
        ...projectAnime(row, 'basic'),
      })),
    });
    assert.deepEqual(requests.at(-1)!.reasoning, { effort: 'none' });
    assert.equal(requests.at(-1)!.store, false);
    const format = (
      requests.at(-1)!.text as {
        format: {
          strict: boolean;
          schema: {
            properties: {
              recommendations: {
                minItems: number;
                maxItems: number;
                items: { properties: { anime_id: { enum: number[] } } };
              };
            };
          };
        };
      }
    ).format;
    assert.equal(format.strict, true);
    assert.equal(format.schema.properties.recommendations.minItems, 5);
    assert.equal(format.schema.properties.recommendations.maxItems, 5);
    assert.deepEqual(
      format.schema.properties.recommendations.items.properties.anime_id.enum,
      [1, 2, 3, 4, 5, 6],
    );
  }
  assert.deepEqual(
    { ...requests[0], model: '' },
    { ...requests[1], model: '' },
  );
});

test('one through five candidates return all; invalid count, IDs, fields and mismatched response model fail', async () => {
  for (let count = 1; count <= 5; count++) {
    const result = await recommendOpenAI(
      'mood',
      rows.slice(0, count),
      async () => ({
        ...valid,
        output: {
          recommendations: rows
            .slice(0, count)
            .map((row) => ({ anime_id: row.anime_id })),
        },
      }),
      options,
    );
    assert.equal(result.recommendations.length, count);
  }
  for (const output of [
    null,
    {},
    { recommendations: [] },
    { recommendations: [1, 2, 3, 4].map((anime_id) => ({ anime_id })) },
    { recommendations: rows.map((row) => ({ anime_id: row.anime_id })) },
    { recommendations: [1, 2, 3, 4, 99].map((anime_id) => ({ anime_id })) },
    { recommendations: [1, 2, 3, 4, 4].map((anime_id) => ({ anime_id })) },
    { recommendations: [1, 2, 3, 4, '5'].map((anime_id) => ({ anime_id })) },
    {
      recommendations: [
        { anime_id: 1, title: 'Invented' },
        ...[2, 3, 4, 5].map((anime_id) => ({ anime_id })),
      ],
    },
    { ...(valid.output as object), confidence: 0.5 },
  ])
    await assert.rejects(
      recommendOpenAI(
        'mood',
        rows,
        async () => ({ ...valid, output }),
        options,
      ),
      /Invalid OpenAI recommendations/,
    );
  await assert.rejects(
    recommendOpenAI(
      'mood',
      rows,
      async () => ({ ...valid, model: OPENAI_MODELS.sol }),
      options,
    ),
    /Invalid OpenAI recommendations/,
  );
  let calls = 0;
  const request = async () => {
    calls++;
    return valid;
  };
  await assert.rejects(
    recommendOpenAI('mood', rows, request, {
      ...options,
      inputProfile: 'full',
    }),
    /only basic/,
  );
  await assert.rejects(
    recommendOpenAI('mood', [], request, options),
    /No non-adult/,
  );
  await assert.rejects(
    recommendOpenAI('mood', [...rows, rows[0]!], request, options),
    /Duplicate/,
  );
  assert.equal(calls, 0);
});

test('provider model overrides cannot switch families', () => {
  assert.equal(resolveOpenAIModel('sol'), OPENAI_MODELS.sol);
  assert.equal(
    resolveOpenAIModel('luna', 'gpt-5.6-luna-2026-10-01'),
    'gpt-5.6-luna-2026-10-01',
  );
  for (const model of [
    'gpt-5.6-sol',
    'jev-1.13.0',
    'gpt-5x6-luna',
    'gpt-5.6-luna-arbitrary',
  ])
    assert.throws(() => resolveOpenAIModel('luna', model), /match/);
});

test('Responses adapter authenticates, retains usage details and redacts network, HTTP, refusal and malformed responses', async () => {
  let calls = 0;
  const request: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init?.method, 'POST');
    assert.equal(
      (init?.headers as Record<string, string>).authorization,
      'Bearer synthetic-key',
    );
    assert.ok(init?.signal);
    return Response.json(payload());
  };
  await assert.rejects(
    createOpenAIRequester('', request)({}),
    /OPENAI_API_KEY/,
  );
  assert.equal(calls, 0);
  assert.deepEqual(
    await createOpenAIRequester('synthetic-key', request)({}),
    valid,
  );
  await assert.rejects(
    createOpenAIRequester('synthetic-key', async () => {
      throw new Error('PRIVATE synthetic-key');
    })({}),
    /^Error: OpenAI request failed$/,
  );
  await assert.rejects(
    createOpenAIRequester(
      'synthetic-key',
      async () => new Response('PRIVATE synthetic-key', { status: 429 }),
    )({}),
    /^Error: OpenAI HTTP 429$/,
  );
  for (const response of [
    new Response('PRIVATE synthetic-key'),
    Response.json(payload({ status: 'incomplete' })),
    Response.json(payload({ output: [] })),
    Response.json(
      payload({
        output: [
          {
            type: 'message',
            status: 'completed',
            content: [{ type: 'refusal', refusal: 'PRIVATE' }],
          },
        ],
      }),
    ),
    Response.json(
      payload({
        output: [
          {
            type: 'message',
            status: 'completed',
            content: [{ type: 'output_text', text: 'PRIVATE' }],
          },
        ],
      }),
    ),
    Response.json(payload({ usage: { input_tokens: -1, output_tokens: 1 } })),
    Response.json(
      payload({
        usage: {
          ...valid.usage,
          output_tokens_details: { reasoning_tokens: -1 },
        },
      }),
    ),
  ])
    await assert.rejects(
      createOpenAIRequester('synthetic-key', async () => response)({}),
      /^Error: Invalid OpenAI response$/,
    );
});
