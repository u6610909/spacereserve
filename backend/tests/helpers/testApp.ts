import { createApp } from '../../src/app';
import { resolveSecrets } from '../../src/config';
import { getPrisma } from '../../src/lib/prisma';

/** Mirrors real bootstrap order (src/index.ts): secrets before Express assembly. */
export async function buildTestApp(): Promise<ReturnType<typeof createApp>> {
  await resolveSecrets();
  return createApp();
}

/**
 * Deletes all rows (in FK-safe order) from the test database. Safe to run
 * against `spacereserve_test` only — never call this outside a test file,
 * and never against the dev database.
 */
export async function resetDb(): Promise<void> {
  const prisma = getPrisma();
  await prisma.reservationAttendee.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.room.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.peerIntegration.deleteMany();
  await prisma.user.deleteMany();
}
