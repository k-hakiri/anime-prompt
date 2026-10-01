import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

function run(args: string[], fail = false) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      './tests/fixtures/anilist-fetch.ts',
      'src/cli/fetch_anilist.ts',
      ...args,
    ],
    {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, ANIME_TEST_FAILURE: fail ? '1' : '' },
    },
  );
}
test('fetch CLI emits one normalized JSON row and no diagnostic on success', () => {
  const result = run(['--season', 'FALL', '--year', '2026']);
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const rows = result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].anime_id, 1);
  assert.equal(rows[0].studio, null);
});
test('fetch invalid arguments and API failures emit stderr only', () => {
  for (const args of [
    [],
    ['--year', '2026', '--season', 'invalid'],
    ['--unknown'],
    ['--year', 'oops', '--season', 'FALL'],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.trim());
  }
  const result = run(['--season', 'FALL', '--year', '2026'], true);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /GraphQL/);
});
