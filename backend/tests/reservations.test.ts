import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '../src/config';
import { disconnectPrisma, getPrisma } from '../src/lib/prisma';

import { buildTestApp, resetDb } from './helpers/testApp';

import type { Express } from 'express';

// Mocked so notification recipients can be asserted directly, independent of
// whether ACS_CONNECTION_STRING is set (TEST_SECRETS leaves it blank on
// purpose — see config/index.ts — so the real integration always no-ops in
// tests).
vi.mock('../src/integrations/acsEmail', () => ({
  sendReservationConfirmedEmail: vi.fn(),
  sendReservationCancelledEmail: vi.fn(),
  sendReservationOverriddenEmail: vi.fn(),
  sendReservationInvitedEmail: vi.fn(),
}));

import * as acsEmail from '../src/integrations/acsEmail';

let app: Express;

async function loginAs(email: string, role: 'STUDENT' | 'STAFF' | 'ADMIN'): Promise<{ token: string; userId: string }> {
  const res = await request(app).post(`${config.basePath}/auth/dev-login`).send({ email, role });
  const body = res.body as { token: string; user: { id: string } };
  return { token: body.token, userId: body.user.id };
}

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

beforeAll(async () => {
  app = await buildTestApp();
});

// Reservations now must fall within 09:00–20:00 Asia/Bangkok — frozen here
// at 09:00 Bangkok so every hoursFromNow() offset below is deterministic
// regardless of the real time the suite happens to run at. Only Date is
// faked (not timers), so supertest's own async plumbing is untouched.
beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T02:00:00.000Z')); // 09:00 Bangkok (UTC+7)
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('POST /reservations — business rules', () => {
  it('rejects overlapping confirmed reservations in the same room', async () => {
    const organizer = await loginAs('organizer@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Overlap Room', building: 'B', capacity: 4 } });

    const first = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(3) });
    expect(first.status).toBe(201);

    const overlapping = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2.5), endTime: hoursFromNow(3.5) });
    expect(overlapping.status).toBe(409);
  });

  it('allows back-to-back (non-overlapping) reservations', async () => {
    const organizer = await loginAs('backtoback@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'BackToBack Room', building: 'B', capacity: 4 } });

    const first = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(3) });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(3), endTime: hoursFromNow(4) });
    expect(second.status).toBe(201);
  });

  it('rejects booking an OUT_OF_ORDER room', async () => {
    const organizer = await loginAs('outoforder@res.test', 'STUDENT');
    const room = await getPrisma().room.create({
      data: { name: 'Broken Room', building: 'B', capacity: 4, status: 'OUT_OF_ORDER' },
    });

    const res = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(3) });
    expect(res.status).toBe(409);
  });

  it('rejects organizer + attendees exceeding room capacity', async () => {
    const organizer = await loginAs('capacity@res.test', 'STUDENT');
    const attendee = await loginAs('capacity-attendee@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Tiny Room', building: 'B', capacity: 1 } });

    const res = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        roomId: room.id,
        startTime: hoursFromNow(2),
        endTime: hoursFromNow(3),
        attendeeIds: [attendee.userId],
      });
    expect(res.status).toBe(400);
  });

  it('allows a solo booking that fills the whole room capacity', async () => {
    const organizer = await loginAs('solo-fill@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Big Solo Room', building: 'B', capacity: 20 } });

    const res = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(3) });
    expect(res.status).toBe(201);
  });

  it('rejects a reservation in the past', async () => {
    const organizer = await loginAs('past@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Past Room', building: 'B', capacity: 4 } });

    const res = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(-2), endTime: hoursFromNow(-1) });
    expect(res.status).toBe(400);
  });

  it('rejects a reservation longer than 2 hours', async () => {
    const organizer = await loginAs('toolong@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Long Room', building: 'B', capacity: 4 } });

    const res = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(4.5) });
    expect(res.status).toBe(400);
  });

  it('allows exactly a 2-hour reservation', async () => {
    const organizer = await loginAs('exactly2h@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Exactly2h Room', building: 'B', capacity: 4 } });

    const res = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(4) });
    expect(res.status).toBe(201);
  });

  it('rejects a reservation starting before 09:00 Bangkok time', async () => {
    const organizer = await loginAs('tooearly@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Early Room', building: 'B', capacity: 4 } });

    // "now" is frozen at 09:00 Bangkok; tomorrow 08:00 Bangkok is 1am UTC.
    const start = new Date('2026-06-16T01:00:00.000Z');
    const end = new Date('2026-06-16T02:00:00.000Z');
    const res = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: start, endTime: end });
    expect(res.status).toBe(400);
  });

  it('rejects a reservation ending after 20:00 Bangkok time', async () => {
    const organizer = await loginAs('toolate@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Late Room', building: 'B', capacity: 4 } });

    // Tomorrow 19:30–20:30 Bangkok — crosses the 20:00 close.
    const start = new Date('2026-06-16T12:30:00.000Z');
    const end = new Date('2026-06-16T13:30:00.000Z');
    const res = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: start, endTime: end });
    expect(res.status).toBe(400);
  });

  it('allows a reservation right at the 09:00 open and 20:00 close edges', async () => {
    const organizer = await loginAs('edges@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Edges Room', building: 'B', capacity: 4 } });

    const openStart = new Date('2026-06-16T02:00:00.000Z'); // 09:00 Bangkok
    const openEnd = new Date('2026-06-16T03:00:00.000Z');
    const atOpen = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: openStart, endTime: openEnd });
    expect(atOpen.status).toBe(201);

    const closeStart = new Date('2026-06-16T12:00:00.000Z'); // 19:00 Bangkok
    const closeEnd = new Date('2026-06-16T13:00:00.000Z'); // 20:00 Bangkok
    const atClose = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: closeStart, endTime: closeEnd });
    expect(atClose.status).toBe(201);
  });

  it('rejects a reservation more than 14 days out', async () => {
    const organizer = await loginAs('faraway@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Faraway Room', building: 'B', capacity: 4 } });

    const res = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(15 * 24), endTime: hoursFromNow(15 * 24 + 1) });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /reservations/:id — cancel permissions', () => {
  it('lets the organizer cancel their own reservation', async () => {
    const organizer = await loginAs('cancel-organizer@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Cancel Room 1', building: 'B', capacity: 4 } });
    const created = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(3) });
    const id = (created.body as { reservation: { id: string } }).reservation.id;

    const res = await request(app)
      .delete(`${config.basePath}/reservations/${id}`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(res.status).toBe(204);
  });

  it('lets STAFF cancel someone else\'s reservation and writes an audit log', async () => {
    const organizer = await loginAs('cancel-organizer-2@res.test', 'STUDENT');
    const staff = await loginAs('cancel-staff@res.test', 'STAFF');
    const room = await getPrisma().room.create({ data: { name: 'Cancel Room 2', building: 'B', capacity: 4 } });
    const created = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(3) });
    const id = (created.body as { reservation: { id: string } }).reservation.id;

    const res = await request(app)
      .delete(`${config.basePath}/reservations/${id}`)
      .set('Authorization', `Bearer ${staff.token}`);
    expect(res.status).toBe(204);

    const logs = await getPrisma().auditLog.findMany({ where: { entityId: id, action: 'RESERVATION_CANCELLED' } });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBe(staff.userId);
  });

  it('rejects a random other STUDENT cancelling someone else\'s reservation', async () => {
    const organizer = await loginAs('cancel-organizer-3@res.test', 'STUDENT');
    const stranger = await loginAs('cancel-stranger@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Cancel Room 3', building: 'B', capacity: 4 } });
    const created = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(3) });
    const id = (created.body as { reservation: { id: string } }).reservation.id;

    const res = await request(app)
      .delete(`${config.basePath}/reservations/${id}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /reservations/:id/override', () => {
  it('rejects STUDENT and STAFF cannot use it — ADMIN/STAFF only', async () => {
    const organizer = await loginAs('override-organizer@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Override Room', building: 'B', capacity: 4 } });
    const created = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(3) });
    const id = (created.body as { reservation: { id: string } }).reservation.id;

    const asStudent = await request(app)
      .post(`${config.basePath}/reservations/${id}/override`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(asStudent.status).toBe(403);

    const admin = await loginAs('override-admin@res.test', 'ADMIN');
    const asAdmin = await request(app)
      .post(`${config.basePath}/reservations/${id}/override`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(asAdmin.status).toBe(200);
    expect((asAdmin.body as { reservation: { status: string } }).reservation.status).toBe('OVERRIDDEN');
  });
});

describe('POST /reservations/:id/check-in', () => {
  it('rejects check-in outside the window', async () => {
    const organizer = await loginAs('checkin-early@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'CheckIn Room', building: 'B', capacity: 4 } });
    const created = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(3) });
    const id = (created.body as { reservation: { id: string } }).reservation.id;

    const res = await request(app)
      .post(`${config.basePath}/reservations/${id}/check-in`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(res.status).toBe(409);
  });

  it('succeeds within the window and returns lostItemNotice', async () => {
    const organizer = await loginAs('checkin-ontime@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'CheckIn Room 2', building: 'B', capacity: 4 } });
    const start = new Date(Date.now() + 5 * 60 * 1000); // 5 min from now, inside the 15-min window
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const reservation = await getPrisma().reservation.create({
      data: { roomId: room.id, organizerId: organizer.userId, startTime: start, endTime: end },
    });

    const res = await request(app)
      .post(`${config.basePath}/reservations/${reservation.id}/check-in`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('lostItemNotice');
  });
});

describe('attendees', () => {
  it('organizer can add and remove attendees', async () => {
    const organizer = await loginAs('attendees-organizer@res.test', 'STUDENT');
    const attendee = await loginAs('attendees-guest@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Attendees Room', building: 'B', capacity: 4 } });
    const created = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(3) });
    const id = (created.body as { reservation: { id: string } }).reservation.id;

    const add = await request(app)
      .post(`${config.basePath}/reservations/${id}/attendees`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ userId: attendee.userId });
    expect(add.status).toBe(204);

    const remove = await request(app)
      .delete(`${config.basePath}/reservations/${id}/attendees/${attendee.userId}`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(remove.status).toBe(204);
  });

  it('non-organizer cannot add attendees', async () => {
    const organizer = await loginAs('attendees-organizer-2@res.test', 'STUDENT');
    const stranger = await loginAs('attendees-stranger@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Attendees Room 2', building: 'B', capacity: 4 } });
    const created = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ roomId: room.id, startTime: hoursFromNow(2), endTime: hoursFromNow(3) });
    const id = (created.body as { reservation: { id: string } }).reservation.id;

    const res = await request(app)
      .post(`${config.basePath}/reservations/${id}/attendees`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ userId: stranger.userId });
    expect(res.status).toBe(403);
  });
});

describe('reservation email notifications', () => {
  it('confirm/cancel/override notify the organizer AND every attendee, not just the organizer', async () => {
    const organizer = await loginAs('notify-organizer@res.test', 'STUDENT');
    const guest = await loginAs('notify-guest@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Notify Room', building: 'B', capacity: 4 } });

    const created = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        roomId: room.id,
        startTime: hoursFromNow(2),
        endTime: hoursFromNow(3),
        attendeeIds: [guest.userId],
      });
    expect(created.status).toBe(201);
    const id = (created.body as { reservation: { id: string } }).reservation.id;

    const confirmedTo = vi.mocked(acsEmail.sendReservationConfirmedEmail).mock.calls.map((c) => c[0].to);
    expect(confirmedTo).toEqual(
      expect.arrayContaining(['notify-organizer@res.test', 'notify-guest@res.test']),
    );
    expect(confirmedTo).toHaveLength(2);

    const admin = await loginAs('notify-admin@res.test', 'ADMIN');
    vi.clearAllMocks();
    const overridden = await request(app)
      .post(`${config.basePath}/reservations/${id}/override`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(overridden.status).toBe(200);
    const overriddenTo = vi.mocked(acsEmail.sendReservationOverriddenEmail).mock.calls.map((c) => c[0].to);
    expect(overriddenTo).toEqual(
      expect.arrayContaining(['notify-organizer@res.test', 'notify-guest@res.test']),
    );
    expect(overriddenTo).toHaveLength(2);
  });

  it('cancel notifies the organizer AND every attendee', async () => {
    const organizer = await loginAs('notify-cancel-organizer@res.test', 'STUDENT');
    const guest = await loginAs('notify-cancel-guest@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Notify Cancel Room', building: 'B', capacity: 4 } });

    const created = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        roomId: room.id,
        startTime: hoursFromNow(2),
        endTime: hoursFromNow(3),
        attendeeIds: [guest.userId],
      });
    const id = (created.body as { reservation: { id: string } }).reservation.id;
    vi.clearAllMocks();

    const cancelled = await request(app)
      .delete(`${config.basePath}/reservations/${id}`)
      .set('Authorization', `Bearer ${organizer.token}`);
    expect(cancelled.status).toBe(204);

    const cancelledTo = vi.mocked(acsEmail.sendReservationCancelledEmail).mock.calls.map((c) => c[0].to);
    expect(cancelledTo).toEqual(
      expect.arrayContaining(['notify-cancel-organizer@res.test', 'notify-cancel-guest@res.test']),
    );
    expect(cancelledTo).toHaveLength(2);
  });

  it('adding an attendee later emails only that attendee, not the organizer or other attendees', async () => {
    const organizer = await loginAs('notify-invite-organizer@res.test', 'STUDENT');
    const already = await loginAs('notify-invite-already@res.test', 'STUDENT');
    const newGuest = await loginAs('notify-invite-newguest@res.test', 'STUDENT');
    const room = await getPrisma().room.create({ data: { name: 'Notify Invite Room', building: 'B', capacity: 5 } });

    const created = await request(app)
      .post(`${config.basePath}/reservations`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        roomId: room.id,
        startTime: hoursFromNow(2),
        endTime: hoursFromNow(3),
        attendeeIds: [already.userId],
      });
    const id = (created.body as { reservation: { id: string } }).reservation.id;
    vi.clearAllMocks();

    const invited = await request(app)
      .post(`${config.basePath}/reservations/${id}/attendees`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ userId: newGuest.userId });
    expect(invited.status).toBe(204);

    expect(acsEmail.sendReservationInvitedEmail).toHaveBeenCalledTimes(1);
    expect(acsEmail.sendReservationInvitedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'notify-invite-newguest@res.test' }),
    );
    expect(acsEmail.sendReservationConfirmedEmail).not.toHaveBeenCalled();
  });
});
