import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';

const pattern = process.argv[2];
const files = pattern === undefined ? [] : globSync(pattern);

if (files.length === 0) {
  process.stderr.write(
    `No test files matched: ${pattern ?? '(missing pattern)'}\n`,
  );
  process.exitCode = 1;
} else {
  // Start a standalone run when this command is invoked from another Node test.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
    env,
  });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
  }
  process.exitCode = result.status ?? 1;
}
