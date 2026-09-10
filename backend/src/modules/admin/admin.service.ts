import { getPrisma } from '../../lib/prisma';

import type { AuditLog, Room, User } from '@prisma/client';

export async function listAuditLogs(limit: number): Promise<(AuditLog & { actor: User | null })[]> {
  return getPrisma().auditLog.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: { actor: true },
  });
}

interface RoomUtilization {
  roomId: string;
  name: string;
  building: string;
  reservationCount: number;
  totalBookedHours: number;
}

export interface UtilizationStats {
  rooms: RoomUtilization[];
  totals: {
    totalRooms: number;
    totalReservations: number;
    totalBookedHours: number;
  };
}

function hoursBetween(startTime: Date, endTime: Date): number {
  return (endTime.getTime() - startTime.getTime()) / (60 * 60 * 1000);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Counts CONFIRMED and OVERRIDDEN reservations (a room was genuinely occupied) — not CANCELLED. */
export async function getUtilizationStats(): Promise<UtilizationStats> {
  const rooms: (Room & { reservations: { startTime: Date; endTime: Date }[] })[] = await getPrisma().room.findMany({
    include: {
      reservations: {
        where: { status: { in: ['CONFIRMED', 'OVERRIDDEN'] } },
        select: { startTime: true, endTime: true },
      },
    },
  });

  const perRoom = rooms.map((room) => ({
    roomId: room.id,
    name: room.name,
    building: room.building,
    reservationCount: room.reservations.length,
    totalBookedHours: round2(room.reservations.reduce((sum, r) => sum + hoursBetween(r.startTime, r.endTime), 0)),
  }));

  return {
    rooms: perRoom,
    totals: {
      totalRooms: perRoom.length,
      totalReservations: perRoom.reduce((sum, r) => sum + r.reservationCount, 0),
      totalBookedHours: round2(perRoom.reduce((sum, r) => sum + r.totalBookedHours, 0)),
    },
  };
}
