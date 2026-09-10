import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { config } from '../src/config';
import { disconnectPrisma } from '../src/lib/prisma';

import { buildTestApp, resetDb } from './helpers/testApp';

import type { Express } from 'express';

let app: Express;
let token: string;

beforeAll(async () => {
  app = await buildTestApp();
});

beforeEach(async () => {
  await resetDb();
  const login = await request(app).post(`${config.basePath}/auth/dev-login`).send({ email: 'alice@users.test' });
  token = (login.body as { token: string }).token;
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('GET /users', () => {
  it('finds a user by exact email, without exposing role/adObjectId', async () => {
    const res = await request(app)
      .get(`${config.basePath}/users?email=alice@users.test`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0]).toMatchObject({ name: 'Dev User', email: 'alice@users.test' });
    expect(res.body.users[0]).not.toHaveProperty('role');
    expect(res.body.users[0]).not.toHaveProperty('adObjectId');
  });

  it('returns an empty array for no match, not a 404', async () => {
    const res = await request(app)
      .get(`${config.basePath}/users?email=nobody@users.test`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });

  it('400s on an invalid email', async () => {
    const res = await request(app)
      .get(`${config.basePath}/users?email=not-an-email`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('400s when email is missing', async () => {
    const res = await request(app).get(`${config.basePath}/users`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('401s without auth', async () => {
    const res = await request(app).get(`${config.basePath}/users?email=alice@users.test`);
    expect(res.status).toBe(401);
  });
});
