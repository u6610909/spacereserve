import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { config } from '../src/config';
import { disconnectPrisma } from '../src/lib/prisma';

import { buildTestApp, resetDb } from './helpers/testApp';

import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  app = await buildTestApp();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('POST /auth/dev-login', () => {
  it('issues a token and upserts a user with the requested role', async () => {
    const res = await request(app)
      .post(`${config.basePath}/auth/dev-login`)
      .send({ email: 'staff@test.dev', name: 'Test Staff', role: 'STAFF' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'staff@test.dev', role: 'STAFF' });
  });

  it('defaults role to STUDENT when omitted', async () => {
    const res = await request(app).post(`${config.basePath}/auth/dev-login`).send({ email: 'student@test.dev' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'STUDENT' });
  });

  it('rejects an invalid email with a validation error', async () => {
    const res = await request(app).post(`${config.basePath}/auth/dev-login`).send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /auth/me', () => {
  it('returns the current user for a valid token', async () => {
    const login = await request(app)
      .post(`${config.basePath}/auth/dev-login`)
      .send({ email: 'me@test.dev', name: 'Me', role: 'ADMIN' });
    const { token } = login.body as { token: string };

    const res = await request(app).get(`${config.basePath}/auth/me`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'me@test.dev', role: 'ADMIN' });
  });

  it('401s without a token', async () => {
    const res = await request(app).get(`${config.basePath}/auth/me`);
    expect(res.status).toBe(401);
  });

  it('401s with a garbage token', async () => {
    const res = await request(app).get(`${config.basePath}/auth/me`).set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  it('reissues a token for the same user while the old one is still valid', async () => {
    const login = await request(app)
      .post(`${config.basePath}/auth/dev-login`)
      .send({ email: 'refresh@test.dev' });
    const { token } = login.body as { token: string };

    const res = await request(app).post(`${config.basePath}/auth/refresh`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'refresh@test.dev' });
  });
});
