#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { parseAnime } from '../anime/schema.ts';
import { loadSchema, parseInputProfile } from '../features/schema.ts';
import { buildFeatures } from '../features/build.ts';
import { createJevEvaluator, JEV_MODEL } from '../providers/jev.ts';

try {
  const { values } = parseArgs({
    options: {
      schema: { type: 'string' },
      'input-profile': { type: 'string', default: 'full' },
      model: { type: 'string', default: JEV_MODEL },
      help: { type: 'boolean' },
    },
  });
  if (values.help)
    process.stdout.write(
      'Usage: anime-build-features [--schema PATH] [--input-profile basic|full] [--model ID] < raw.jsonl\n',
    );
  else {
    const schema = await loadSchema(values.schema);
    const profile = parseInputProfile(values['input-profile']);
    const evaluate = createJevEvaluator(undefined, values.model);
    const input = createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    });
    let count = 0;
    const ids = new Set<number>();
    try {
      for await (const line of input) {
        if (!line.trim()) continue;
        let anime;
        try {
          anime = parseAnime(JSON.parse(line));
        } catch {
          throw new Error('Invalid normalized anime JSONL');
        }
        if (ids.has(anime.anime_id)) throw new Error('Duplicate anime ID');
        ids.add(anime.anime_id);
        const record = await buildFeatures(
          anime,
          schema,
          profile,
          evaluate,
          values.model,
        );
        process.stdout.write(JSON.stringify(record) + '\n');
        count++;
      }
      if (!count) throw new Error('No anime records on stdin');
    } finally {
      input.close();
    }
  }
} catch (error) {
  process.stderr.write(
    (error instanceof Error ? error.message : 'Feature generation failed') +
      '\n',
  );
  process.exitCode = 1;
}
