export function parseArgs(args: readonly string[]): 'help' | 'invalid' {
  return args.length === 1 && args[0] === '--help' ? 'help' : 'invalid';
}
