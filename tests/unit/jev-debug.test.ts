import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJevEvaluator, JEV_MODEL } from '../../src/providers/jev.ts';

const state = { mood: 'PRIVATE 気分' };
const questions = {
  recommend: {
    type: 'choice' as const,
    instructions: 'PRIVATE instruction',
    criteria: {
      '1': {
        title: 'PRIVATE title',
        description: 'PRIVATE description',
        tags: [{ name: 'PRIVATE tag', rank: 80 }],
      },
      '2': { title: 'PRIVATE title 2', tags: [] },
    },
  },
};
const success = () =>
  Response.json({
    model: JEV_MODEL,
    answers: {},
    usage: { input_tokens: 1, output_tokens: 1 },
  });

test('debug reports exact UTF-8 counts only when explicitly enabled', async (t) => {
  const lines: string[] = [];
  t.mock.method(process.stderr, 'write', (value: string) => {
    lines.push(value);
    return true;
  });
  const previous = process.env.ANIME_PROMPT_DEBUG;
  t.after(() => {
    if (previous === undefined) delete process.env.ANIME_PROMPT_DEBUG;
    else process.env.ANIME_PROMPT_DEBUG = previous;
  });
  let body = '';
  const request: typeof fetch = async (_url, init) => {
    body = String(init?.body);
    return success();
  };
  for (const enabled of [undefined, '0', 'true', '1']) {
    if (enabled === undefined) delete process.env.ANIME_PROMPT_DEBUG;
    else process.env.ANIME_PROMPT_DEBUG = enabled;
    lines.length = 0;
    await createJevEvaluator('PRIVATE key', JEV_MODEL, request, {
      inputProfile: 'full',
    })(state, questions);
    if (enabled !== '1') {
      assert.deepEqual(lines, []);
      continue;
    }
    const records = lines.map((line) =>
      JSON.parse(line.replace(/^Jev debug /, '')),
    );
    assert.deepEqual(records[0], {
      event: 'request',
      input_profile: 'full',
      candidate_count: 2,
      request_body_bytes: Buffer.byteLength(body),
      state_bytes: Buffer.byteLength(JSON.stringify(state)),
      questions_bytes: Buffer.byteLength(JSON.stringify(questions)),
      criteria_bytes: Buffer.byteLength(
        JSON.stringify(questions.recommend.criteria),
      ),
      tags_total: 1,
      max_candidate_criteria_bytes: Buffer.byteLength(
        JSON.stringify(questions.recommend.criteria['1']),
      ),
    });
    assert.equal(records[1].http_status, 200);
    assert.doesNotMatch(lines.join(''), /PRIVATE|気分|authorization/i);
  }
});

test('HTTP debug allows only a fixed known error code, and never echoes headers or bodies', async (t) => {
  const lines: string[] = [];
  t.mock.method(process.stderr, 'write', (value: string) => {
    lines.push(value);
    return true;
  });
  const previous = process.env.ANIME_PROMPT_DEBUG;
  process.env.ANIME_PROMPT_DEBUG = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.ANIME_PROMPT_DEBUG;
    else process.env.ANIME_PROMPT_DEBUG = previous;
  });
  for (const [body, contentType, code] of [
    [
      JSON.stringify({
        detail: { error_type: 'max_tokens_exceeded' },
        message: 'PRIVATE key PRIVATE title',
      }),
      'application/json',
      'max_tokens_exceeded',
    ],
    [
      JSON.stringify({
        detail: { error_type: 'PRIVATE key' },
        code: 'PRIVATE tag',
        message: 'PRIVATE 気分',
      }),
      'application/json',
      null,
    ],
    ['PRIVATE description', 'text/html', null],
    ['{', 'application/json', null],
    ['PRIVATE'.repeat(2000), 'application/json', null],
    ['{}', 'PRIVATE key', null],
  ] as const) {
    lines.length = 0;
    const request: typeof fetch = async () =>
      new Response(body, {
        status: 400,
        headers: {
          'content-type': contentType,
          'content-length': 'PRIVATE key',
        },
      });
    await assert.rejects(
      createJevEvaluator('PRIVATE key', JEV_MODEL, request)(state, questions),
      { message: 'Jev HTTP 400' },
    );
    const record = JSON.parse(lines.at(-1)!.replace(/^Jev debug /, ''));
    assert.equal(record.error_code, code);
    assert.equal(record.http_status, 400);
    assert.equal(record.response_content_length, null);
    assert.doesNotMatch(lines.join(''), /PRIVATE|気分|authorization/i);
  }
  lines.length = 0;
  await assert.rejects(
    createJevEvaluator('PRIVATE key', JEV_MODEL, async () => {
      throw new Error('PRIVATE key');
    })(state, questions),
    { message: 'Jev request failed' },
  );
  assert.equal(
    JSON.parse(lines.at(-1)!.replace(/^Jev debug /, '')).event,
    'request_failed',
  );
  assert.doesNotMatch(lines.join(''), /PRIVATE/);
});

