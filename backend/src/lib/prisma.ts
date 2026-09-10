import { PrismaClient } from '@prisma/client';

import { requireDatabaseUrl } from '../config';

import { logger } from './logger';

/**
 * Shared Prisma client.
 *
 * Only services may import this (docs/architecture.md) — controllers and
 * middleware go through a service.
 *
 * The connection string is passed in from `src/config` rather than read from
 * the environment by Prisma itself. That matters: from Phase 3 the URL comes
 * from Azure Key Vault, and `datasourceUrl` is what lets the app use a secret
 * that never exists as an environment variable. Prisma CLI commands
 * (`migrate`, `studio`) still read `DATABASE_URL` from `.env` locally — that is
 * development tooling only, never the production runtime path.
 */

// `prisma generate` has not run yet at the time this file was written (the
// schema is Phase 2). Once it has, this type resolves to the generated client.
let client: PrismaClient | undefined;

interface PrismaLogEvent {
  timestamp: Date;
  message: string;
  target: string;
}

function createClient(): PrismaClient {
  const prisma = new PrismaClient({
    datasourceUrl: requireDatabaseUrl(),
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  // Route Prisma's own diagnostics through pino so they carry service context
  // and go through the same redaction rules. Typed locally because the
  // generated `Prisma.LogEvent` does not exist until Phase 2 runs
  // `prisma generate`; the shape matches Prisma's.
  prisma.$on('warn', (e: PrismaLogEvent) => logger.warn({ prisma: e }, 'prisma warning'));
  prisma.$on('error', (e: PrismaLogEvent) => logger.error({ prisma: e }, 'prisma error'));

  return prisma;
}

/**
 * Lazily constructed so that importing this module never opens a connection —
 * tests and the health endpoint can load the app without a database present.
 */
export function getPrisma(): PrismaClient {
  if (!client) client = createClient();
  return client;
}

export async function connectPrisma(): Promise<void> {
  await getPrisma().$connect();
  logger.info('database connected');
}

export async function disconnectPrisma(): Promise<void> {
  if (!client) return;
  await client.$disconnect();
  client = undefined;
  logger.info('database disconnected');
}

/** Cheap liveness probe for `GET /health` (wired up in Phase 2). */
export async function pingDatabase(): Promise<boolean> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    logger.warn({ err }, 'database ping failed');
    return false;
  }
}
