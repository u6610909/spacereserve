import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `src/integrations/finderai.ts` reads `config`/`getSecrets` from
 * `src/config`, which itself resolves once from `NODE_ENV` (see
 * config.keyvault.test.ts). Reload both fresh per test, in "development"
 * mode, so FINDERAI_API_KEY / FINDERAI_BASE_URL env stubs actually take
 * effect — the shared `test` mode the rest of the suite runs in hardcodes
 * these blank on purpose (TEST_SECRETS in config/index.ts).
 */
async function loadFinderAi(env: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'development');
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

  const configModule = await import('../src/config');
  await configModule.resolveSecrets();
  return import('../src/integrations/finderai');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('FinderAI — not configured', () => {
  it('degrades to the mock (empty array) rather than throwing', async () => {
    const { lookupLostItems } = await loadFinderAi({});
    await expect(lookupLostItems('Room A')).resolves.toEqual([]);
  });
});

describe('FinderAI — real client', () => {
  it('calls <base>/items/by-location with location + since, and the x-api-key header', async () => {
    const items = [
      {
        id: 'c7b2a9e1-8842-4f30-b3e1-9214a1c50012',
        title: 'Black Leather Wallet',
        description: 'Found near the couch.',
        category: 'Wallets & Bags',
        location: 'CL Lounge 2nd Floor',
        createdAt: '2026-08-13T09:30:00.000Z',
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, location: 'CL Lounge 2nd Floor', items }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { lookupLostItems } = await loadFinderAi({
      FINDERAI_API_KEY: 'their-real-key',
      FINDERAI_BASE_URL: 'https://finderai.example.com/project/api',
    });

    await expect(lookupLostItems('CL Lounge 2nd Floor')).resolves.toEqual(items);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(
      /^https:\/\/finderai\.example\.com\/project\/api\/items\/by-location\?location=CL(%20|\+)Lounge(%20|\+)2nd(%20|\+)Floor&since=/,
    );
    expect((opts.headers as Record<string, string>)['x-api-key']).toBe('their-real-key');
  });

  it('degrades to null (never throws) when FinderAI answers with a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));

    const { lookupLostItems } = await loadFinderAi({
      FINDERAI_API_KEY: 'k',
      FINDERAI_BASE_URL: 'https://finderai.example.com',
    });

    await expect(lookupLostItems('Room B')).resolves.toBeNull();
  });

  it('degrades to null when the body says success: false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false, location: 'Room C', items: [] }) }),
    );

    const { lookupLostItems } = await loadFinderAi({
      FINDERAI_API_KEY: 'k',
      FINDERAI_BASE_URL: 'https://finderai.example.com',
    });

    await expect(lookupLostItems('Room C')).resolves.toBeNull();
  });
});
