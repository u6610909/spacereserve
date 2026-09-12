import { DateTime } from 'luxon';

import { Prisma, type Reservation, type Role } from '@prisma/client';

import { writeAuditLog } from '../../lib/audit';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';
import { lookupLostItems, type LostItemNotice } from '../../integrations/finderai';
import {
  sendReservationCancelledEmail,
  sendReservationConfirmedEmail,
  sendReservationInvitedEmail,
  sendReservationOverriddenEmail,
} from '../../integrations/acsEmail';

import type { CreateReservationInput } from './reservations.schema';

const MAX_DURATION_MS = 2 * 60 * 60 * 1000;
const MAX_ADVANCE_MS = 14 * 24 * 60 * 60 * 1000;
const CHECKIN_WINDOW_BEFORE_MS = 15 * 60 * 1000;

const BANGKOK_ZONE = 'Asia/Bangkok';
const BOOKING_WINDOW_START_HOUR = 9; // 9:00
const BOOKING_WINDOW_END_HOUR = 20; // 20:00 (2 ทุ่ม)

/** Campus opening hours, not a UTC one — the room list's time-slot picker
 * only ever offers 9:00–20:00 Bangkok, so this is a server-side backstop
 * against a request built by hand or an old client. */
function assertWithinBookingHours(startTime: Date, endTime: Date): void {
  const start = DateTime.fromJSDate(startTime, { zone: BANGKOK_ZONE });
  const end = DateTime.fromJSDate(endTime, { zone: BANGKOK_ZONE });
  const windowStart = start.set({ hour: BOOKING_WINDOW_START_HOUR, minute: 0, second: 0, millisecond: 0 });
  const windowEnd = start.set({ hour: BOOKING_WINDOW_END_HOUR, minute: 0, second: 0, millisecond: 0 });

  if (!start.hasSame(end, 'day') || start < windowStart || end > windowEnd) {
    throw new BadRequestError('Reservations must fall between 09:00 and 20:00 (Bangkok time), same day');
  }
}

const reservationInclude = {
  room: true,
  organizer: true,
  attendees: { include: { user: true } },
} satisfies Prisma.ReservationInclude;

/** Organizer + every attendee's email — the one list every "this reservation
 * changed" notice goes to (confirm/cancel/override). An invite email is
 * different: it goes to just the one newly-added attendee, from addAttendee. */
function allRecipientEmails(reservation: ReservationWithRelations): string[] {
  return [reservation.organizer.email, ...reservation.attendees.map((a) => a.user.email)];
}

type ReservationWithRelations = Prisma.ReservationGetPayload<{ include: typeof reservationInclude }>;

function isStaffOrAdmin(role: Role): boolean {
  return role === 'STAFF' || role === 'ADMIN';
}

