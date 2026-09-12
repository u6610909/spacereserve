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
    .send({ email: `${role.toLowerCase()}@rooms.test`, role });
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

describe('rooms RBAC', () => {
  it('STUDENT can list and read rooms but not create one', async () => {
    const token = await tokenFor('STUDENT');

    const list = await request(app).get(`${config.basePath}/rooms`).set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);

    const create = await request(app)
      .post(`${config.basePath}/rooms`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'R-1', building: 'B', capacity: 4 });
    expect(create.status).toBe(403);
  });

  it('STAFF can create, update, and set status', async () => {
    const token = await tokenFor('STAFF');

    const create = await request(app)
      .post(`${config.basePath}/rooms`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'R-2', building: 'B', capacity: 4, amenities: ['projector'] });
    expect(create.status).toBe(201);
    const roomId = (create.body as { room: { id: string } }).room.id;

    const update = await request(app)
      .patch(`${config.basePath}/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ capacity: 8 });
    expect(update.status).toBe(200);
    expect((update.body as { room: { capacity: number } }).room.capacity).toBe(8);

    const status = await request(app)
      .patch(`${config.basePath}/rooms/${roomId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'OUT_OF_ORDER' });
    expect(status.status).toBe(200);
    expect((status.body as { room: { status: string } }).room.status).toBe('OUT_OF_ORDER');
  });

  it('accepts an outOfOrderUntil return date, and clears it when marked available again', async () => {
    const token = await tokenFor('STAFF');
    const room = await getPrisma().room.create({ data: { name: 'Return Date Room', building: 'B', capacity: 4 } });
    const returnDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const outOfOrder = await request(app)
      .patch(`${config.basePath}/rooms/${room.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'OUT_OF_ORDER', outOfOrderUntil: returnDate });
    expect(outOfOrder.status).toBe(200);
    const outOfOrderBody = outOfOrder.body as { room: { status: string; outOfOrderUntil: string | null } };
    expect(outOfOrderBody.room.status).toBe('OUT_OF_ORDER');
    expect(outOfOrderBody.room.outOfOrderUntil).toBe(returnDate);

    const backToAvailable = await request(app)
      .patch(`${config.basePath}/rooms/${room.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'AVAILABLE' });
    expect(backToAvailable.status).toBe(200);
    const availableBody = backToAvailable.body as { room: { status: string; outOfOrderUntil: string | null } };
    expect(availableBody.room.status).toBe('AVAILABLE');
    expect(availableBody.room.outOfOrderUntil).toBeNull();
  });

  it('ADMIN can delete a room with no reservations', async () => {
    const token = await tokenFor('ADMIN');
    const create = await request(app)
      .post(`${config.basePath}/rooms`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'R-3', building: 'B', capacity: 2 });
    const roomId = (create.body as { room: { id: string } }).room.id;

    const del = await request(app).delete(`${config.basePath}/rooms/${roomId}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);
  });

  it('unauthenticated requests are rejected', async () => {
    const res = await request(app).get(`${config.basePath}/rooms`);
    expect(res.status).toBe(401);
  });
});

describe('rooms filtering', () => {
  it('filters by capacity and excludes out-of-order rooms only when asked', async () => {
    const token = await tokenFor('STAFF');
    await getPrisma().room.createMany({
      data: [
        { name: 'Small', building: 'B', capacity: 2, amenities: [] },
        { name: 'Big', building: 'B', capacity: 20, amenities: [] },
        { name: 'Broken', building: 'B', capacity: 20, amenities: [], status: 'OUT_OF_ORDER' },
      ],
    });

    const res = await request(app)
      .get(`${config.basePath}/rooms?capacity=10`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const names = (res.body as { rooms: { name: string }[] }).rooms.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['Big', 'Broken']));
    expect(names).not.toContain('Small');
  });

  it('excludes rooms with an overlapping confirmed reservation from availableFrom/To', async () => {
    const token = await tokenFor('STAFF');
    const room = await getPrisma().room.create({ data: { name: 'Booked', building: 'B', capacity: 4 } });
    const organizer = await getPrisma().user.create({
      data: { adObjectId: 'rooms-test-organizer', email: 'organizer@rooms.test', name: 'Organizer' },
    });
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    await getPrisma().reservation.create({
      data: { roomId: room.id, organizerId: organizer.id, startTime: start, endTime: end },
    });

    const res = await request(app)
      .get(`${config.basePath}/rooms?availableFrom=${start.toISOString()}&availableTo=${end.toISOString()}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const names = (res.body as { rooms: { name: string }[] }).rooms.map((r) => r.name);
    expect(names).not.toContain('Booked');
  });
});

