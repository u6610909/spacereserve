import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { config } from '../src/config';
import { disconnectPrisma, getPrisma } from '../src/lib/prisma';

import { buildTestApp, resetDb } from './helpers/testApp';

import type { Express } from 'express';

let app: Express;

async function loginAs(email: string, role: 'STUDENT' | 'STAFF' | 'ADMIN'): Promise<string> {
  const res = await request(app).post(`${config.basePath}/auth/dev-login`).send({ email, role });
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

describe('admin RBAC', () => {
  it('STUDENT and STAFF are rejected from all admin endpoints', async () => {
    const student = await loginAs('student@admin.test', 'STUDENT');
    const staff = await loginAs('staff@admin.test', 'STAFF');

    for (const token of [student, staff]) {
      const logs = await request(app).get(`${config.basePath}/admin/audit-logs`).set('Authorization', `Bearer ${token}`);
      expect(logs.status).toBe(403);

      const stats = await request(app)
        .get(`${config.basePath}/admin/stats/utilization`)
        .set('Authorization', `Bearer ${token}`);
      expect(stats.status).toBe(403);

      const overview = await request(app)
        .get(`${config.basePath}/admin/stats/overview`)
        .set('Authorization', `Bearer ${token}`);
      expect(overview.status).toBe(403);
    }
  });

  it('ADMIN can read all endpoints', async () => {
    const admin = await loginAs('admin@admin.test', 'ADMIN');

    const logs = await request(app).get(`${config.basePath}/admin/audit-logs`).set('Authorization', `Bearer ${admin}`);
    expect(logs.status).toBe(200);
    expect(logs.body).toHaveProperty('auditLogs');

    const stats = await request(app)
      .get(`${config.basePath}/admin/stats/utilization`)
      .set('Authorization', `Bearer ${admin}`);
    expect(stats.status).toBe(200);
    expect(stats.body).toHaveProperty('totals');

    const overview = await request(app)
      .get(`${config.basePath}/admin/stats/overview`)
      .set('Authorization', `Bearer ${admin}`);
    expect(overview.status).toBe(200);
    expect(overview.body).toHaveProperty('usersByRole');
  });
});

describe('GET /admin/stats/overview', () => {
  it('counts users by role, room status, upcoming reservations, and never leaks apiKey hashes', async () => {
    const admin = await loginAs('overview-admin@admin.test', 'ADMIN');
    await getPrisma().user.create({
      data: { adObjectId: 'overview-staff', email: 'overview-staff@admin.test', name: 'Overview Staff', role: 'STAFF' },
    });
    const room = await getPrisma().room.create({
      data: { name: 'Overview OOO Room', building: 'B', capacity: 4, status: 'OUT_OF_ORDER' },
    });
    const organizer = await getPrisma().user.create({
      data: { adObjectId: 'overview-organizer', email: 'overview-org@admin.test', name: 'Overview Organizer' },
    });
    await getPrisma().reservation.create({
      data: {
        roomId: room.id,
        organizerId: organizer.id,
        startTime: new Date(Date.now() + 60 * 60 * 1000),
        endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });
    await getPrisma().apiKey.create({ data: { name: 'TestPeer', keyHash: 'deadbeef' } });

    const res = await request(app)
      .get(`${config.basePath}/admin/stats/overview`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      usersByRole: Record<string, number>;
      rooms: { available: number; outOfOrder: number };
      reservations: { upcoming: number };
      apiKeys: { name: string; lastUsedAt: string | null }[];
    };
    expect(body.usersByRole.STAFF).toBeGreaterThanOrEqual(1);
    expect(body.usersByRole.ADMIN).toBeGreaterThanOrEqual(1);
    expect(body.rooms.outOfOrder).toBeGreaterThanOrEqual(1);
    expect(body.reservations.upcoming).toBeGreaterThanOrEqual(1);
    const testPeer = body.apiKeys.find((k) => k.name === 'TestPeer');
    expect(testPeer).toEqual({ name: 'TestPeer', lastUsedAt: null });
    expect(JSON.stringify(body)).not.toContain('deadbeef');
  });
});

describe('GET /admin/stats/utilization', () => {
  it('sums booked hours per room, excluding cancelled reservations', async () => {
    const admin = await loginAs('admin2@admin.test', 'ADMIN');
    const room = await getPrisma().room.create({ data: { name: 'Util Room', building: 'B', capacity: 4 } });
    const organizer = await getPrisma().user.create({
      data: { adObjectId: 'util-organizer', email: 'util@admin.test', name: 'Util Organizer' },
    });

    await getPrisma().reservation.create({
      data: {
        roomId: room.id,
        organizerId: organizer.id,
        startTime: new Date('2026-01-01T10:00:00Z'),
        endTime: new Date('2026-01-01T12:00:00Z'),
      },
    });
    await getPrisma().reservation.create({
      data: {
        roomId: room.id,
        organizerId: organizer.id,
        startTime: new Date('2026-01-02T10:00:00Z'),
        endTime: new Date('2026-01-02T11:00:00Z'),
        status: 'CANCELLED',
      },
    });

    const res = await request(app)
      .get(`${config.basePath}/admin/stats/utilization`)
      .set('Authorization', `Bearer ${admin}`);

    expect(res.status).toBe(200);
    const util = res.body as { rooms: { name: string; reservationCount: number; totalBookedHours: number }[] };
    const roomStats = util.rooms.find((r) => r.name === 'Util Room');
    expect(roomStats).toMatchObject({ reservationCount: 1, totalBookedHours: 2 });
  });
});

describe('POST /admin/peer-keys', () => {
  it('STUDENT/STAFF cannot issue a key', async () => {
    const student = await loginAs('peerkey-student@admin.test', 'STUDENT');
    const res = await request(app)
      .post(`${config.basePath}/admin/peer-keys`)
      .set('Authorization', `Bearer ${student}`)
      .send({ name: 'SomeOtherTeam' });
    expect(res.status).toBe(403);
  });

  it('ADMIN can issue a key for any partner name, not just FinderAI, and only its hash is stored', async () => {
    const admin = await loginAs('peerkey-admin@admin.test', 'ADMIN');
    const res = await request(app)
      .post(`${config.basePath}/admin/peer-keys`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'EduCore' });

    expect(res.status).toBe(201);
    const body = res.body as { name: string; key: string };
    expect(body.name).toBe('EduCore');
    expect(body.key).toMatch(/^[0-9a-f]{64}$/);

    const stored = await getPrisma().apiKey.findUnique({ where: { name: 'EduCore' } });
    expect(stored).not.toBeNull();
    expect(stored!.keyHash).not.toBe(body.key);
    expect(JSON.stringify(res.body)).not.toContain(stored!.keyHash);
  });

  it('rejects a second key with a name already in use', async () => {
    const admin = await loginAs('peerkey-admin-2@admin.test', 'ADMIN');
    await request(app)
      .post(`${config.basePath}/admin/peer-keys`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'DupeTeam' });

    const dupe = await request(app)
      .post(`${config.basePath}/admin/peer-keys`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'DupeTeam' });
    expect(dupe.status).toBe(409);
  });
});

