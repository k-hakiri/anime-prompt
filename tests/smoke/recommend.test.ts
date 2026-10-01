import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { normalizeAnime } from '../../src/anilist/normalize.ts';
import { AXES, loadSchema } from '../../src/features/schema.ts';
import { buildFeatures } from '../../src/features/build.ts';

test('recommend CLI supports explicit human/JSONL and actual stdin TTY with UI on stderr', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'anime-recommend-'));
  try {
    const schema = await loadSchema();
    const anime = [
      normalizeAnime({ id: 1, title: { native: 'Synthetic Journey' } }),
    ];
    const features = [
      await buildFeatures(anime[0]!, schema, 'full', async () => ({
        model: 'jev-1.13.0',
        answers: Object.fromEntries(
          AXES.map((axis) => [
            axis,
            { type: 'score', score: 2.4, confidence: 0.9 },
          ]),
        ),
        usage: { input_tokens: 100, output_tokens: 12 },
      })),
    ];
    const rawPath = join(directory, 'raw.jsonl');
    const featuresPath = join(directory, 'features.jsonl');
    writeFileSync(rawPath, JSON.stringify(anime[0]) + '\n');
    writeFileSync(featuresPath, JSON.stringify(features[0]) + '\n');
    const args = [
      '--import',
      './tests/fixtures/jev-fetch.ts',
      'src/cli/recommend.ts',
      '--raw',
      rawPath,
      '--features',
      featuresPath,
    ];
    const env = {
      ...process.env,
      TYPESAFE_API_KEY: 'synthetic-test-key',
      ANIME_TEST_FAILURE: '',
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
    assert.match(record.recommendations[0].reason, /healing:/);
    assert.match(record.recommendations[0].reason, /cognitive_load:/);
    assert.equal(record.recommendations[0].anime_id, 1);
    assert.equal(record.input_profile.profile_schema_version, 'v1');
    const human = run(['--prompt', prompt]);
    assert.equal(human.status, 0);
    assert.match(human.stdout, /1\. Synthetic Journey/);
    assert.match(human.stdout, /癒やし度:/);
    assert.match(human.stdout, /頭を使う度合い:/);
    assert.match(human.stdout, /シリアス度:/);
    assert.doesNotMatch(human.stdout, /healing:|cognitive_load:|seriousness:/);
    assert.match(human.stdout, /time:/);
    assert.equal(human.stderr, '');
    for (const [extra, failure] of [
      [[], ''],
      [['--prompt', '   '], ''],
      [['--prompt', prompt, '--format', 'invalid'], ''],
      [['--prompt', prompt], 'http'],
      [['--prompt', prompt], 'score'],
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
        env,
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
    writeFileSync(featuresPath, '{}\n');
    const malformed = run(['--prompt', prompt]);
    assert.equal(malformed.status, 1);
    assert.equal(malformed.stdout, '');
  } finally {
    rmSync(directory, { recursive: true });
  }
});
