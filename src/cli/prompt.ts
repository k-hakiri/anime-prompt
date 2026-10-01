import { createInterface } from 'node:readline';
import { text } from '../anime/schema.ts';
import type { Readable, Writable } from 'node:stream';

export async function readPrompt(
  explicit: string | undefined,
  input: Readable & { isTTY?: boolean } = process.stdin,
  output: Writable = process.stderr,
): Promise<string> {
  if (explicit !== undefined) return text(explicit);
  if (!input.isTTY)
    throw new Error('stdin must be a TTY when --prompt is omitted');
  const readline = createInterface({ input, output, terminal: false });
  try {
    const answer = await new Promise<string>((resolve, reject) => {
      readline.once('close', () => reject(new Error('No prompt received')));
      readline.question('今の気分を入力:\n> ', resolve);
    });
    return text(answer);
  } finally {
    readline.close();
  }
}
