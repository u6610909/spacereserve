import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { config } from '../src/config';
import { disconnectPrisma, getPrisma } from '../src/lib/prisma';

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

  it('reuses an existing user (e.g. seeded) whose adObjectId is not the dev-login synthetic one', async () => {
    // Regression: dev-login used to upsert where {adObjectId: `dev:${email}`}.
    // A seeded/real-AD user has a DIFFERENT adObjectId (e.g. seed.ts uses
    // 'seed-staff-oid'), so that lookup missed and fell through to create(),
    // which then hit the unique constraint on email and 500'd.
    const seeded = await getPrisma().user.create({
      data: { adObjectId: 'seed-staff-oid', email: 'existing@test.dev', name: 'Seeded Name', role: 'STUDENT' },
    });

    const res = await request(app)
      .post(`${config.basePath}/auth/dev-login`)
      .send({ email: 'existing@test.dev', name: 'Updated Name', role: 'STAFF' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: seeded.id, name: 'Updated Name', role: 'STAFF' });

    const stored = await getPrisma().user.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(stored.adObjectId).toBe('seed-staff-oid');
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

describe('POST /auth/logout', () => {
  it('clears the session cookie and is idempotent (no auth required)', async () => {
    const agent = request.agent(app);
    await agent.post(`${config.basePath}/auth/dev-login`).send({ email: 'logout@test.dev' });

    const res = await agent.post(`${config.basePath}/auth/logout`);
    expect(res.status).toBe(204);

    // The session cookie no longer works for an auth-requiring route.
    const me = await agent.get(`${config.basePath}/auth/me`);
    expect(me.status).toBe(401);

    // Calling it again with no session at all doesn't error.
    const again = await request(app).post(`${config.basePath}/auth/logout`);
    expect(again.status).toBe(204);
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
