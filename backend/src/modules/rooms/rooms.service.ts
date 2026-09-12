import { DateTime } from 'luxon';

import { writeAuditLog } from '../../lib/audit';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';
import { deleteRoomImageFile, roomImagePublicUrl } from '../../lib/roomImages';

import type { CreateRoomInput, ListRoomsQuery, UpdateRoomInput } from './rooms.schema';
import type { Prisma, Room, RoomStatus } from '@prisma/client';

const BANGKOK_ZONE = 'Asia/Bangkok';

/** Calendar-day bounds in Asia/Bangkok, as UTC instants Prisma can filter on
 * directly. `dateStr` (YYYY-MM-DD) is a Bangkok calendar date, not a UTC one —
 * a room's "today" is the campus's today, not the server's. */
function dayBoundsBangkok(dateStr?: string): { start: Date; end: Date; date: string } {
  const day = dateStr ? DateTime.fromISO(dateStr, { zone: BANGKOK_ZONE }) : DateTime.now().setZone(BANGKOK_ZONE);
  if (!day.isValid) throw new BadRequestError('Invalid date');
  const start = day.startOf('day');
  const end = day.endOf('day');
  return { start: start.toJSDate(), end: end.toJSDate(), date: start.toISODate()! };
}

export async function listRooms(query: ListRoomsQuery): Promise<Room[]> {
  const where: Prisma.RoomWhereInput = {};

  if (query.capacity) where.capacity = { gte: query.capacity };
  if (query.building) where.building = query.building;
  if (query.amenities && query.amenities.length > 0) where.amenities = { hasEvery: query.amenities };

  if (query.availableFrom && query.availableTo) {
    where.reservations = {
      none: {
        status: 'CONFIRMED',
        startTime: { lt: query.availableTo },
        endTime: { gt: query.availableFrom },
      },
    };
  }

  return getPrisma().room.findMany({ where, orderBy: { name: 'asc' } });
}

export async function getRoomById(id: string): Promise<Room> {
  const room = await getPrisma().room.findUnique({ where: { id } });
  if (!room) throw new NotFoundError('Room not found');
  return room;
}

export async function createRoom(actorId: string, input: CreateRoomInput): Promise<Room> {
  const room = await getPrisma().room.create({ data: input });
  await writeAuditLog({ actorId, action: 'ROOM_CREATED', entity: 'Room', entityId: room.id, metadata: input });
  return room;
}

export async function updateRoom(actorId: string, id: string, input: UpdateRoomInput): Promise<Room> {
  await getRoomById(id);
  const room = await getPrisma().room.update({ where: { id }, data: input });
  await writeAuditLog({ actorId, action: 'ROOM_UPDATED', entity: 'Room', entityId: room.id, metadata: input });
  return room;
}

/**
 * `outOfOrderUntil` only takes effect when `status` is OUT_OF_ORDER — going
 * back to AVAILABLE always clears it, so a stale "back by" date can never
 * linger on a room that's actually fine again.
 */
export async function setRoomStatus(
  actorId: string,
  id: string,
  status: RoomStatus,
  outOfOrderUntil?: Date | null,
): Promise<Room> {
  await getRoomById(id);
  const room = await getPrisma().room.update({
    where: { id },
    data: { status, outOfOrderUntil: status === 'OUT_OF_ORDER' ? (outOfOrderUntil ?? null) : null },
  });
  await writeAuditLog({
    actorId,
    action: 'ROOM_STATUS_CHANGED',
    entity: 'Room',
    entityId: room.id,
    metadata: { status, outOfOrderUntil: room.outOfOrderUntil },
  });
  return room;
}

export async function deleteRoom(actorId: string, id: string): Promise<void> {
  const room = await getRoomById(id);

  const reservationCount = await getPrisma().reservation.count({ where: { roomId: id } });
  if (reservationCount > 0) {
    throw new ConflictError('Cannot delete a room that has reservations — mark it OUT_OF_ORDER instead');
  }

  await getPrisma().room.delete({ where: { id } });
  deleteRoomImageFile(room.imageUrl);
  await writeAuditLog({ actorId, action: 'ROOM_DELETED', entity: 'Room', entityId: id });
}