test('score diagnostics remain compatible and count all criteria without inventing a profile', async (t) => {
  const lines: string[] = [];
  t.mock.method(process.stderr, 'write', (value: string) => {
    lines.push(value);
    return true;
  });
  const previous = process.env.ANIME_PROMPT_DEBUG;
  process.env.ANIME_PROMPT_DEBUG = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.ANIME_PROMPT_DEBUG;
    else process.env.ANIME_PROMPT_DEBUG = previous;
  });
  const score = {
    score: {
      type: 'score' as const,
      instructions: 'PRIVATE instruction',
      criteria: ['PRIVATE low', 'PRIVATE high'],
    },
  };
  await createJevEvaluator('PRIVATE key', JEV_MODEL, async () => success())(
    state,
    score,
  );
  const record = JSON.parse(lines[0]!.replace(/^Jev debug /, ''));
  assert.equal(record.input_profile, null);
  assert.equal(record.candidate_count, 0);
  assert.equal(record.tags_total, 0);
  assert.equal(record.max_candidate_criteria_bytes, 0);
  assert.equal(
    record.criteria_bytes,
    Buffer.byteLength(JSON.stringify(score.score.criteria)),
  );
  assert.doesNotMatch(lines.join(''), /PRIVATE/);
});

test('broken and stalled error streams retain the HTTP failure with bounded diagnostics', async (t) => {
  const lines: string[] = [];
  t.mock.method(process.stderr, 'write', (value: string) => {
    lines.push(value);
    return true;
  });
  const previous = process.env.ANIME_PROMPT_DEBUG;
  process.env.ANIME_PROMPT_DEBUG = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.ANIME_PROMPT_DEBUG;
    else process.env.ANIME_PROMPT_DEBUG = previous;
  });
  let cancelled = false;
  for (const stream of [
    new ReadableStream({
      start(controller) {
        controller.error(new Error('PRIVATE key'));
      },
    }),
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  ]) {
    lines.length = 0;
    await assert.rejects(
      createJevEvaluator(
        'PRIVATE key',
        JEV_MODEL,
        async () =>
          new Response(stream, {
            status: 400,
            headers: { 'content-type': 'application/json' },
          }),
      )(state, questions),
      { message: 'Jev HTTP 400' },
    );
    assert.equal(
      JSON.parse(lines.at(-1)!.replace(/^Jev debug /, '')).error_code,
      null,
    );
    assert.doesNotMatch(lines.join(''), /PRIVATE/);
  }
  assert.equal(cancelled, true);
});

test('serialization failures preserve redacted adapter errors even without debug', async (t) => {
  const lines: string[] = [];
  t.mock.method(process.stderr, 'write', (value: string) => {
    lines.push(value);
    return true;
  });
  const previous = process.env.ANIME_PROMPT_DEBUG;
  t.after(() => {
    if (previous === undefined) delete process.env.ANIME_PROMPT_DEBUG;
    else process.env.ANIME_PROMPT_DEBUG = previous;
  });
  for (const debug of ['0', '1']) {
    process.env.ANIME_PROMPT_DEBUG = debug;
    lines.length = 0;
    await assert.rejects(
      createJevEvaluator('PRIVATE key', JEV_MODEL, async () => {
        assert.fail('serialization must fail before fetch');
      })(
        {
          toJSON() {
            throw new Error('PRIVATE key');
          },
        },
        questions,
      ),
      { message: 'Jev request failed' },
    );
    assert.equal(lines.length, debug === '1' ? 1 : 0);
    assert.doesNotMatch(lines.join(''), /PRIVATE/);
  }
});
