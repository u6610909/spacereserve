/**
 * Dev/demo seed: one user per role, ~10 rooms across 2 buildings, a few
 * reservations, and the FinderAI peer API key row.
 *
 * `adObjectId` values here are placeholders for the personal Entra tenant
 * used until AU's app registration lands (CLAUDE.md — "Settled design
 * decisions" / AD). Real sign-in overwrites these via the auth upsert.
 */
import { createHash, randomBytes } from 'node:crypto';

import { PrismaClient, Role, RoomStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const [student, staff, admin] = await Promise.all([
    prisma.user.upsert({
      where: { adObjectId: 'seed-student-oid' },
      update: {},
      create: {
        adObjectId: 'seed-student-oid',
        email: 'student@spacereserve.dev',
        name: 'Sam Student',
        role: Role.STUDENT,
      },
    }),
    prisma.user.upsert({
      where: { adObjectId: 'seed-staff-oid' },
      update: {},
      create: {
        adObjectId: 'seed-staff-oid',
        email: 'staff@spacereserve.dev',
        name: 'Sam Staff',
        role: Role.STAFF,
      },
    }),
    prisma.user.upsert({
      where: { adObjectId: 'seed-admin-oid' },
      update: {},
      create: {
        adObjectId: 'seed-admin-oid',
        email: 'admin@spacereserve.dev',
        name: 'Sam Admin',
        role: Role.ADMIN,
      },
    }),
  ]);

  const roomDefs = [
    { name: 'CB-101', building: 'CB', capacity: 4, amenities: ['whiteboard'] },
    { name: 'CB-102', building: 'CB', capacity: 4, amenities: ['whiteboard'] },
    { name: 'CB-201', building: 'CB', capacity: 8, amenities: ['projector', 'whiteboard'] },
    { name: 'CB-202', building: 'CB', capacity: 8, amenities: ['projector'] },
    { name: 'CB-301', building: 'CB', capacity: 20, amenities: ['projector', 'whiteboard', 'video-conf'] },
    { name: 'SC-101', building: 'SC', capacity: 2, amenities: [] },
    { name: 'SC-102', building: 'SC', capacity: 2, amenities: ['whiteboard'] },
    { name: 'SC-201', building: 'SC', capacity: 6, amenities: ['projector'] },
    { name: 'SC-301', building: 'SC', capacity: 12, amenities: ['projector', 'whiteboard'] },
    {
      name: 'SC-302',
      building: 'SC',
      capacity: 1,
      amenities: ['piano'],
      status: RoomStatus.OUT_OF_ORDER,
    },
  ];

  const rooms = await Promise.all(
    roomDefs.map((room) =>
      prisma.room.upsert({
        where: { name: room.name },
        update: {},
        create: room,
      }),
    ),
  );

  const roomByName = new Map(rooms.map((r) => [r.name, r]));
  const cb101 = roomByName.get('CB-101')!;
  const cb201 = roomByName.get('CB-201')!;
  const sc201 = roomByName.get('SC-201')!;

  const now = new Date();
  const inHours = (h: number): Date => new Date(now.getTime() + h * 60 * 60 * 1000);

  await prisma.reservation.upsert({
    where: { id: 'seed-reservation-1' },
    update: {},
    create: {
      id: 'seed-reservation-1',
      roomId: cb101.id,
      organizerId: student.id,
      startTime: inHours(2),
      endTime: inHours(3),
      purpose: 'Study group',
      attendees: { create: [{ userId: staff.id }] },
    },
  });

  await prisma.reservation.upsert({
    where: { id: 'seed-reservation-2' },
    update: {},
    create: {
      id: 'seed-reservation-2',
      roomId: cb201.id,
      organizerId: staff.id,
      startTime: inHours(24),
      endTime: inHours(25),
      purpose: 'Department meeting',
    },
  });

  await prisma.reservation.upsert({
    where: { id: 'seed-reservation-3' },
    update: {},
    create: {
      id: 'seed-reservation-3',
      roomId: sc201.id,
      organizerId: admin.id,
      startTime: inHours(48),
      endTime: inHours(49.5),
      purpose: 'Guest lecture',
    },
  });

  // Peer API: FinderAI's key. `SpaceReserve-PeerApiKeyHash` in Key Vault is the
  // bootstrap hash for this row on a fresh database — see .env.example /
  // CLAUDE.md's Key Vault table. Falls back to a freshly generated dev key
  // (printed once) when that env var isn't set, so `prisma db seed` still
  // works before Key Vault is wired up locally.
  const bootstrapHash = process.env.PEER_API_KEY_HASH;
  let keyHash = bootstrapHash;
  if (!keyHash) {
    const devKey = randomBytes(24).toString('hex');
    keyHash = createHash('sha256').update(devKey).digest('hex');
    console.log(`[seed] Generated a dev FinderAI API key (save it, shown once): ${devKey}`);
  }

  await prisma.apiKey.upsert({
    where: { name: 'FinderAI' },
    update: { keyHash },
    create: { name: 'FinderAI', keyHash },
  });

  console.log('[seed] done:', {
    users: 3,
    rooms: rooms.length,
    reservations: 3,
  });
}

main()
  .catch((err: unknown) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
