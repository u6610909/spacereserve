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
