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
      apiKeys: { name: string; createdAt: string; lastUsedAt: string | null }[];
    };
    expect(body.usersByRole.STAFF).toBeGreaterThanOrEqual(1);
    expect(body.usersByRole.ADMIN).toBeGreaterThanOrEqual(1);
    expect(body.rooms.outOfOrder).toBeGreaterThanOrEqual(1);
    expect(body.reservations.upcoming).toBeGreaterThanOrEqual(1);
    const testPeer = body.apiKeys.find((k) => k.name === 'TestPeer');
    expect(testPeer?.lastUsedAt).toBeNull();
    expect(testPeer?.createdAt).toEqual(expect.any(String));
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

describe('DELETE /admin/peer-keys/:id', () => {
  it('STUDENT/STAFF cannot delete a key', async () => {
    const issued = await getPrisma().apiKey.create({ data: { name: 'ToDelete', keyHash: 'deadbeef' } });
    const student = await loginAs('peerkey-del-student@admin.test', 'STUDENT');

    const res = await request(app)
      .delete(`${config.basePath}/admin/peer-keys/${issued.id}`)
      .set('Authorization', `Bearer ${student}`);
    expect(res.status).toBe(403);
  });

  it('ADMIN can revoke a peer key, and it disappears from the overview', async () => {
    const admin = await loginAs('peerkey-del-admin-2@admin.test', 'ADMIN');
    const issued = await getPrisma().apiKey.create({ data: { name: 'RevokeMe', keyHash: 'cafebabe' } });

    const del = await request(app)
      .delete(`${config.basePath}/admin/peer-keys/${issued.id}`)
      .set('Authorization', `Bearer ${admin}`);
    expect(del.status).toBe(204);

    const overview = await request(app)
      .get(`${config.basePath}/admin/stats/overview`)
      .set('Authorization', `Bearer ${admin}`);
    const names = (overview.body as { apiKeys: { name: string }[] }).apiKeys.map((k) => k.name);
    expect(names).not.toContain('RevokeMe');
  });

  it('404s for a key that does not exist', async () => {
    const admin = await loginAs('peerkey-del-admin-3@admin.test', 'ADMIN');
    const res = await request(app)
      .delete(`${config.basePath}/admin/peer-keys/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(404);
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

  it('ADMIN can reveal the full raw key; STUDENT cannot', async () => {
    const admin = await loginAs('peerint-reveal-admin@admin.test', 'ADMIN');
    const student = await loginAs('peerint-reveal-student@admin.test', 'STUDENT');

    const created = await request(app)
      .post(`${config.basePath}/admin/peer-integrations`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'RevealTeam', baseUrl: 'https://reveal.example.com/api', apiKey: 'reveal_secret_abcdef1234' });
    const id = (created.body as { peerIntegration: { id: string } }).peerIntegration.id;

    const asStudent = await request(app)
      .get(`${config.basePath}/admin/peer-integrations/${id}/reveal`)
      .set('Authorization', `Bearer ${student}`);
    expect(asStudent.status).toBe(403);

    const asAdmin = await request(app)
      .get(`${config.basePath}/admin/peer-integrations/${id}/reveal`)
      .set('Authorization', `Bearer ${admin}`);
    expect(asAdmin.status).toBe(200);
    expect((asAdmin.body as { apiKey: string }).apiKey).toBe('reveal_secret_abcdef1234');
  });

  it('404s revealing a peer integration that does not exist', async () => {
    const admin = await loginAs('peerint-reveal-admin-2@admin.test', 'ADMIN');
    const res = await request(app)
      .get(`${config.basePath}/admin/peer-integrations/00000000-0000-0000-0000-000000000000/reveal`)
      .set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /admin/reservations', () => {
  it('STUDENT/STAFF are rejected', async () => {
    const student = await loginAs('resq-student@admin.test', 'STUDENT');
    const res = await request(app)
      .get(`${config.basePath}/admin/reservations`)
      .set('Authorization', `Bearer ${student}`);
    expect(res.status).toBe(403);
  });

  it('finds a reservation by organizer, attendee, or room, with headcount', async () => {
    const admin = await loginAs('resq-admin@admin.test', 'ADMIN');
    const room = await getPrisma().room.create({
      data: { name: 'Search Room', code: 'SR-1', building: 'B', capacity: 4 },
    });
    const organizer = await getPrisma().user.create({
      data: { adObjectId: 'resq-organizer', email: 'organizer@resq.test', name: 'Ada Organizer' },
    });
    const attendee = await getPrisma().user.create({
      data: { adObjectId: 'resq-attendee', email: 'attendee@resq.test', name: 'Bo Attendee' },
    });
    const reservation = await getPrisma().reservation.create({
      data: {
        roomId: room.id,
        organizerId: organizer.id,
        startTime: new Date('2026-02-01T10:00:00Z'),
        endTime: new Date('2026-02-01T11:00:00Z'),
      },
    });
    await getPrisma().reservationAttendee.create({
      data: { reservationId: reservation.id, userId: attendee.id },
    });

    for (const q of ['Ada Organizer', 'Bo Attendee', 'Search Room', 'SR-1']) {
      const res = await request(app)
        .get(`${config.basePath}/admin/reservations`)
        .query({ q })
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(200);
      const body = res.body as { reservations: { id: string; headcount: number }[] };
      expect(body.reservations.find((r) => r.id === reservation.id)).toMatchObject({ headcount: 2 });
    }

    const noMatch = await request(app)
      .get(`${config.basePath}/admin/reservations`)
      .query({ q: 'nobody-matches-this' })
      .set('Authorization', `Bearer ${admin}`);
    expect((noMatch.body as { reservations: unknown[] }).reservations).toHaveLength(0);
  });

  it('filters by time range', async () => {
    const admin = await loginAs('resq-admin-2@admin.test', 'ADMIN');
    const room = await getPrisma().room.create({ data: { name: 'Range Room', building: 'B', capacity: 4 } });
    const organizer = await getPrisma().user.create({
      data: { adObjectId: 'resq-range-organizer', email: 'range@resq.test', name: 'Range Organizer' },
    });
    await getPrisma().reservation.create({
      data: {
        roomId: room.id,
        organizerId: organizer.id,
        startTime: new Date('2026-03-01T10:00:00Z'),
        endTime: new Date('2026-03-01T11:00:00Z'),
      },
    });

    const inRange = await request(app)
      .get(`${config.basePath}/admin/reservations`)
      .query({ from: '2026-03-01T00:00:00Z', to: '2026-03-02T00:00:00Z' })
      .set('Authorization', `Bearer ${admin}`);
    expect((inRange.body as { reservations: unknown[] }).reservations.length).toBeGreaterThanOrEqual(1);

    const outOfRange = await request(app)
      .get(`${config.basePath}/admin/reservations`)
      .query({ from: '2026-04-01T00:00:00Z' })
      .set('Authorization', `Bearer ${admin}`);
    expect((outOfRange.body as { reservations: unknown[] }).reservations).toHaveLength(0);
  });
});
