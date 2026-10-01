import { integer, object, text } from '../anime/schema.ts';

export const OPENAI_MODELS = {
  luna: 'gpt-5.6-luna',
  sol: 'gpt-5.6-sol',
} as const;
export type OpenAIProvider = keyof typeof OPENAI_MODELS;
export interface OpenAIResult {
  model: string;
  output: unknown;
  usage: {
    input_tokens: number;
    output_tokens: number;
    input_tokens_details?: { cached_tokens: number };
    output_tokens_details?: { reasoning_tokens: number };
  };
}
export type OpenAIRequester = (
  body: Record<string, unknown>,
) => Promise<OpenAIResult>;

export function resolveOpenAIModel(
  provider: OpenAIProvider,
  requested = OPENAI_MODELS[provider] as string,
): string {
  const base = OPENAI_MODELS[provider];
  // Allow explicit dated snapshots of the selected family, never another model.
  if (
    requested !== base &&
    !new RegExp(`^${base.replaceAll('.', '\\.')}-\\d{4}-\\d{2}-\\d{2}$`).test(
      requested,
    )
  )
    throw new Error('Model must match the selected provider family');
  return requested;
}

export function createOpenAIRequester(
  apiKey = process.env.OPENAI_API_KEY,
  request: typeof fetch = fetch,
): OpenAIRequester {
  return async (body) => {
    if (!apiKey?.trim()) throw new Error('OPENAI_API_KEY is required');
    let response: Response;
    try {
      response = await request('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new Error('OpenAI request failed');
    }
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
    try {
      const payload = object(await response.json());
      if (payload.status !== 'completed' || !Array.isArray(payload.output))
        throw new Error('Incomplete response');
      const messages = payload.output
        .map(object)
        .filter((item) => item.type === 'message');
      if (messages.length !== 1 || messages[0]!.status !== 'completed')
        throw new Error('Missing output message');
      const content = messages[0]!.content;
      if (!Array.isArray(content) || content.length !== 1)
        throw new Error('Invalid content');
      const output = object(content[0]);
      if (output.type !== 'output_text') throw new Error('Refused output');
      const usage = object(payload.usage);
      return {
        model: text(payload.model),
        output: JSON.parse(text(output.text)),
        usage: {
          input_tokens: integer(usage.input_tokens),
          output_tokens: integer(usage.output_tokens),
          ...(usage.input_tokens_details == null
            ? {}
            : {
                input_tokens_details: {
                  cached_tokens: integer(
                    object(usage.input_tokens_details).cached_tokens,
                  ),
                },
              }),
          ...(usage.output_tokens_details == null
            ? {}
            : {
                output_tokens_details: {
                  reasoning_tokens: integer(
                    object(usage.output_tokens_details).reasoning_tokens,
                  ),
                },
              }),
        },
      };
    } catch {
      throw new Error('Invalid OpenAI response');
    }
  };
}
