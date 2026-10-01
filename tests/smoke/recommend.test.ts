import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { normalizeAnime } from '../../src/anilist/normalize.ts';

test('recommend CLI supports explicit human/JSONL and actual stdin TTY with UI on stderr', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'anime-recommend-'));
  try {
    const anime = [
      normalizeAnime({
        id: 1,
        title: { native: 'Synthetic Journey' },
        isAdult: false,
        season: 'SUMMER',
        seasonYear: 2026,
      }),
      normalizeAnime({
        id: 2,
        isAdult: true,
        season: 'SUMMER',
        seasonYear: 2026,
      }),
    ];
    const rawPath = join(directory, 'raw.jsonl');
    writeFileSync(
      rawPath,
      anime.map((row) => JSON.stringify(row)).join('\n') + '\n',
    );
    const args = [
      '--import',
      './tests/fixtures/jev-fetch.ts',
      'src/cli/recommend.ts',
      '--raw',
      rawPath,
      '--season',
      'SUMMER',
      '--year',
      '2026',
    ];
    const env = {
      ...process.env,
      TYPESAFE_API_KEY: 'synthetic-test-key',
      ANIME_TEST_FAILURE: '',
      ANIME_PROMPT_DEBUG: '',
    };
    function run(extra: string[], failure = '') {
      return spawnSync(process.execPath, [...args, ...extra], {
        encoding: 'utf8',
        timeout: 5000,
        input: 'piped mood is ignored',
        env: { ...env, ANIME_TEST_FAILURE: failure },
      });
    }
    const prompt = '  気楽に旅を見たい  ';
    const jsonl = run(['--prompt', prompt, '--format', 'jsonl']);
    assert.ifError(jsonl.error);
    assert.equal(jsonl.status, 0);
    assert.equal(jsonl.stderr, '');
    assert.equal(jsonl.stdout.trim().split('\n').length, 1);
    const record = JSON.parse(jsonl.stdout);
    assert.equal(record.input_prompt, prompt);
    assert.equal(record.recommendations[0].anime_id, 1);
    assert.equal(record.recommendations[0].probability, 1);
    assert.equal(record.input_profile, 'full');
    assert.equal(record.confidence, 0.9);
    assert.deepEqual(record.probabilities, { '1': 1 });
    assert.deepEqual(record.metadata.candidate_ids, [1]);
    const basic = run([
      '--prompt',
      prompt,
      '--format',
      'jsonl',
      '--input-profile',
      'basic',
    ]);
    assert.equal(basic.status, 0, basic.stderr);
    assert.equal(JSON.parse(basic.stdout).input_profile, 'basic');
    const human = run(['--prompt', prompt]);
    assert.equal(human.status, 0);
    assert.match(human.stdout, /1\. Synthetic Journey/);
    assert.match(human.stdout, /100\.0%/);
    assert.match(human.stdout, /time:/);
    assert.equal(human.stderr, '');
    const rounded = run(['--prompt', prompt, '--format', 'jsonl'], 'rounding');
    assert.equal(rounded.status, 0, rounded.stderr);
    const corrected = JSON.parse(rounded.stdout);
    assert.deepEqual(corrected.probabilities, { '1': 0.99 });
    assert.deepEqual(corrected.normalized_probabilities, { '1': 1 });
    assert.equal(corrected.recommendations[0].probability, 1);
    assert.equal(corrected.metadata.probability_sum, 0.99);
    const roundedHuman = run(['--prompt', prompt], 'rounding');
    assert.equal(roundedHuman.status, 0, roundedHuman.stderr);
    assert.match(roundedHuman.stdout, /100\.0%/);
    for (const format of ['human', 'jsonl']) {
      const failed = run(['--prompt', prompt, '--format', format], 'sum');
      assert.equal(failed.status, 1);
      assert.equal(failed.stdout, '');
      assert.match(
        failed.stderr,
        /Jev probabilities must sum to 1 \(sum=0\.98\)/,
      );
      assert.doesNotMatch(
        failed.stderr,
        /synthetic-test-key|Synthetic Journey|気楽/,
      );
    }
    for (const [extra, failure] of [
      [[], ''],
      [['--prompt', '   '], ''],
      [['--prompt', prompt, '--format', 'invalid'], ''],
      [['--prompt', prompt], 'http'],
      [['--prompt', prompt], 'choice'],
      [['--prompt', prompt, '--input-profile', 'invalid'], ''],
      [['--prompt', prompt, '--season', 'FALL'], ''],
      [['--prompt', prompt, '--raw', join(directory, 'missing')], ''],
    ] as [string[], string][]) {
      const result = run(extra, failure);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.ok(result.stderr.trim());
      assert.doesNotMatch(result.stderr, /synthetic-test-key/);
    }
    const tty = spawnSync(
      'python3',
      [
        'tests/fixtures/recommend-pty.py',
        process.execPath,
        ...args,
        '--format',
        'jsonl',
      ],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: { ...env, ANIME_TEST_FAILURE: 'rounding' },
      },
    );
    assert.ifError(tty.error);
    assert.equal(tty.status, 0, tty.stderr);
    const interactive = JSON.parse(tty.stdout);
    assert.equal(interactive.status, 0, interactive.stderr);
    assert.match(interactive.stderr, /今の気分を入力/);
    assert.equal(
      JSON.parse(interactive.stdout).input_prompt,
      'Synthetic travel mood',
    );
    assert.deepEqual(JSON.parse(interactive.stdout).probabilities, {
      '1': 0.99,
    });
    assert.deepEqual(JSON.parse(interactive.stdout).normalized_probabilities, {
      '1': 1,
    });
    writeFileSync(rawPath, '{}\n');
    const malformed = run(['--prompt', prompt]);
    assert.equal(malformed.status, 1);
    assert.equal(malformed.stdout, '');
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('debug CLI diagnostics preserve stdout and exits while redacting reflected input', () => {
  const directory = mkdtempSync(join(tmpdir(), 'anime-debug-'));
  try {
    const row = normalizeAnime({
      id: 1,
      isAdult: false,
      season: 'SUMMER',
      seasonYear: 2026,
      title: { native: 'PRIVATE title' },
      description: 'PRIVATE description',
      tags: [{ name: 'PRIVATE tag', rank: 90 }],
      source: 'MANGA',
    });
    const raw = join(directory, 'raw.jsonl');
    writeFileSync(raw, JSON.stringify(row) + '\n');
    for (const profile of ['basic', 'full'])
      for (const format of ['human', 'jsonl']) {
        for (const failure of ['', 'debug-http', 'network']) {
          for (const debug of ['', '0', '1']) {
            const result = spawnSync(
              process.execPath,
              [
                '--import',
                './tests/fixtures/jev-fetch.ts',
                'src/cli/recommend.ts',
                '--raw',
                raw,
                '--season',
                'SUMMER',
                '--year',
                '2026',
                '--prompt',
                'PRIVATE mood',
                '--input-profile',
                profile,
                '--format',
                format,
              ],
              {
                encoding: 'utf8',
                timeout: 5000,
                env: {
                  ...process.env,
                  TYPESAFE_API_KEY: 'synthetic-test-key',
                  ANIME_TEST_FAILURE: failure,
                  ANIME_PROMPT_DEBUG: debug,
                },
              },
            );
            assert.ifError(result.error);
            assert.equal(result.status, failure ? 1 : 0, result.stderr);
            assert.doesNotMatch(
              result.stderr,
              /PRIVATE|synthetic-test-key|authorization|reflected/i,
            );
            if (failure) assert.equal(result.stdout, '');
            else if (format === 'jsonl')
              assert.equal(JSON.parse(result.stdout).input_profile, profile);
            else assert.match(result.stdout, /1\. PRIVATE title/);
            if (debug !== '1') {
              assert.equal(
                result.stderr,
                failure === 'debug-http'
                  ? 'Jev HTTP 400\n'
                  : failure === 'network'
                    ? 'Jev request failed\n'
                    : '',
              );
              continue;
            }
            const records = result.stderr
              .split('\n')
              .filter((line) => line.startsWith('Jev debug '))
              .map((line) => JSON.parse(line.slice(10)));
            assert.equal(records.length, 2);
            assert.equal(records[0].input_profile, profile);
            assert.equal(records[0].candidate_count, 1);
            assert.equal(records[0].tags_total, profile === 'full' ? 1 : 0);
            assert.ok(
              records[0].request_body_bytes > records[0].criteria_bytes,
            );
            if (failure === 'network')
              assert.equal(records[1].event, 'request_failed');
            else {
              assert.equal(records[1].http_status, failure ? 400 : 200);
              assert.equal(
                records[1].error_code,
                failure ? 'max_tokens_exceeded' : null,
              );
              assert.equal(
                records[1].response_content_type,
                'application/json',
              );
              assert.equal(
                records[1].response_content_length,
                failure ? 47 : null,
              );
            }
          }
        }
      }
  } finally {
    rmSync(directory, { recursive: true });
  }
});
