globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body));
  if (process.env.ANIME_TEST_FAILURE === 'http')
    return new Response('synthetic-test-key', { status: 429 });
  return Response.json({
    model: 'jev-1.13.0',
    answers: Object.fromEntries(
      Object.keys(body.questions).map((axis) => [
        axis,
        {
          type: 'score',
          score: process.env.ANIME_TEST_FAILURE === 'score' ? 999 : 2.4,
          confidence: 0.9,
        },
      ]),
    ),
    usage: { input_tokens: 100, output_tokens: 12 },
  });
};
