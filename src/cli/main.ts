import { parseArgs } from './args.ts';

if (parseArgs(process.argv.slice(2)) === 'help') {
  process.stdout.write(
    'Usage: node src/cli/main.ts --help\n\n' +
      'Anime Prompt: CLI scaffold for local and CI verification.\n' +
      'Commands: anime-fetch-anilist, anime-build-features, anime-recommend. See README for usage.\n',
  );
} else {
  process.stderr.write(
    'Unsupported arguments or operation not implemented. Use --help.\n',
  );
  process.exitCode = 2;
}