/** `file` is `Express.Multer.File` — typed loosely here to avoid a hard dependency on multer's types in the service layer. */
export async function setRoomImage(
  actorId: string,
  id: string,
  file: { filename: string },
): Promise<Room> {
  const existing = await getRoomById(id);
  const imageUrl = roomImagePublicUrl(file.filename);

  const room = await getPrisma().room.update({ where: { id }, data: { imageUrl } });
  deleteRoomImageFile(existing.imageUrl); // old file, now orphaned — remove after the DB write succeeds
  await writeAuditLog({ actorId, action: 'ROOM_IMAGE_UPDATED', entity: 'Room', entityId: id });
  return room;
}

export async function removeRoomImage(actorId: string, id: string): Promise<Room> {
  const existing = await getRoomById(id);
  const room = await getPrisma().room.update({ where: { id }, data: { imageUrl: null } });
  deleteRoomImageFile(existing.imageUrl);
  await writeAuditLog({ actorId, action: 'ROOM_IMAGE_REMOVED', entity: 'Room', entityId: id });
  return room;
}

export interface RoomBusyInterval {
  startTime: string;
  endTime: string;
}

export interface RoomAvailabilitySummary {
  roomId: string;
  busy: RoomBusyInterval[];
}

/**
 * One query for every room's busy intervals on a given day — the room
 * browse list needs this per-room, and fetching it per-card would be an
 * N+1. Rooms with zero bookings that day are simply absent from the result
 * (the frontend treats "not listed" as fully free).
 */
export async function getRoomsAvailability(dateStr?: string): Promise<{ date: string; rooms: RoomAvailabilitySummary[] }> {
  const { start, end, date } = dayBoundsBangkok(dateStr);

  const reservations = await getPrisma().reservation.findMany({
    where: {
      status: { in: ['CONFIRMED', 'OVERRIDDEN'] },
      startTime: { lt: end },
      endTime: { gt: start },
    },
    select: { roomId: true, startTime: true, endTime: true },
    orderBy: { startTime: 'asc' },
  });

  const byRoom = new Map<string, RoomBusyInterval[]>();
  for (const r of reservations) {
    const list = byRoom.get(r.roomId) ?? [];
    list.push({ startTime: r.startTime.toISOString(), endTime: r.endTime.toISOString() });
    byRoom.set(r.roomId, list);
  }

  return {
    date,
    rooms: Array.from(byRoom.entries()).map(([roomId, busy]) => ({ roomId, busy })),
  };
}

export interface RoomScheduleEntry {
  startTime: string;
  endTime: string;
  organizerName: string;
  attendeeNames: string[];
}

/**
 * Full "who's in this room today" view for the booking panel — names only
 * (no email), matching how much a student needs to see to pick a free slot,
 * not a contact list.
 */
export async function getRoomSchedule(
  roomId: string,
  dateStr?: string,
): Promise<{ date: string; bookings: RoomScheduleEntry[] }> {
  await getRoomById(roomId);
  const { start, end, date } = dayBoundsBangkok(dateStr);

  const reservations = await getPrisma().reservation.findMany({
    where: {
      roomId,
      status: { in: ['CONFIRMED', 'OVERRIDDEN'] },
      startTime: { lt: end },
      endTime: { gt: start },
    },
    include: { organizer: true, attendees: { include: { user: true } } },
    orderBy: { startTime: 'asc' },
  });

  return {
    date,
    bookings: reservations.map((r) => ({
      startTime: r.startTime.toISOString(),
      endTime: r.endTime.toISOString(),
      organizerName: r.organizer.name,
      attendeeNames: r.attendees.map((a) => a.user.name),
    })),
  };
}
