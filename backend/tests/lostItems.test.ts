import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { config } from '../src/config';
import { disconnectPrisma, getPrisma } from '../src/lib/prisma';

import { buildTestApp, resetDb } from './helpers/testApp';

import type { Express } from 'express';

let app: Express;

async function tokenFor(role: 'STUDENT' | 'STAFF' | 'ADMIN'): Promise<string> {
  const res = await request(app)
    .post(`${config.basePath}/auth/dev-login`)
    .send({ email: `${role.toLowerCase()}@lostitems.test`, role });
  return (res.body as { token: string }).token;
}

beforeAll(async () => {
  app = await buildTestApp();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('GET /lost-items', () => {
  it('unauthenticated requests are rejected', async () => {
    const res = await request(app).get(`${config.basePath}/lost-items`);
    expect(res.status).toBe(401);
  });

  it('any authenticated role gets an empty list when there is nothing to report', async () => {
    const token = await tokenFor('STUDENT');
    await getPrisma().room.createMany({
      data: [
        { name: 'Lost Items Fanout Room 1', building: 'B', capacity: 4 },
        { name: 'Lost Items Fanout Room 2', building: 'B', capacity: 4 },
      ],
    });

    const res = await request(app).get(`${config.basePath}/lost-items`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // TEST_SECRETS leaves the FinderAI key blank, so every room's lookup
    // hits the mock client (always []) — proving the fan-out-across-rooms
    // path runs cleanly with zero rooms actually reporting anything.
    expect((res.body as { items: unknown[] }).items).toEqual([]);
  });
});
