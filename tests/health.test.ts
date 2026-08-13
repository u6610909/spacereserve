import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { config } from '../src/config';
import { resetHealthCache } from '../src/modules/health/health.service';

const app = createApp();

describe('GET /health', () => {
  beforeEach(() => {
    resetHealthCache();
  });

  it('returns 200 with the health report shape', async () => {
    const res = await request(app).get(`${config.basePath}/health`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      db: 'not_configured', // real probe lands in Phase 2
      keyVault: 'not_configured', // real probe lands in Phase 3
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
