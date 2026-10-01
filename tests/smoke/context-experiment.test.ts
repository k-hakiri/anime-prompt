import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { normalizeAnime } from '../../src/anilist/normalize.ts';

test('one CLI invocation emits exactly 12 JSONL rows; failures at start, middle and end emit no incomplete batch', () => {
  const directory = mkdtempSync(join(tmpdir(), 'anime-context-'));
  try {
    const raw = join(directory, 'raw.jsonl');
    writeFileSync(
      raw,
      Array.from({ length: 106 }, (_, i) =>
        JSON.stringify(
          normalizeAnime({
            id: i + 1,
            title: { native: `Synthetic ${i + 1}` },
            isAdult: false,
            season: 'SUMMER',
            seasonYear: 2026,
          }),
        ),
      ).join('\n') + '\n',
    );
    const base = [
      '--import',
      './tests/fixtures/context-fetch.ts',
      'src/cli/context_experiment.ts',
    ];
    const args = [
      '--experiment',
      'experiments/smoking-context-v1.yaml',
      '--raw',
      raw,
      '--format',
      'jsonl',
    ];
    const env = {
      ...process.env,
      TYPESAFE_API_KEY: 'synthetic-test-key',
      OPENAI_API_KEY: 'synthetic-test-key',
      ANIME_PROMPT_DEBUG: '',
      ANIME_TEST_FAILURE: '',
      ANIME_TEST_FAIL_AT: '',
    };
    function run(extra: string[], failAt = '') {
      return spawnSync(process.execPath, [...base, ...extra], {
        encoding: 'utf8',
        timeout: 10000,
        env: { ...env, ANIME_TEST_FAIL_AT: failAt },
      });
    }
    const success = run(args);
    assert.equal(success.status, 0, success.stderr);
    const lines = success.stdout.trim().split('\n');
    assert.equal(lines.length, 12);
    const records = lines.map((line) => JSON.parse(line));
    assert.deepEqual(
      records.map((row) => `${row.provider}:${row.context_mode}`),
      ['typesafe', 'luna', 'sol'].flatMap((provider) =>
        ['baseline', 'policy', 'preference', 'combined'].map(
          (mode) => `${provider}:${mode}`,
        ),
      ),
    );
    assert.deepEqual(
      records.map((row) => row.run_index),
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    assert.ok(
      records.every(
        (row) =>
          row.input_profile === 'basic' && row.recommendations.length === 5,
      ),
    );
    assert.match(success.stderr, /Completed 12\/12/);
    for (const failAt of ['1', '6', '12']) {
      const failure = run(args, failAt);
      assert.equal(failure.status, 1);
      assert.equal(failure.stdout, '');
      assert.match(failure.stderr, /no complete batch emitted/);
      assert.doesNotMatch(
        failure.stderr,
        /PRIVATE|synthetic-test-key|Completed/,
      );
      assert.equal(
        failure.stderr.split('\n').filter((line) => /^\d+\/12/.test(line))
          .length,
        Number(failAt),
      );
    }
    for (const extra of [
      [],
      [...args, '--format', 'human'],
      [...args, '--unknown'],
    ]) {
      const failure = run(extra);
      assert.equal(failure.status, 1);
      assert.equal(failure.stdout, '');
    }
    writeFileSync(raw, '{"PRIVATE":\n');
    const invalid = run(args);
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /Invalid candidate JSONL/);
    assert.doesNotMatch(invalid.stderr, /PRIVATE/);
    const help = run(['--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: anime-run-context-experiment/);
    assert.equal(help.stderr, '');
  } finally {
    rmSync(directory, { recursive: true });
  }
});
