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
  it('STUDENT and STAFF are rejected from both admin endpoints', async () => {
    const student = await loginAs('student@admin.test', 'STUDENT');
    const staff = await loginAs('staff@admin.test', 'STAFF');

    for (const token of [student, staff]) {
      const logs = await request(app).get(`${config.basePath}/admin/audit-logs`).set('Authorization', `Bearer ${token}`);
      expect(logs.status).toBe(403);

      const stats = await request(app)
        .get(`${config.basePath}/admin/stats/utilization`)
        .set('Authorization', `Bearer ${token}`);
      expect(stats.status).toBe(403);
    }
  });

  it('ADMIN can read both endpoints', async () => {
    const admin = await loginAs('admin@admin.test', 'ADMIN');

    const logs = await request(app).get(`${config.basePath}/admin/audit-logs`).set('Authorization', `Bearer ${admin}`);
    expect(logs.status).toBe(200);
    expect(logs.body).toHaveProperty('auditLogs');

    const stats = await request(app)
      .get(`${config.basePath}/admin/stats/utilization`)
      .set('Authorization', `Bearer ${admin}`);
    expect(stats.status).toBe(200);
    expect(stats.body).toHaveProperty('totals');
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
