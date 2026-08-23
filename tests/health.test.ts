import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { config, resolveSecrets } from '../src/config';
import { disconnectPrisma } from '../src/lib/prisma';
import { resetHealthCache } from '../src/modules/health/health.service';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  // Mirrors real bootstrap order (src/index.ts): secrets resolve before the
  // app is assembled, so requireDatabaseUrl() sees the test DB connection.
  await resolveSecrets();
  app = createApp();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('GET /health', () => {
  beforeEach(() => {
    resetHealthCache();
  });

  it('returns 200 with the health report shape', async () => {
    const res = await request(app).get(`${config.basePath}/health`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      db: 'ok', // real SELECT 1 against the CI/local test database (Phase 2)
      keyVault: 'not_configured', // dev/test never contact the vault (Phase 3)
      version: expect.any(String),
      uptimeSeconds: expect.any(Number),
    });
  });

  it('is served under the /spacereserve prefix, not at the root', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(404);
  });
});

describe('error handling', () => {
  it('returns a structured 404 with a request id', async () => {
    const res = await request(app).get(`${config.basePath}/does-not-exist`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