function assertCapacity(capacity: number, totalPeople: number): void {
  if (totalPeople > capacity) {
    throw new BadRequestError(`Attendee count (${totalPeople}) exceeds room capacity (${capacity})`);
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function createReservation(
  actorId: string,
  input: CreateReservationInput,
): Promise<ReservationWithRelations> {
  const { roomId, startTime, endTime, purpose, attendeeIds } = input;

  if (endTime <= startTime) throw new BadRequestError('endTime must be after startTime');
  if (startTime <= new Date()) throw new BadRequestError('Reservations must start in the future');
  if (endTime.getTime() - startTime.getTime() > MAX_DURATION_MS) {
    throw new BadRequestError('Reservations cannot be longer than 2 hours');
  }
  if (startTime.getTime() - Date.now() > MAX_ADVANCE_MS) {
    throw new BadRequestError('Reservations cannot be made more than 14 days in advance');
  }
  assertWithinBookingHours(startTime, endTime);

  const room = await getPrisma().room.findUnique({ where: { id: roomId } });
  if (!room) throw new NotFoundError('Room not found');
  // A known return date only blocks dates before it — a room down for a day
  // shouldn't take next week off the board too. No date (`outOfOrderUntil`
  // null) means "unknown when it's back", so every date stays blocked.
  if (room.status === 'OUT_OF_ORDER' && (!room.outOfOrderUntil || startTime < room.outOfOrderUntil)) {
    throw new ConflictError('Room is out of order');
  }

  const uniqueAttendeeIds = Array.from(new Set(attendeeIds)).filter((id) => id !== actorId);
  assertCapacity(room.capacity, 1 + uniqueAttendeeIds.length);

  if (uniqueAttendeeIds.length > 0) {
    const found = await getPrisma().user.count({ where: { id: { in: uniqueAttendeeIds } } });
    if (found !== uniqueAttendeeIds.length) throw new BadRequestError('One or more attendee ids do not exist');
  }

  const reservation = await getPrisma().$transaction(async (tx) => {
    const overlap = await tx.reservation.findFirst({
      where: {
        roomId,
        status: 'CONFIRMED',
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (overlap) throw new ConflictError('Room is already booked for an overlapping time');

    return tx.reservation.create({
      data: {
        roomId,
        organizerId: actorId,
        startTime,
        endTime,
        purpose,
        attendees:
          uniqueAttendeeIds.length > 0 ? { create: uniqueAttendeeIds.map((userId) => ({ userId })) } : undefined,
      },
      include: reservationInclude,
    });
  });

  await Promise.all(
    allRecipientEmails(reservation).map((to) =>
      sendReservationConfirmedEmail({ to, roomName: room.name, startTime, endTime }),
    ),
  );

  return reservation;
}

export async function listMine(actorId: string): Promise<ReservationWithRelations[]> {
  return getPrisma().reservation.findMany({
    where: { OR: [{ organizerId: actorId }, { attendees: { some: { userId: actorId } } }] },
    include: reservationInclude,
    orderBy: { startTime: 'asc' },
  });
}

export async function getReservationById(
  id: string,
  actorId: string,
  actorRole: Role,
): Promise<ReservationWithRelations> {
  const reservation = await getPrisma().reservation.findUnique({ where: { id }, include: reservationInclude });
  if (!reservation) throw new NotFoundError('Reservation not found');

  const isOrganizer = reservation.organizerId === actorId;
  const isAttendee = reservation.attendees.some((a) => a.userId === actorId);
  if (!isOrganizer && !isAttendee && !isStaffOrAdmin(actorRole)) {
    throw new ForbiddenError('Only the organizer, an attendee, or staff can view this reservation');
  }
  return reservation;
}

export async function cancelReservation(actorId: string, actorRole: Role, id: string): Promise<Reservation> {
  const reservation = await getPrisma().reservation.findUnique({ where: { id }, include: reservationInclude });
  if (!reservation) throw new NotFoundError('Reservation not found');

  const isOrganizer = reservation.organizerId === actorId;
  if (!isOrganizer && !isStaffOrAdmin(actorRole)) {
    throw new ForbiddenError('Only the organizer or staff can cancel this reservation');
  }
  if (reservation.status !== 'CONFIRMED') throw new ConflictError('Reservation is not active');

  const updated = await getPrisma().reservation.update({ where: { id }, data: { status: 'CANCELLED' } });

  if (isStaffOrAdmin(actorRole)) {
    await writeAuditLog({
      actorId,
      action: 'RESERVATION_CANCELLED',
      entity: 'Reservation',
      entityId: id,
      metadata: { byOrganizer: isOrganizer },
    });
  }

  await Promise.all(
    allRecipientEmails(reservation).map((to) =>
      sendReservationCancelledEmail({
        to,
        roomName: reservation.room.name,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
      }),
    ),
  );

  return updated;
}

/** Route-gated to STAFF/ADMIN only — see reservations.routes.ts. */
export async function overrideReservation(actorId: string, id: string): Promise<Reservation> {
  const reservation = await getPrisma().reservation.findUnique({ where: { id }, include: reservationInclude });
  if (!reservation) throw new NotFoundError('Reservation not found');
  if (reservation.status !== 'CONFIRMED') throw new ConflictError('Reservation is not active');

  const updated = await getPrisma().reservation.update({ where: { id }, data: { status: 'OVERRIDDEN' } });

  await writeAuditLog({ actorId, action: 'RESERVATION_OVERRIDDEN', entity: 'Reservation', entityId: id });

  await Promise.all(
    allRecipientEmails(reservation).map((to) =>
      sendReservationOverriddenEmail({
        to,
        roomName: reservation.room.name,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
      }),
    ),
  );

  return updated;
}

export async function addAttendee(actorId: string, reservationId: string, userId: string): Promise<void> {
  const reservation = await getPrisma().reservation.findUnique({
    where: { id: reservationId },
    include: reservationInclude,
  });
  if (!reservation) throw new NotFoundError('Reservation not found');
  if (reservation.organizerId !== actorId) throw new ForbiddenError('Only the organizer can manage attendees');
  if (reservation.status !== 'CONFIRMED') throw new ConflictError('Reservation is not active');

  const user = await getPrisma().user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  assertCapacity(reservation.room.capacity, 1 + reservation.attendees.length + 1);

  try {
    await getPrisma().reservationAttendee.create({ data: { reservationId, userId } });
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new ConflictError('User is already invited');
    throw err;
  }

  await sendReservationInvitedEmail({
    to: user.email,
    organizerName: reservation.organizer.name,
    roomName: reservation.room.name,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
  });
}

export async function removeAttendee(actorId: string, reservationId: string, userId: string): Promise<void> {
  const reservation = await getPrisma().reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw new NotFoundError('Reservation not found');
  if (reservation.organizerId !== actorId) throw new ForbiddenError('Only the organizer can manage attendees');

  await getPrisma().reservationAttendee.deleteMany({ where: { reservationId, userId } });
}

export interface CheckInResult {
  reservation: Reservation;
  lostItemNotice: LostItemNotice[] | null;
}

/**
 * Window is 15 minutes before `startTime` through `endTime` — the "future
 * only" rule governs *creation*, not check-in (Settled design decisions).
 */
export async function checkIn(actorId: string, id: string): Promise<CheckInResult> {
  const reservation = await getPrisma().reservation.findUnique({ where: { id }, include: { room: true } });
  if (!reservation) throw new NotFoundError('Reservation not found');
  if (reservation.organizerId !== actorId) throw new ForbiddenError('Only the organizer can check in');
  if (reservation.status !== 'CONFIRMED') throw new ConflictError('Reservation is not active');

  const now = new Date();
  const windowStart = new Date(reservation.startTime.getTime() - CHECKIN_WINDOW_BEFORE_MS);
  if (now < windowStart || now > reservation.endTime) {
    throw new ConflictError('Check-in window is 15 minutes before start until the reservation ends');
  }

  // FinderAI's `location` param is their free-text room name, not our internal
  // id — see docs/peer-api.md.
  const lostItemNotice = await lookupLostItems(reservation.room.name);
  return { reservation, lostItemNotice };
}
