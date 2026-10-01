import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArgs } from '../../src/cli/args.ts';

test('accepts a single help flag', () => {
  assert.equal(parseArgs(['--help']), 'help');
});

for (const args of [[], ['--unknown'], ['--help', 'extra']]) {
  test(`rejects unsupported arguments: ${JSON.stringify(args)}`, () => {
    assert.equal(parseArgs(args), 'invalid');
  });
}
