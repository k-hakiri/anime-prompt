#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { SEASONS, parseAnime } from '../anime/schema.ts';
import { createHash } from 'node:crypto';
import { parseInputProfile } from '../anime/profile.ts';
import { createJevEvaluator, JEV_MODEL } from '../providers/jev.ts';
import { recommend, renderHuman } from '../recommend/run.ts';
import {
  createOpenAIRequester,
  resolveOpenAIModel,
} from '../providers/openai.ts';
import { recommendOpenAI, renderOpenAIHuman } from '../recommend/openai.ts';
import { readPrompt } from './prompt.ts';

async function readJsonl<T>(
  path: string,
  parse: (value: unknown) => T,
): Promise<{ source: string; rows: T[] }> {
  const source = await readFile(path, 'utf8');
  try {
    return {
      source,
      rows: source
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => parse(JSON.parse(line))),
    };
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
      'input-profile': { type: 'string', default: 'full' },
      provider: { type: 'string', default: 'jev' },
      model: { type: 'string' },
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
      'Usage: anime-recommend [--prompt TEXT] [--format human|jsonl] [--season FALL --year 2026] [--raw PATH] [--input-profile basic|full] [--provider jev|luna|sol] [--model ID]\n',
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
    const inputProfile = parseInputProfile(values['input-profile']);
    const provider = values.provider;
    if (provider !== 'jev' && provider !== 'luna' && provider !== 'sol')
      throw new Error('Provider must be jev, luna or sol');
    if (provider === 'jev' && values.model && !values.model.startsWith('jev-'))
      throw new Error('Model must match the selected provider family');
    const model =
      provider === 'jev'
        ? (values.model ?? JEV_MODEL)
        : resolveOpenAIModel(provider, values.model);
    if (provider !== 'jev' && inputProfile !== 'basic')
      throw new Error(
        'Luna / Sol support only basic input profile; specify --input-profile basic',
      );
    const prompt = await readPrompt(values.prompt);
    const seasonId = `${values.year}-${values.season!.toLowerCase()}`;
    const anime = await readJsonl(
      values.raw ?? `data/raw/${seasonId}.jsonl`,
      parseAnime,
    );
    const options = {
      season: values.season as (typeof SEASONS)[number],
      year: Number(values.year),
      inputProfile,
      model,
      rawSha256: createHash('sha256').update(anime.source).digest('hex'),
    };
    if (provider === 'jev') {
      const result = await recommend(
        prompt,
        anime.rows,
        createJevEvaluator(undefined, model, undefined, { inputProfile }),
        options,
      );
      process.stdout.write(
        values.format === 'jsonl'
          ? JSON.stringify(result) + '\n'
          : renderHuman(result),
      );
    } else {
      const result = await recommendOpenAI(
        prompt,
        anime.rows,
        createOpenAIRequester(),
        { ...options, provider },
      );
      process.stdout.write(
        values.format === 'jsonl'
          ? JSON.stringify(result) + '\n'
          : renderOpenAIHuman(result),
      );
    }
  }
} catch (error) {
  process.stderr.write(
    (error instanceof Error ? error.message : 'Recommendation failed') + '\n',
  );
  process.exitCode = 1;
}
