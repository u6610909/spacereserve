/**
 * Demo seed: three users (one per role), a realistic campus room inventory
 * across seven Assumption University buildings — including the Music Building's
 * recital hall and practice rooms — plus a handful of reservations and the
 * FinderAI peer API key.
 *
 * Destructive-idempotent: it clears reservations and rooms first, then
 * recreates them, so re-running always lands on the same known state. Users
 * are upserted, never deleted — real OIDC sign-ins own their own rows.
 *
 * `adObjectId` values for the seeded users are placeholders for the personal
 * Entra tenant used until AU's app registration lands. Real sign-in overwrites
 * name/email via the auth upsert; role is left untouched.
 */
import { randomBytes } from 'node:crypto';

import { PrismaClient, Role, RoomStatus } from '@prisma/client';

import { hashApiKey } from '../src/lib/apiKey';

const prisma = new PrismaClient();

interface RoomSeed {
  code: string;
  name: string;
  building: string;
  capacity: number;
  amenities: string[];
  status?: RoomStatus;
}

// Seven real buildings on the AU Suvarnabhumi campus. `code` is the short
// room number staff/signage would actually use; `name` stays the friendlier
// display label shown in the UI — the two are deliberately separate fields
// (see docs/architecture.md) so a room can be looked up by either.
const ROOMS: RoomSeed[] = [
  // --- Cathedral of Learning — the main academic tower -------------------
  { code: 'CL204', name: 'CL-2-04', building: 'Cathedral of Learning', capacity: 40, amenities: ['projector', 'whiteboard', 'wifi', 'movable-seating'] },
  { code: 'CL205', name: 'CL-2-05', building: 'Cathedral of Learning', capacity: 40, amenities: ['projector', 'whiteboard', 'wifi', 'movable-seating'] },
  { code: 'CL301', name: 'CL-3-01', building: 'Cathedral of Learning', capacity: 24, amenities: ['tv-display', 'whiteboard', 'wifi'] },
  { code: 'CL302', name: 'CL-3-02', building: 'Cathedral of Learning', capacity: 24, amenities: ['tv-display', 'whiteboard', 'wifi'] },
  { code: 'CL410', name: 'CL-4-10 Lecture Theatre', building: 'Cathedral of Learning', capacity: 180, amenities: ['projector', 'podium', 'microphone', 'sound-system', 'wifi'] },
  { code: 'CL5B', name: 'CL-5-Boardroom', building: 'Cathedral of Learning', capacity: 14, amenities: ['video-conf', 'tv-display', 'whiteboard', 'wifi'] },

  // --- Srisakdi Charmonman IT Building — computer labs ------------------
  { code: 'SCLAB1', name: 'SC-LAB-1', building: 'Srisakdi Charmonman IT Building', capacity: 30, amenities: ['projector', 'dual-monitor', 'wifi'] },
  { code: 'SCLAB2', name: 'SC-LAB-2', building: 'Srisakdi Charmonman IT Building', capacity: 30, amenities: ['projector', 'dual-monitor', 'wifi'] },
  { code: 'SCLAB3', name: 'SC-LAB-3 (Networking)', building: 'Srisakdi Charmonman IT Building', capacity: 24, amenities: ['projector', 'dual-monitor', 'whiteboard', 'wifi'], status: RoomStatus.OUT_OF_ORDER },
  { code: 'SC402', name: 'SC-4-02 Seminar', building: 'Srisakdi Charmonman IT Building', capacity: 20, amenities: ['tv-display', 'whiteboard', 'wifi'] },
  { code: 'SC403', name: 'SC-4-03 Seminar', building: 'Srisakdi Charmonman IT Building', capacity: 20, amenities: ['tv-display', 'whiteboard', 'wifi'] },

  // --- de Montfort Building — general classrooms ----------------------
  { code: 'MT108', name: 'MT-1-08', building: 'de Montfort Building', capacity: 45, amenities: ['projector', 'whiteboard', 'wifi'] },
  { code: 'MT109', name: 'MT-1-09', building: 'de Montfort Building', capacity: 45, amenities: ['projector', 'whiteboard', 'wifi'] },
  { code: 'MT202', name: 'MT-2-02', building: 'de Montfort Building', capacity: 30, amenities: ['whiteboard', 'wifi', 'natural-light'] },
  { code: 'MT203', name: 'MT-2-03', building: 'de Montfort Building', capacity: 30, amenities: ['whiteboard', 'wifi', 'natural-light'] },

  // --- John XXIII Conference Center ---------------------------------
  { code: 'JCHALLA', name: 'JC Conference Hall A', building: 'John XXIII Conference Center', capacity: 300, amenities: ['projector', 'podium', 'microphone', 'sound-system', 'video-conf', 'wifi'] },
  { code: 'JCM1', name: 'JC Meeting Room 1', building: 'John XXIII Conference Center', capacity: 12, amenities: ['video-conf', 'tv-display', 'whiteboard', 'wifi'] },
  { code: 'JCM2', name: 'JC Meeting Room 2', building: 'John XXIII Conference Center', capacity: 12, amenities: ['video-conf', 'tv-display', 'whiteboard', 'wifi'] },
  { code: 'JCM3', name: 'JC Meeting Room 3', building: 'John XXIII Conference Center', capacity: 8, amenities: ['tv-display', 'whiteboard', 'wifi'] },

  // --- Albert Laurence School of Communication Arts ---------------
  { code: 'CASCR', name: 'CA Screening Room', building: 'Albert Laurence CommArts Building', capacity: 60, amenities: ['projector', 'sound-system', 'wifi'] },
  { code: 'CAST1', name: 'CA Studio 1', building: 'Albert Laurence CommArts Building', capacity: 20, amenities: ['sound-system', 'microphone', 'wifi'] },
  { code: 'CAES2', name: 'CA Edit Suite 2', building: 'Albert Laurence CommArts Building', capacity: 6, amenities: ['dual-monitor', 'wifi'] },
  { code: 'CAES3', name: 'CA Edit Suite 3', building: 'Albert Laurence CommArts Building', capacity: 6, amenities: ['dual-monitor', 'wifi'], status: RoomStatus.OUT_OF_ORDER },

  // --- Music Building --------------------------------------------
  { code: 'MBHALL', name: 'MB Recital Hall', building: 'Music Building', capacity: 120, amenities: ['piano', 'sound-system', 'microphone', 'podium', 'wifi'] },
  { code: 'MBENS', name: 'MB Ensemble Room', building: 'Music Building', capacity: 25, amenities: ['piano', 'drums', 'keyboard', 'sound-system', 'wifi'] },
  { code: 'MBP1', name: 'MB Practice Room P1', building: 'Music Building', capacity: 3, amenities: ['piano'] },
  { code: 'MBP2', name: 'MB Practice Room P2', building: 'Music Building', capacity: 3, amenities: ['piano'] },
  { code: 'MBP3', name: 'MB Practice Room P3', building: 'Music Building', capacity: 4, amenities: ['keyboard', 'drums'] },
  { code: 'MBP4', name: 'MB Practice Room P4', building: 'Music Building', capacity: 4, amenities: ['keyboard', 'microphone'] },
  { code: 'MBP5', name: 'MB Practice Room P5', building: 'Music Building', capacity: 2, amenities: ['piano'], status: RoomStatus.OUT_OF_ORDER },

  // --- Library — bookable group study pods -----------------------
  { code: 'LBP1', name: 'LB Study Pod 1', building: 'Cathedral of Learning Library', capacity: 4, amenities: ['tv-display', 'whiteboard', 'wifi'] },
  { code: 'LBP2', name: 'LB Study Pod 2', building: 'Cathedral of Learning Library', capacity: 4, amenities: ['tv-display', 'whiteboard', 'wifi'] },
  { code: 'LBP3', name: 'LB Study Pod 3', building: 'Cathedral of Learning Library', capacity: 6, amenities: ['tv-display', 'whiteboard', 'wifi'] },
  { code: 'LBP4', name: 'LB Study Pod 4', building: 'Cathedral of Learning Library', capacity: 6, amenities: ['whiteboard', 'wifi', 'natural-light'] },
];

