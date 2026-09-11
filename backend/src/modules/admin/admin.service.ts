import { getPrisma } from '../../lib/prisma';

import type { AuditLog, Room, User } from '@prisma/client';
import type { Role } from '@prisma/client';

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

export interface SystemOverview {
  usersByRole: Record<Role, number>;
  rooms: { available: number; outOfOrder: number };
  reservations: { upcoming: number };
  apiKeys: { name: string; lastUsedAt: string | null }[];
}

/**
 * A single "is this system alive" snapshot for the dashboard landing view —
 * counts only, nothing here is a raw record dump (that's what audit-logs and
 * the room/reservation list endpoints are for). `apiKeys` never returns
 * `keyHash` — peer API keys are shown only as name + last-used, matching how
 * `requireApiKey` treats the raw value (never logged or exposed) elsewhere.
 */
export async function getSystemOverview(): Promise<SystemOverview> {
  const prisma = getPrisma();
  const [usersByRoleRaw, roomsByStatusRaw, upcomingReservations, apiKeys] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.room.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.reservation.count({
      where: { status: { in: ['CONFIRMED', 'OVERRIDDEN'] }, startTime: { gt: new Date() } },
    }),
    prisma.apiKey.findMany({ select: { name: true, lastUsedAt: true }, orderBy: { name: 'asc' } }),
  ]);

  const usersByRole = { STUDENT: 0, STAFF: 0, ADMIN: 0 } as Record<Role, number>;
  for (const row of usersByRoleRaw) usersByRole[row.role] = row._count._all;

  const roomsByStatus = { AVAILABLE: 0, OUT_OF_ORDER: 0 };
  for (const row of roomsByStatusRaw) roomsByStatus[row.status] = row._count._all;

  return {
    usersByRole,
    rooms: { available: roomsByStatus.AVAILABLE, outOfOrder: roomsByStatus.OUT_OF_ORDER },
    reservations: { upcoming: upcomingReservations },
    apiKeys: apiKeys.map((k) => ({ name: k.name, lastUsedAt: k.lastUsedAt?.toISOString() ?? null })),
  };
}
