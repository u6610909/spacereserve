import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { config } from '../src/config';
import { disconnectPrisma, getPrisma } from '../src/lib/prisma';

import { buildTestApp, resetDb } from './helpers/testApp';

import type { Express } from 'express';

let app: Express;
let token: string;

beforeAll(async () => {
  app = await buildTestApp();
});

beforeEach(async () => {
  await resetDb();
  const login = await request(app).post(`${config.basePath}/auth/dev-login`).send({ email: 'search@test.dev' });
  token = (login.body as { token: string }).token;
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('POST /search/natural', () => {
  it('401s without a token', async () => {
    const res = await request(app).post(`${config.basePath}/search/natural`).send({ query: 'a room' });
    expect(res.status).toBe(401);
  });

  it('degrades to keyword search when Gemini is not configured (no API key in test mode)', async () => {
    await getPrisma().room.createMany({
      data: [
        { name: 'Music Room', building: 'SC', capacity: 2, amenities: ['piano'] },
        { name: 'Lecture Hall', building: 'CB', capacity: 100, amenities: ['projector'] },
      ],
    });

    const res = await request(app)
      .post(`${config.basePath}/search/natural`)
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'piano practice room' });

    expect(res.status).toBe(200);
    expect(res.body.degraded).toBe(true);
    const names = (res.body as { rooms: { name: string }[] }).rooms.map((r) => r.name);
    expect(names).toContain('Music Room');
  });

  it('rejects an empty query', async () => {
    const res = await request(app)
      .post(`${config.basePath}/search/natural`)
      .set('Authorization', `Bearer ${token}`)
      .send({ query: '' });
    expect(res.status).toBe(400);
  });

  it('rate-limits after 10 requests per minute', async () => {
    const requests = Array.from({ length: 11 }, () =>
      request(app).post(`${config.basePath}/search/natural`).set('Authorization', `Bearer ${token}`).send({ query: 'room' }),
    );
    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);
  });
});
