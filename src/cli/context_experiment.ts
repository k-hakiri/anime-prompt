#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { parseAnime } from '../anime/schema.ts';
import { createJevEvaluator } from '../providers/jev.ts';
import { createOpenAIRequester } from '../providers/openai.ts';
import {
  parseContextExperiment,
  runContextExperiment,
  sha256,
} from '../experiments/context.ts';

try {
  const { values } = parseArgs({
    options: {
      experiment: { type: 'string' },
      raw: { type: 'string' },
      format: { type: 'string', default: 'jsonl' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    process.stdout.write(
      'Usage: anime-run-context-experiment --experiment PATH [--raw PATH] [--format jsonl]\n',
    );
  } else {
    if (!values.experiment) throw new Error('--experiment is required');
    if (values.format !== 'jsonl') throw new Error('Format must be jsonl');
    const source = await readFile(values.experiment, 'utf8');
    const experiment = parseContextExperiment(source);
    const raw = await readFile(
      values.raw ??
        `data/raw/${experiment.year}-${experiment.season.toLowerCase()}.jsonl`,
      'utf8',
    );
    let anime;
    try {
      anime = raw
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => parseAnime(JSON.parse(line)));
    } catch {
      throw new Error('Invalid candidate JSONL');
    }
    const results = await runContextExperiment(
      experiment,
      anime,
      {
        jev: createJevEvaluator(undefined, undefined, undefined, {
          inputProfile: 'basic',
        }),
        openai: createOpenAIRequester(),
      },
      { rawSha256: sha256(raw), experimentSha256: sha256(source) },
      (message) => process.stderr.write(message + '\n'),
    );
    process.stdout.write(
      results.map((row) => JSON.stringify(row)).join('\n') + '\n',
    );
    process.stderr.write('Completed 12/12 runs\n');
  }
} catch (error) {
  process.stderr.write(
    'Context experiment failed; no complete batch emitted. ' +
      (error instanceof Error ? error.message : 'Experiment failed') +
      '\n',
  );
  process.exitCode = 1;
}
