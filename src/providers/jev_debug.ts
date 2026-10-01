import type { InputProfile } from '../anime/profile.ts';
import type { ChoiceQuestion, ScoreQuestion } from './jev.ts';

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
export function writeJevDebug(record: Record<string, unknown>): void {
  process.stderr.write(`Jev debug ${JSON.stringify(record)}\n`);
}
export function requestDiagnostics(
  body: string,
  inputProfile?: InputProfile,
): Record<string, unknown> {
  // Measure the serialized wire representation, including UTF-8 and JSON escaping.
  const { state, questions } = JSON.parse(body) as {
    state: unknown;
    questions: Record<string, ScoreQuestion | ChoiceQuestion>;
  };
  let candidateCount = 0;
  let tagsTotal = 0;
  let criteriaBytes = 0;
  let maxCandidateBytes = 0;
  for (const question of Object.values(questions)) {
    criteriaBytes += bytes(question.criteria);
    if (question.type !== 'choice') continue;
    for (const candidate of Object.values(question.criteria)) {
      candidateCount++;
      tagsTotal += Array.isArray(candidate.tags) ? candidate.tags.length : 0;
      maxCandidateBytes = Math.max(maxCandidateBytes, bytes(candidate));
    }
  }
  return {
    event: 'request',
    input_profile:
      inputProfile === 'basic' || inputProfile === 'full' ? inputProfile : null,
    candidate_count: candidateCount,
    request_body_bytes: Buffer.byteLength(body),
    state_bytes: bytes(state),
    questions_bytes: bytes(questions),
    criteria_bytes: criteriaBytes,
    tags_total: tagsTotal,
    max_candidate_criteria_bytes: maxCandidateBytes,
  };
}

// Header names alone do not make their values safe; classify rather than echo.
function contentType(response: Response): string | null {
  const mime = response.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase();
  if (!mime) return null;
  return [
    'application/json',
    'application/problem+json',
    'text/plain',
    'text/html',
  ].includes(mime)
    ? mime
    : 'other';
}
async function knownErrorCode(response: Response): Promise<string | null> {
  if (
    response.ok ||
    !['application/json', 'application/problem+json'].includes(
      contentType(response) ?? '',
    )
  )
    return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const deadline = setTimeout(() => {
    void reader.cancel().catch(() => {});
  }, 1000);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    // Never buffer an unbounded validation response containing echoed input.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) return null;
      chunks.push(value);
    }
    const payload: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (payload && typeof payload === 'object' && 'detail' in payload) {
      const detail = payload.detail;
      // Exact value allowlist. Free-form messages and unknown codes stay private.
      if (
        detail &&
        typeof detail === 'object' &&
        'error_type' in detail &&
        detail.error_type === 'max_tokens_exceeded'
      )
        return 'max_tokens_exceeded';
    }
  } catch {
    // Diagnostics must preserve the original HTTP failure even for broken bodies.
  } finally {
    clearTimeout(deadline);
    void reader.cancel().catch(() => {});
  }
  return null;
}
export async function responseDiagnostics(
  response: Response,
): Promise<Record<string, unknown>> {
  const length = response.headers.get('content-length');
  const numericLength =
    length !== null && /^\d+$/.test(length) ? Number(length) : NaN;
  return {
    event: 'response',
    http_status: response.status,
    response_content_type: contentType(response),
    response_content_length: Number.isSafeInteger(numericLength)
      ? numericLength
      : null,
    error_code: await knownErrorCode(response),
  };
}
