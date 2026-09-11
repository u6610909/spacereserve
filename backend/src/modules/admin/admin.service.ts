import { randomBytes } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { hashApiKey } from '../../lib/apiKey';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';

import type { CreatePeerIntegrationInput, ReservationSearchQuery } from './admin.schema';
import type { AuditLog, PeerIntegration, Room, User } from '@prisma/client';
import type { Role } from '@prisma/client';

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

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
  apiKeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[];
}

/**
 * A single "is this system alive" snapshot for the dashboard landing view —
 * counts only, nothing here is a raw record dump (that's what audit-logs and
 * the room/reservation list endpoints are for). `apiKeys` never returns
 * `keyHash` — peer API keys are shown only as name + issued/last-used dates,
 * matching how `requireApiKey` treats the raw value (never logged or exposed)
 * elsewhere. Deleting one (see `deletePeerApiKey`) means this list is the
 * *active* set, not necessarily the full issuance history any more.
 */
export async function getSystemOverview(): Promise<SystemOverview> {
  const prisma = getPrisma();
  const [usersByRoleRaw, roomsByStatusRaw, upcomingReservations, apiKeys] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.room.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.reservation.count({
      where: { status: { in: ['CONFIRMED', 'OVERRIDDEN'] }, startTime: { gt: new Date() } },
    }),
    prisma.apiKey.findMany({
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const usersByRole = { STUDENT: 0, STAFF: 0, ADMIN: 0 } as Record<Role, number>;
  for (const row of usersByRoleRaw) usersByRole[row.role] = row._count._all;

  const roomsByStatus = { AVAILABLE: 0, OUT_OF_ORDER: 0 };
  for (const row of roomsByStatusRaw) roomsByStatus[row.status] = row._count._all;

  return {
    usersByRole,
    rooms: { available: roomsByStatus.AVAILABLE, outOfOrder: roomsByStatus.OUT_OF_ORDER },
    reservations: { upcoming: upcomingReservations },
    apiKeys: apiKeys.map((k) => ({
      id: k.id,
      name: k.name,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    })),
  };
}

export interface IssuedPeerKey {
  name: string;
  key: string;
}

/**
 * Not FinderAI-specific — any partner team gets the same treatment: a
 * 32-byte random hex key, only its SHA-256 hash stored (`ApiKey.keyHash`),
 * the raw value returned exactly once. Reuses the endpoint FinderAI already
 * calls (`GET /external/bookings/active-at`) — one key per named caller,
 * same data.
 */
export async function issuePeerApiKey(name: string): Promise<IssuedPeerKey> {
  const key = randomBytes(32).toString('hex');
  const keyHash = hashApiKey(key);
  try {
    await getPrisma().apiKey.create({ data: { name, keyHash } });
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new ConflictError(`A key named "${name}" already exists`);
    throw err;
  }
  return { name, key };
}

/** Revokes a peer key immediately — `requireApiKey` looks up the hash on
 * every call, so deleting the row means the next request with this key
 * fails auth right away, no separate "disable" flag needed. */
export async function deletePeerApiKey(id: string): Promise<void> {
  try {
    await getPrisma().apiKey.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NotFoundError('Peer API key not found');
    }
    throw err;
  }
}

export interface PeerIntegrationSummary {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyMasked: string;
  notes: string | null;
  createdAt: string;
}

function maskApiKey(key: string): string {
  return key.length <= 4 ? '••••' : `••••${key.slice(-4)}`;
}

function toSummary(row: PeerIntegration): PeerIntegrationSummary {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKeyMasked: maskApiKey(row.apiKey),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Bookkeeping for peer APIs we consume — not wired to a generic caller.
 * Every partner's response shape is different, so actually calling one
 * still means a real integration module (see src/integrations/finderai.ts);
 * this just keeps every partner's base URL / issued key in one ADMIN-only
 * place instead of scattered across chat history. `apiKey` is never
 * returned in full — masked to its last 4 characters — since unlike ApiKey
 * (where we only ever compare a hash), the raw value has to stay usable to
 * actually call them later, so it's a real secret at rest.
 */
export async function listPeerIntegrations(): Promise<PeerIntegrationSummary[]> {
  const rows = await getPrisma().peerIntegration.findMany({ orderBy: { name: 'asc' } });
  return rows.map(toSummary);
}

export async function createPeerIntegration(input: CreatePeerIntegrationInput): Promise<PeerIntegrationSummary> {
  try {
    const row = await getPrisma().peerIntegration.create({ data: input });
    return toSummary(row);
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new ConflictError(`A peer integration named "${input.name}" already exists`);
    throw err;
  }
}

/**
 * Reveals the full raw key for one peer integration — the list endpoint
 * above only ever returns it masked. ADMIN-only route (see admin.routes.ts);
 * this is the one place the real secret leaves the database at all.
 */
export async function revealPeerIntegrationKey(id: string): Promise<string> {
  const row = await getPrisma().peerIntegration.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Peer integration not found');
  return row.apiKey;
}

export async function deletePeerIntegration(id: string): Promise<void> {
  try {
    await getPrisma().peerIntegration.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NotFoundError('Peer integration not found');
    }
    throw err;
  }
}

export interface ReservationSearchResult {
  id: string;
  roomName: string;
  roomCode: string | null;
  building: string;
  organizerName: string;
  organizerEmail: string;
  attendees: { name: string; email: string }[];
  headcount: number;
  startTime: string;
  endTime: string;
  status: string;
  purpose: string | null;
}

/**
 * "Who booked with whom" view for admins — distinct from the AuditLog above,
 * which only records STAFF/ADMIN actions (room create, cancel, override) and
 * has no organizer/attendee/headcount fields. `q` matches room name/code,
 * organizer name/email, or any attendee's name/email, case-insensitive.
 */
export async function searchReservations(query: ReservationSearchQuery): Promise<ReservationSearchResult[]> {
  const { q, from, to, limit } = query;
  const insensitive = { mode: 'insensitive' as const };

  const reservations = await getPrisma().reservation.findMany({
    where: {
      ...(from ? { startTime: { gte: from } } : {}),
      ...(to ? { endTime: { lte: to } } : {}),
      ...(q
        ? {
            OR: [
              { purpose: { contains: q, ...insensitive } },
              { room: { name: { contains: q, ...insensitive } } },
              { room: { code: { contains: q, ...insensitive } } },
              { organizer: { name: { contains: q, ...insensitive } } },
              { organizer: { email: { contains: q, ...insensitive } } },
              { attendees: { some: { user: { name: { contains: q, ...insensitive } } } } },
              { attendees: { some: { user: { email: { contains: q, ...insensitive } } } } },
            ],
          }
        : {}),
    },
    include: {
      room: true,
      organizer: true,
      attendees: { include: { user: true } },
    },
    orderBy: { startTime: 'desc' },
    take: limit,
  });

  return reservations.map((r) => ({
    id: r.id,
    roomName: r.room.name,
    roomCode: r.room.code,
    building: r.room.building,
    organizerName: r.organizer.name,
    organizerEmail: r.organizer.email,
    attendees: r.attendees.map((a) => ({ name: a.user.name, email: a.user.email })),
    headcount: r.attendees.length + 1,
    startTime: r.startTime.toISOString(),
    endTime: r.endTime.toISOString(),
    status: r.status,
    purpose: r.purpose,
  }));
}
