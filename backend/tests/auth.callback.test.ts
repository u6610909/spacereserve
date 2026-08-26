import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Express } from 'express';
import type { Role } from '@prisma/client';

const FAKE_PKCE = { state: 'fixed-test-state', codeVerifier: 'fixed-test-verifier', codeChallenge: 'fixed-test-challenge' };
const FAKE_USER = {
  id: 'user-1',
  adObjectId: 'fake-oid',
  email: 'callback@test.dev',
  name: 'Callback Test',
  role: 'STUDENT' as Role,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * `config` reads env at import time and `app.ts` imports it (directly and via
 * the auth module chain), so each scenario needs a fresh module graph — same
 * dynamic-import-after-vi.stubEnv pattern as config.keyvault.test.ts. Real
 * MSAL/AD calls aren't available in tests, so auth.service is mocked at the
 * boundary instead of exercising the real OIDC exchange.
 */
async function loadAppWithFrontendUrl(frontendUrl: string | undefined): Promise<Express> {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'test');
  if (frontendUrl === undefined) {
    vi.stubEnv('FRONTEND_URL', '');
  } else {
    vi.stubEnv('FRONTEND_URL', frontendUrl);
  }

  vi.doMock('../src/modules/auth/auth.service', () => ({
    generatePkce: vi.fn().mockReturnValue(FAKE_PKCE),
    buildAuthCodeUrl: vi.fn().mockResolvedValue('https://login.microsoftonline.com/fake-authorize'),
    completeLogin: vi.fn().mockResolvedValue({ user: FAKE_USER, token: 'fake-jwt' }),
    devLogin: vi.fn(),
    getUserById: vi.fn(),
    reissueToken: vi.fn(),
  }));

  const { resolveSecrets } = await import('../src/config');
  await resolveSecrets();
  const { createApp } = await import('../src/app');
  return createApp();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('../src/modules/auth/auth.service');
  vi.resetModules();
});

describe('GET /auth/callback', () => {
  it('redirects to FRONTEND_URL and sets the session cookie when it is configured', async () => {
    const app = await loadAppWithFrontendUrl('http://localhost:5173/spacereserve/');
    const agent = request.agent(app);

    const loginRes = await agent.get('/spacereserve/api/v1/auth/login');
    expect(loginRes.status).toBe(302);

    const callbackRes = await agent.get(
      `/spacereserve/api/v1/auth/callback?code=fake-code&state=${FAKE_PKCE.state}`,
    );

    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.location).toBe('http://localhost:5173/spacereserve/');
    const setCookie = callbackRes.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie].filter(Boolean);
    expect(cookies.some((c: string) => c.startsWith('session='))).toBe(true);
  });

  it('falls back to the JSON body when FRONTEND_URL is not configured', async () => {
    const app = await loadAppWithFrontendUrl(undefined);
    const agent = request.agent(app);

    await agent.get('/spacereserve/api/v1/auth/login');
    const callbackRes = await agent.get(
      `/spacereserve/api/v1/auth/callback?code=fake-code&state=${FAKE_PKCE.state}`,
    );

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.body).toMatchObject({ status: 'ok', user: { email: FAKE_USER.email } });
  });

  it('?mode=json always returns {token}, regardless of FRONTEND_URL', async () => {
    const app = await loadAppWithFrontendUrl('http://localhost:5173/spacereserve/');
    const agent = request.agent(app);

    await agent.get('/spacereserve/api/v1/auth/login');
    const callbackRes = await agent.get(
      `/spacereserve/api/v1/auth/callback?code=fake-code&state=${FAKE_PKCE.state}&mode=json`,
    );

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.body).toEqual({ token: 'fake-jwt' });
  });

  it('rejects a state mismatch before ever calling completeLogin', async () => {
    const app = await loadAppWithFrontendUrl('http://localhost:5173/spacereserve/');
    const agent = request.agent(app);

    await agent.get('/spacereserve/api/v1/auth/login');
    const callbackRes = await agent.get('/spacereserve/api/v1/auth/callback?code=fake-code&state=wrong-state');

    expect(callbackRes.status).toBe(401);
  });

  it('400s when code/state are missing entirely', async () => {
    const app = await loadAppWithFrontendUrl('http://localhost:5173/spacereserve/');
    const res = await request(app).get('/spacereserve/api/v1/auth/callback');
    expect(res.status).toBe(400);
  });
});
