import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { normalizeAnime } from '../../src/anilist/normalize.ts';

test('Luna / Sol CLI preserves human, JSONL, TTY, non-TTY and failure contracts without real API', () => {
  const directory = mkdtempSync(join(tmpdir(), 'anime-openai-'));
  try {
    const raw = join(directory, 'raw.jsonl');
    writeFileSync(
      raw,
      [1, 2, 3, 4, 5, 6]
        .map((id) =>
          JSON.stringify(
            normalizeAnime({
              id,
              title: { native: `Synthetic ${id}` },
              isAdult: false,
              season: 'SUMMER',
              seasonYear: 2026,
            }),
          ),
        )
        .join('\n') + '\n',
    );
    const args = [
      '--import',
      './tests/fixtures/openai-fetch.ts',
      'src/cli/recommend.ts',
      '--raw',
      raw,
      '--season',
      'SUMMER',
      '--year',
      '2026',
    ];
    const env = {
      ...process.env,
      OPENAI_API_KEY: 'synthetic-test-key',
      ANIME_TEST_FAILURE: '',
      ANIME_PROMPT_DEBUG: '1',
    };
    for (const provider of ['luna', 'sol']) {
      const base = [
        ...args,
        '--provider',
        provider,
        '--input-profile',
        'basic',
      ];
      function run(extra: string[], failure = '') {
        return spawnSync(process.execPath, [...base, ...extra], {
          encoding: 'utf8',
          input: 'ignored pipe',
          timeout: 5000,
          env: { ...env, ANIME_TEST_FAILURE: failure },
        });
      }
      const jsonl = run([
        '--prompt',
        '  Synthetic mood  ',
        '--format',
        'jsonl',
      ]);
      assert.equal(jsonl.status, 0, jsonl.stderr);
      assert.equal(jsonl.stderr, '');
      assert.equal(jsonl.stdout.trim().split('\n').length, 1);
      const record = JSON.parse(jsonl.stdout);
      assert.equal(record.model, `gpt-5.6-${provider}`);
      assert.equal(record.input_prompt, '  Synthetic mood  ');
      assert.equal(record.recommendations.length, 5);
      assert.equal(record.recommendations[0].title, 'Synthetic 1');
      assert.equal(record.reasoning_effort, 'none');
      assert.ok(!Object.hasOwn(record, 'confidence'));
      assert.equal(record.metadata.raw_sha256.length, 64);
      const human = run(['--prompt', 'Synthetic mood']);
      assert.equal(human.status, 0, human.stderr);
      assert.match(human.stdout, /1\. Synthetic 1/);
      assert.doesNotMatch(human.stdout, /confidence|%/);
      assert.equal(human.stderr, '');
      for (const failure of [
        'http',
        'network',
        'duplicate',
        'outside',
        'count',
        'refusal',
        'incomplete',
      ]) {
        for (const format of ['human', 'jsonl']) {
          const failed = run(
            ['--prompt', 'PRIVATE mood', '--format', format],
            failure,
          );
          assert.equal(failed.status, 1);
          assert.equal(failed.stdout, '');
          assert.ok(failed.stderr.trim());
          assert.doesNotMatch(
            failed.stderr,
            /PRIVATE|synthetic-test-key|authorization/i,
          );
        }
      }
      for (const extra of [
        [],
        ['--prompt', ' '],
        ['--prompt', 'mood', '--input-profile', 'full'],
        ['--prompt', 'mood', '--provider', 'invalid'],
        ['--prompt', 'mood', '--model', 'jev-1.13.0'],
        [
          '--prompt',
          'mood',
          '--model',
          `gpt-5.6-${provider === 'sol' ? 'luna' : 'sol'}`,
        ],
      ]) {
        const failed = run(extra);
        assert.equal(failed.status, 1);
        assert.equal(failed.stdout, '');
      }
      const defaultProfile = spawnSync(
        process.execPath,
        [...args, '--provider', provider, '--prompt', 'mood'],
        { encoding: 'utf8', env, timeout: 5000 },
      );
      assert.equal(defaultProfile.status, 1);
      assert.match(defaultProfile.stderr, /only basic/);
      const tty = spawnSync(
        'python3',
        [
          'tests/fixtures/recommend-pty.py',
          process.execPath,
          ...base,
          '--format',
          'jsonl',
        ],
        { encoding: 'utf8', env, timeout: 10000 },
      );
      assert.equal(tty.status, 0, tty.stderr);
      const interactive = JSON.parse(tty.stdout);
      assert.equal(interactive.status, 0, interactive.stderr);
      assert.match(interactive.stderr, /今の気分を入力/);
      assert.equal(
        JSON.parse(interactive.stdout).input_prompt,
        'Synthetic travel mood',
      );
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});
