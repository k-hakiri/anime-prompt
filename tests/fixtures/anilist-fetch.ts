// In-process fetch injection loaded only by smoke tests; never contacts a network.
globalThis.fetch = async () =>
  process.env.ANIME_TEST_FAILURE
    ? Response.json({ errors: [{ message: 'synthetic provider failure' }] })
    : Response.json({
        data: {
          Page: {
            pageInfo: { currentPage: 1, hasNextPage: false },
            media: [
              {
                id: 1,
                title: { native: '架空の旅' },
                season: 'FALL',
                seasonYear: 2026,
                studios: { nodes: null },
              },
            ],
          },
        },
      });
