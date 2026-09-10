/**
 * Runs `prisma migrate deploy` in production, where the database URL lives in
 * Key Vault — not in an env var or a file on the VM (CLAUDE.md hard rule 1).
 *
 * `deploy.sh` invokes this in a one-off container instead of calling the
 * Prisma CLI directly: the Prisma CLI only reads `env("DATABASE_URL")` and
 * knows nothing about Key Vault, so we fetch the secret here, put it in the
 * process environment, and hand off to the CLI.
 *
 * If `DATABASE_URL` is already set (local dev, CI against a throwaway
 * Postgres), we skip the vault entirely and just run the migration. Lives in
 * `src/config/` because that is the only directory allowed to read
 * `process.env` (MASTER_PROMPT §9.3 / the env-guard script).
 */
import { spawnSync } from 'node:child_process';

import { loadVaultSecrets } from './keyvault';

async function resolveDatabaseUrl(): Promise<string> {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv && fromEnv.length > 0) {
    console.log('[migrate] using DATABASE_URL from the environment');
    return fromEnv;
  }

  console.log('[migrate] DATABASE_URL not set — fetching SpaceReserve-DatabaseUrl from Key Vault');
  const secrets = await loadVaultSecrets();
  if (!secrets.databaseUrl) {
    throw new Error('Key Vault returned an empty SpaceReserve-DatabaseUrl');
  }
  return secrets.databaseUrl;
}

async function main(): Promise<void> {
  const databaseUrl = await resolveDatabaseUrl();

  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

main().catch((err: unknown) => {
  console.error('[migrate] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
