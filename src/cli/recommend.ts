#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { SEASONS, parseAnime } from '../anime/schema.ts';
import { loadSchema, parseFeatureRecord } from '../features/schema.ts';
import { createJevEvaluator, JEV_MODEL } from '../providers/jev.ts';
import { recommend, renderHuman } from '../recommend/run.ts';
import { readPrompt } from './prompt.ts';

async function readJsonl<T>(
  path: string,
  parse: (value: unknown) => T,
): Promise<T[]> {
  const source = await readFile(path, 'utf8');
  try {
    return source
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => parse(JSON.parse(line)));
  } catch {
    throw new Error('Invalid candidate JSONL');
  }
}
try {
  const now = new Date();
  const { values } = parseArgs({
    options: {
      prompt: { type: 'string' },
      format: { type: 'string', default: 'human' },
      raw: { type: 'string' },
      features: { type: 'string' },
      schema: { type: 'string' },
      model: { type: 'string', default: JEV_MODEL },
      season: {
        type: 'string',
        default: SEASONS[Math.floor(now.getUTCMonth() / 3)],
      },
      year: { type: 'string', default: String(now.getUTCFullYear()) },
      help: { type: 'boolean' },
    },
  });
  if (values.help)
    process.stdout.write(
      'Usage: anime-recommend [--prompt TEXT] [--format human|jsonl] [--season FALL --year 2026] [--raw PATH --features PATH] [--schema PATH] [--model ID]\n',
    );
  else {
    if (values.format !== 'human' && values.format !== 'jsonl')
      throw new Error('Format must be human or jsonl');
    if (
      !SEASONS.includes(values.season as (typeof SEASONS)[number]) ||
      !/^\d{4}$/.test(values.year!) ||
      Number(values.year) < 1940
    )
      throw new Error('Invalid season/year');
    const prompt = await readPrompt(values.prompt);
    const seasonId = `${values.year}-${values.season!.toLowerCase()}`;
    const schema = await loadSchema(values.schema);
    const anime = await readJsonl(
      values.raw ?? `data/raw/${seasonId}.jsonl`,
      parseAnime,
    );
    const features = await readJsonl(
      values.features ??
        `data/features/${seasonId}-full-${schema.version}.jsonl`,
      parseFeatureRecord,
    );
    const result = await recommend(
      prompt,
      anime,
      features,
      schema,
      createJevEvaluator(undefined, values.model),
      values.model,
    );
    process.stdout.write(
      values.format === 'jsonl'
        ? JSON.stringify(result) + '\n'
        : renderHuman(result),
    );
  }
} catch (error) {
  process.stderr.write(
    (error instanceof Error ? error.message : 'Recommendation failed') + '\n',
  );
  process.exitCode = 1;
}
