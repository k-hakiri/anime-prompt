import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { normalizeAnime } from '../../src/anilist/normalize.ts';
const row = JSON.stringify(
  normalizeAnime({ id: 1, title: { native: '架空の旅' } }),
);
function run(input: string, args: string[] = [], failure = '') {
  return spawnSync(
    process.execPath,
    [
      '--import',
      './tests/fixtures/jev-fetch.ts',
      'src/cli/build_features.ts',
      ...args,
    ],
    {
      input,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        TYPESAFE_API_KEY: 'synthetic-test-key',
        ANIME_TEST_FAILURE: failure,
      },
    },
  );
}
test('feature CLI streams validated records only to stdout', () => {
  const second = JSON.stringify(normalizeAnime({ id: 2 }));
  const result = run(row + '\n' + second + '\n');
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const records = result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    records.map((record) => record.anime_id),
    [1, 2],
  );
  assert.equal(records[0].input_profile, 'full');
  assert.equal(records[0].features.healing.score, 0.6);
  assert.equal(
    JSON.parse(run(row, ['--input-profile', 'basic']).stdout).input_profile,
    'basic',
  );
});
test('bad JSONL/profile/schema/provider data return nonzero with diagnostics and no secrets', () => {
  for (const [input, args, failure] of [
    ['', [], ''],
    ['invalid', [], ''],
    ['{}', [], ''],
    [row, ['--input-profile', 'unknown'], ''],
    [row, ['--schema', 'missing.yaml'], ''],
    [row, [], 'http'],
    [row, [], 'score'],
  ] as [string, string[], string][]) {
    const result = run(input, args, failure);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.trim());
    assert.doesNotMatch(result.stderr, /synthetic-test-key/);
  }
  const duplicate = run(row + '\n' + row);
  assert.equal(duplicate.status, 1);
  assert.equal(duplicate.stdout.trim().split('\n').length, 1);
});
