import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('help exits successfully with usage on stdout only', () => {
  const result = spawnSync(process.execPath, ['src/cli/main.ts', '--help'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.equal(result.stderr, '');
});

for (const args of [[], ['--unknown'], ['--help', 'extra']]) {
  test(`invalid arguments fail with a diagnostic on stderr only: ${JSON.stringify(args)}`, () => {
    const result = spawnSync(process.execPath, ['src/cli/main.ts', ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /not implemented|unsupported/i);
  });
}
