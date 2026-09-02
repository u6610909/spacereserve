import { writeAuditLog } from '../../lib/audit';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';
import { deleteRoomImageFile, roomImagePublicUrl } from '../../lib/roomImages';

import type { CreateRoomInput, ListRoomsQuery, UpdateRoomInput } from './rooms.schema';
import type { Prisma, Room, RoomStatus } from '@prisma/client';

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

export async function setRoomStatus(actorId: string, id: string, status: RoomStatus): Promise<Room> {
  await getRoomById(id);
  const room = await getPrisma().room.update({ where: { id }, data: { status } });
  await writeAuditLog({
    actorId,
    action: 'ROOM_STATUS_CHANGED',
    entity: 'Room',
    entityId: room.id,
    metadata: { status },
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
