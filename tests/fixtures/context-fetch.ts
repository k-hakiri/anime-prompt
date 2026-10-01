await import('./jev-fetch.ts');
const jev = globalThis.fetch;
await import('./openai-fetch.ts');
const openai = globalThis.fetch;
let calls = 0;
globalThis.fetch = async (url, init) => {
  calls++;
  if (calls === Number(process.env.ANIME_TEST_FAIL_AT))
    return new Response('PRIVATE synthetic-test-key', { status: 429 });
  return String(url).includes('typesafe.ai')
    ? jev(url, init)
    : openai(url, init);
};