async function main(): Promise<void> {
  const [student, staff, admin] = await Promise.all([
    prisma.user.upsert({
      where: { adObjectId: 'seed-student-oid' },
      update: {},
      create: { adObjectId: 'seed-student-oid', email: 'student@spacereserve.dev', name: 'Sam Student', role: Role.STUDENT },
    }),
    prisma.user.upsert({
      where: { adObjectId: 'seed-staff-oid' },
      update: {},
      create: { adObjectId: 'seed-staff-oid', email: 'staff@spacereserve.dev', name: 'Priya Facilities', role: Role.STAFF },
    }),
    prisma.user.upsert({
      where: { adObjectId: 'seed-admin-oid' },
      update: {},
      create: { adObjectId: 'seed-admin-oid', email: 'admin@spacereserve.dev', name: 'Alex Registrar', role: Role.ADMIN },
    }),
  ]);

  // Clear the bookable inventory (children first — FK order) so a re-run is
  // deterministic. Users and audit logs are left alone.
  await prisma.reservationAttendee.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.room.deleteMany();

  await prisma.room.createMany({ data: ROOMS });
  const rooms = await prisma.room.findMany();
  const byName = new Map(rooms.map((r) => [r.name, r]));
  const room = (name: string) => byName.get(name)!;

  const now = new Date();
  const at = (dayOffset: number, hour: number): Date => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  await prisma.reservation.create({
    data: {
      roomId: room('LB Study Pod 1').id,
      organizerId: student.id,
      startTime: at(1, 14),
      endTime: at(1, 16),
      purpose: 'CSX4110 group project sync',
      attendees: { create: [{ userId: staff.id }] },
    },
  });
  await prisma.reservation.create({
    data: {
      roomId: room('MB Practice Room P1').id,
      organizerId: student.id,
      startTime: at(1, 17),
      endTime: at(1, 18),
      purpose: 'Piano practice',
    },
  });
  await prisma.reservation.create({
    data: {
      roomId: room('CL-5-Boardroom').id,
      organizerId: staff.id,
      startTime: at(2, 10),
      endTime: at(2, 11),
      purpose: 'Facilities weekly review',
    },
  });
  await prisma.reservation.create({
    data: {
      roomId: room('JC Conference Hall A').id,
      organizerId: admin.id,
      startTime: at(3, 9),
      endTime: at(3, 12),
      purpose: 'Faculty orientation',
    },
  });
  await prisma.reservation.create({
    data: {
      roomId: room('MB Ensemble Room').id,
      organizerId: student.id,
      startTime: at(4, 16),
      endTime: at(4, 18),
      purpose: 'Jazz ensemble rehearsal',
      attendees: { create: [{ userId: admin.id }] },
    },
  });
  await prisma.reservation.create({
    data: {
      roomId: room('SC-LAB-1').id,
      organizerId: staff.id,
      startTime: at(5, 13),
      endTime: at(5, 15),
      purpose: 'Lab software update session',
    },
  });

  // Peer API: FinderAI's key. `SpaceReserve-PeerApiKeyHash` in Key Vault is the
  // bootstrap hash for this row on a fresh database. Falls back to a freshly
  // generated dev key (printed once) when that env var isn't set.
  const bootstrapHash = process.env.PEER_API_KEY_HASH;
  let keyHash = bootstrapHash;
  if (!keyHash) {
    const devKey = randomBytes(24).toString('hex');
    keyHash = hashApiKey(devKey);
    console.log(`[seed] Generated a dev FinderAI API key (save it, shown once): ${devKey}`);
  }
  await prisma.apiKey.upsert({
    where: { name: 'FinderAI' },
    update: { keyHash },
    create: { name: 'FinderAI', keyHash },
  });

  console.log('[seed] done:', { users: 3, rooms: rooms.length, reservations: 6 });
}

main()
  .catch((err: unknown) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
