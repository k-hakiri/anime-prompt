#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { SEASONS } from '../anime/schema.ts';
import type { Season } from '../anime/schema.ts';
import { fetchSeason } from '../anilist/client.ts';
import { normalizeAnime } from '../anilist/normalize.ts';

try {
  const { values } = parseArgs({
    options: {
      season: { type: 'string' },
      year: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    process.stdout.write(
      'Usage: anime-fetch-anilist --season FALL --year 2026\n',
    );
  } else {
    if (
      !SEASONS.includes(values.season as Season) ||
      !values.year ||
      !/^\d{4}$/.test(values.year) ||
      Number(values.year) < 1940
    )
      throw new Error(
        'Specify --season WINTER|SPRING|SUMMER|FALL and --year YYYY (1940–9999)',
      );
    const rows = (
      await fetchSeason(values.season as Season, Number(values.year))
    ).map(normalizeAnime);
    for (const row of rows) process.stdout.write(JSON.stringify(row) + '\n');
  }
} catch (error) {
  process.stderr.write(
    (error instanceof Error ? error.message : 'Fetch failed') + '\n',
  );
  process.exitCode = 1;
}