describe('GET /rooms/availability', () => {
  it('groups busy intervals by room for the given Bangkok calendar date', async () => {
    const token = await tokenFor('STUDENT');
    const busyRoom = await getPrisma().room.create({ data: { name: 'Busy Today', building: 'B', capacity: 4 } });
    const freeRoom = await getPrisma().room.create({ data: { name: 'Free Today', building: 'B', capacity: 4 } });
    const organizer = await getPrisma().user.create({
      data: { adObjectId: 'avail-organizer', email: 'avail@rooms.test', name: 'Avail Organizer' },
    });

    // 10:00-11:00 Bangkok on 2026-06-15 = 03:00-04:00 UTC.
    await getPrisma().reservation.create({
      data: {
        roomId: busyRoom.id,
        organizerId: organizer.id,
        startTime: new Date('2026-06-15T03:00:00.000Z'),
        endTime: new Date('2026-06-15T04:00:00.000Z'),
      },
    });

    const res = await request(app)
      .get(`${config.basePath}/rooms/availability?date=2026-06-15`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { date: string; rooms: { roomId: string; busy: { startTime: string; endTime: string }[] }[] };
    expect(body.date).toBe('2026-06-15');
    const busyEntry = body.rooms.find((r) => r.roomId === busyRoom.id);
    expect(busyEntry?.busy).toEqual([
      { startTime: '2026-06-15T03:00:00.000Z', endTime: '2026-06-15T04:00:00.000Z' },
    ]);
    expect(body.rooms.find((r) => r.roomId === freeRoom.id)).toBeUndefined();
  });

  it('rejects a malformed date', async () => {
    const token = await tokenFor('STUDENT');
    const res = await request(app)
      .get(`${config.basePath}/rooms/availability?date=not-a-date`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /rooms/:id/schedule', () => {
  it('lists that room\'s bookings for the day with organizer + attendee names, no email', async () => {
    const token = await tokenFor('STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Schedule Room', building: 'B', capacity: 4 } });
    const organizer = await getPrisma().user.create({
      data: { adObjectId: 'sched-organizer', email: 'sched-organizer@rooms.test', name: 'Sched Organizer' },
    });
    const attendee = await getPrisma().user.create({
      data: { adObjectId: 'sched-attendee', email: 'sched-attendee@rooms.test', name: 'Sched Attendee' },
    });
    const reservation = await getPrisma().reservation.create({
      data: {
        roomId: room.id,
        organizerId: organizer.id,
        startTime: new Date('2026-06-15T03:00:00.000Z'),
        endTime: new Date('2026-06-15T04:00:00.000Z'),
      },
    });
    await getPrisma().reservationAttendee.create({ data: { reservationId: reservation.id, userId: attendee.id } });

    const res = await request(app)
      .get(`${config.basePath}/rooms/${room.id}/schedule?date=2026-06-15`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as { date: string; bookings: { organizerName: string; attendeeNames: string[] }[] };
    expect(body.date).toBe('2026-06-15');
    expect(body.bookings).toEqual([{
      startTime: '2026-06-15T03:00:00.000Z',
      endTime: '2026-06-15T04:00:00.000Z',
      organizerName: 'Sched Organizer',
      attendeeNames: ['Sched Attendee'],
    }]);
    expect(JSON.stringify(res.body)).not.toContain('@rooms.test');
  });

  it('404s for a room that does not exist', async () => {
    const token = await tokenFor('STUDENT');
    const res = await request(app)
      .get(`${config.basePath}/rooms/00000000-0000-0000-0000-000000000000/schedule`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /rooms/:id/lost-items', () => {
  it('any authenticated role can check — not gated on booking or checking in', async () => {
    const token = await tokenFor('STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Lost Items Room', building: 'B', capacity: 4 } });

    const res = await request(app)
      .get(`${config.basePath}/rooms/${room.id}/lost-items`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // TEST_SECRETS leaves the FinderAI key blank on purpose, so this hits the
    // mock client (always []), not null — proving the real degrade-to-mock
    // path here too, not just at check-in.
    expect((res.body as { items: unknown[] }).items).toEqual([]);
  });

  it('404s for a room that does not exist', async () => {
    const token = await tokenFor('STUDENT');
    const res = await request(app)
      .get(`${config.basePath}/rooms/00000000-0000-0000-0000-000000000000/lost-items`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('unauthenticated requests are rejected', async () => {
    const room = await getPrisma().room.create({ data: { name: 'Lost Items Room 2', building: 'B', capacity: 4 } });
    const res = await request(app).get(`${config.basePath}/rooms/${room.id}/lost-items`);
    expect(res.status).toBe(401);
  });
});