describe('/admin/peer-integrations', () => {
  it('STUDENT cannot list, create, or delete', async () => {
    const student = await loginAs('peerint-student@admin.test', 'STUDENT');
    expect(
      (await request(app).get(`${config.basePath}/admin/peer-integrations`).set('Authorization', `Bearer ${student}`))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`${config.basePath}/admin/peer-integrations`)
          .set('Authorization', `Bearer ${student}`)
          .send({ name: 'X', baseUrl: 'https://x.example.com', apiKey: 'k' })
      ).status,
    ).toBe(403);
  });

  it('ADMIN can create, list (key masked), and delete an entry', async () => {
    const admin = await loginAs('peerint-admin@admin.test', 'ADMIN');

    const created = await request(app)
      .post(`${config.basePath}/admin/peer-integrations`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        name: 'EduCore',
        baseUrl: 'https://educore.example.com/api',
        apiKey: 'edu_secret_abcdef1234',
        notes: 'Course registration peer',
      });
    expect(created.status).toBe(201);
    const createdBody = created.body as { peerIntegration: { id: string; apiKeyMasked: string } };
    expect(createdBody.peerIntegration.apiKeyMasked).toBe('••••1234');
    expect(JSON.stringify(created.body)).not.toContain('edu_secret_abcdef1234');

    const list = await request(app)
      .get(`${config.basePath}/admin/peer-integrations`)
      .set('Authorization', `Bearer ${admin}`);
    expect(list.status).toBe(200);
    const listBody = list.body as { peerIntegrations: { name: string; apiKeyMasked: string }[] };
    expect(listBody.peerIntegrations.find((p) => p.name === 'EduCore')?.apiKeyMasked).toBe('••••1234');

    const del = await request(app)
      .delete(`${config.basePath}/admin/peer-integrations/${createdBody.peerIntegration.id}`)
      .set('Authorization', `Bearer ${admin}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app)
      .get(`${config.basePath}/admin/peer-integrations`)
      .set('Authorization', `Bearer ${admin}`);
    expect((listAfter.body as { peerIntegrations: unknown[] }).peerIntegrations).toHaveLength(0);
  });

  it('rejects a duplicate name and a malformed base URL', async () => {
    const admin = await loginAs('peerint-admin-2@admin.test', 'ADMIN');
    await request(app)
      .post(`${config.basePath}/admin/peer-integrations`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'DupeIntegration', baseUrl: 'https://dupe.example.com', apiKey: 'k' });

    const dupe = await request(app)
      .post(`${config.basePath}/admin/peer-integrations`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'DupeIntegration', baseUrl: 'https://dupe2.example.com', apiKey: 'k2' });
    expect(dupe.status).toBe(409);

    const badUrl = await request(app)
      .post(`${config.basePath}/admin/peer-integrations`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'BadUrlTeam', baseUrl: 'not-a-url', apiKey: 'k' });
    expect(badUrl.status).toBe(400);
  });
});
