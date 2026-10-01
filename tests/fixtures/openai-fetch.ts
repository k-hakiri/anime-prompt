import assert from 'node:assert/strict';

globalThis.fetch = async (url, init) => {
  assert.equal(url, 'https://api.openai.com/v1/responses');
  const body = JSON.parse(String(init?.body));
  assert.deepEqual(body.reasoning, { effort: 'none' });
  assert.equal(body.text.format.strict, true);
  const input = JSON.parse(body.input);
  for (const row of input.candidates) {
    assert.deepEqual(
      Object.keys(row).sort(),
      [
        'anime_id',
        'title',
        'description',
        'genres',
        'format',
        'episodes',
        'duration',
      ].sort(),
    );
  }
  const failure = process.env.ANIME_TEST_FAILURE;
  if (failure === 'network') throw new Error('PRIVATE synthetic-test-key');
  if (failure === 'http')
    return new Response('PRIVATE synthetic-test-key', { status: 400 });
  const ids = input.candidates
    .slice(0, 5)
    .map((row: { anime_id: number }) => row.anime_id);
  if (failure === 'duplicate') ids[ids.length - 1] = ids[0];
  if (failure === 'outside') ids[0] = 999;
  if (failure === 'count') ids.pop();
  return Response.json({
    status: failure === 'incomplete' ? 'incomplete' : 'completed',
    model: body.model,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      output_tokens_details: { reasoning_tokens: 0 },
    },
    output: [
      {
        type: 'message',
        status: 'completed',
        content: [
          failure === 'refusal'
            ? { type: 'refusal', refusal: 'PRIVATE' }
            : {
                type: 'output_text',
                text: JSON.stringify({
                  recommendations: ids.map((anime_id: number) => ({
                    anime_id,
                  })),
                }),
              },
        ],
      },
    ],
  });
};
