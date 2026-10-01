import { object, text, integer } from '../anime/schema.ts';

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
): JevEvaluator {
  return async (state, questions) => {
    if (!apiKey?.trim()) throw new Error('TYPESAFE_API_KEY is required');
    let response: Response;
    try {
      response = await request(JEV_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, state, questions }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new Error('Jev request failed');
    }
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
