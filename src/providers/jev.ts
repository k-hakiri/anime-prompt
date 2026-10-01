import { object, text, integer } from '../anime/schema.ts';
import type { InputProfile } from '../anime/profile.ts';
import {
  requestDiagnostics,
  responseDiagnostics,
  writeJevDebug,
} from './jev_debug.ts';

export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}
export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, Record<string, unknown>>;
}
export interface JevResult {
  model: string;
  answers: Record<string, unknown>;
  usage: { input_tokens: number; output_tokens: number };
}
export type JevEvaluator = (
  state: unknown,
  questions: Record<string, ScoreQuestion | ChoiceQuestion>,
) => Promise<JevResult>;
export const JEV_MODEL = 'jev-1.13.0';
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export function createJevEvaluator(
  apiKey: string | undefined = process.env.TYPESAFE_API_KEY,
  model: string = JEV_MODEL,
  request: typeof fetch = fetch,
  options: { inputProfile?: InputProfile } = {},
): JevEvaluator {
  return async (state, questions) => {
    if (!apiKey?.trim()) throw new Error('TYPESAFE_API_KEY is required');
    const debug = process.env.ANIME_PROMPT_DEBUG === '1';
    let response: Response;
    try {
      const body = JSON.stringify({ model, state, questions });
      if (debug) writeJevDebug(requestDiagnostics(body, options.inputProfile));
      response = await request(JEV_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      if (debug) writeJevDebug({ event: 'request_failed' });
      throw new Error('Jev request failed');
    }
    if (debug) writeJevDebug(await responseDiagnostics(response));
    if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
    try {
      const payload = object(await response.json());
      const usage = object(payload.usage);
      return {
        model: text(payload.model),
        answers: object(payload.answers),
        usage: {
          input_tokens: integer(usage.input_tokens),
          output_tokens: integer(usage.output_tokens),
        },
      };
    } catch {
      throw new Error('Invalid Jev response');
    }
  };
}
