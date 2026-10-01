import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('../../scripts/test.ts', import.meta.url));

function runFixture(source?: string) {
  const directory = mkdtempSync(join(tmpdir(), 'anime-prompt-test-runner-'));
  try {
    if (source !== undefined) {
      mkdirSync(join(directory, 'nested'));
      writeFileSync(join(directory, 'nested/fixture.test.ts'), source);
    }
    return spawnSync(process.execPath, [runner, 'nested/**/*.test.ts'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 5000,
    });
  } finally {
    rmSync(directory, { recursive: true });
  }
}

test('test runner rejects a pattern with no matching files', () => {
  const result = runFixture();
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No test files matched/);
});

test('test runner discovers and executes a nested passing test', () => {
  const result = runFixture(
    "import { test } from 'node:test';\ntest('nested fixture', () => {});\n",
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /nested fixture/);
  assert.equal(result.stderr, '');
});

test('test runner propagates a nested test failure', () => {
  const result = runFixture(
    "import { test } from 'node:test';\ntest('nested fixture', () => { throw new Error('fixture failed'); });\n",
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /fixture failed/);
});
