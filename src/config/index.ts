/**
 * The ONLY module in the codebase allowed to read `process.env`.
 *
 * Hard rule (MASTER_PROMPT §9.3): no `process.env` access anywhere outside
 * `src/config/`. Enforced by an ESLint rule and by `scripts/check-env-guard.sh`
 * in CI, so the rule cannot be silently disabled.
 *
 * Phase 3 adds `keyvault.ts` alongside this file: in production every secret
 * comes from Azure Key Vault and the app refuses to boot without it. The only
 * env vars permitted in production are the three Azure bootstrap variables
 * (AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET).
 */
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

import { loadVaultSecrets, type VaultSecrets } from './keyvault';

// Loads .env into process.env for local dev/test. Production has no .env file
// on disk (CLAUDE.md hard rule 1) — skipped there as belt-and-braces so a
// stray file on the host can never leak into a production process.
if (process.env.NODE_ENV !== 'production') loadDotenv({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Comma-separated allow-list. Empty string = allow no cross-origin browser callers. */
  CORS_ORIGINS: z.string().default(''),
  APP_VERSION: z.string().default('0.1.0'),
  /**
   * Postgres connection string. Optional here because Phase 3 replaces the env
   * read with a Key Vault fetch (`SpaceReserve-DatabaseUrl`) and production
   * will refuse to boot without it. Until then it is a dev `.env` value, and
   * anything that actually needs a database calls `requireDatabaseUrl()`.
   */
  DATABASE_URL: z.string().url().optional(),
  /**
   * Dev-only fallbacks mirroring the Key Vault secret table (see CLAUDE.md).
   * Production never reads these — `resolveSecrets()` fetches them from the
   * vault instead. All optional: most aren't needed until their own phase
   * (e.g. Gemini isn't used until Phase 7) lands.
   */
  JWT_SECRET: z.string().optional(),
  AD_CLIENT_ID: z.string().optional(),
  AD_CLIENT_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  FINDERAI_API_KEY: z.string().optional(),
  PEER_API_KEY_HASH: z.string().optional(),
  /**
   * Non-secret config, not fetched from Key Vault (CLAUDE.md's secret table
   * marks AD_TENANT_ID "not secret — config default"). Blank in production —
   * the only permitted prod env vars are the 3 Azure bootstrap ones — so
   * anything that needs these must handle "not configured" explicitly rather
   * than assume a default AU tenant is in use (it is not, until AU's app
   * registration lands; see CLAUDE.md "Still blocked").
   */
  AD_TENANT_ID: z.string().optional(),
  AD_REDIRECT_URI: z.string().optional(),
  FINDERAI_BASE_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Config is read before the logger exists, so this one place uses console.
  // Never print values — only which keys failed.
  const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(`Invalid environment configuration for: ${keys}`);
}

const env = parsed.data;

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  version: env.APP_VERSION,
  databaseUrl: env.DATABASE_URL,
  adTenantId: env.AD_TENANT_ID ?? '',
  adRedirectUri: env.AD_REDIRECT_URI ?? '',
  finderAiBaseUrl: env.FINDERAI_BASE_URL ?? '',
  /** Every route lives under this prefix so Nginx can proxy it cleanly. */
  basePath: '/spacereserve/api/v1',
} as const;

export type Config = typeof config;

/**
 * Resolved once at boot, before Express starts (see `src/index.ts`). Three
 * modes, per DECISIONS.md #10:
 *   - test:        fixed fake values, vault and env are never touched.
 *   - development:  falls back to `.env` (dev fallback keys above).
 *   - production:  fetched from Key Vault; throws (and the app refuses to
 *                  boot) if the vault is unreachable or any secret is missing.
 */
let secrets: VaultSecrets | undefined;

const TEST_SECRETS: VaultSecrets = {
  databaseUrl: 'postgresql://test:test@localhost:5432/spacereserve_test?schema=public',
  jwtSecret: 'test-only-jwt-secret',
  // Left blank on purpose: a non-empty fake value here would pass each
  // integration's "is this configured?" check and trigger a real outbound
  // call (AD discovery, a SendGrid send) with garbage credentials — slow,
  // flaky, and pointless in a test run. Empty exercises the same "not
  // configured" degraded path dev/prod hit before real credentials exist.
  adClientId: '',
  adClientSecret: '',
  geminiApiKey: '',
  sendGridApiKey: '',
  finderAiApiKey: '',
  peerApiKeyHash: 'test-only-peer-api-key-hash',
};

export async function resolveSecrets(): Promise<VaultSecrets> {
  if (config.isTest) {
    secrets = TEST_SECRETS;
    return secrets;
  }

  if (config.isProduction) {
    secrets = await loadVaultSecrets();
    return secrets;
  }

  // development: env fallback. Individually optional so each phase can add
  // its own key without every other one already existing.
  secrets = {
    databaseUrl: env.DATABASE_URL ?? '',
    jwtSecret: env.JWT_SECRET ?? '',
    adClientId: env.AD_CLIENT_ID ?? '',
    adClientSecret: env.AD_CLIENT_SECRET ?? '',
    geminiApiKey: env.GEMINI_API_KEY ?? '',
    sendGridApiKey: env.SENDGRID_API_KEY ?? '',
    finderAiApiKey: env.FINDERAI_API_KEY ?? '',
    peerApiKeyHash: env.PEER_API_KEY_HASH ?? '',
  };
  return secrets;
}

/**
 * Use this instead of `config.databaseUrl` wherever a connection is actually
 * required, so a missing value fails loudly at the call site with a message
 * that says what to do, rather than surfacing as a confusing Prisma error.
 * Prefers the resolved secret (post-`resolveSecrets()`); falls back to the raw
 * dev env value for callers that run before bootstrap resolves secrets.
 */
export function requireDatabaseUrl(): string {
  const url = secrets?.databaseUrl || config.databaseUrl;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not configured. Set it in .env for local development; ' +
        'in production it comes from Key Vault as SpaceReserve-DatabaseUrl.',
    );
  }
  return url;
}

/**
 * All other secret consumers (Gemini, SendGrid, FinderAI, AD client
 * credentials, the peer API key hash) go through this — each of those has its
 * own designed "not configured" fallback (degraded search, logged email
 * failure, a clear 503 on the auth routes), so a hard throw here isn't
 * appropriate the way it is for the database and JWT secret.
 */
export function getSecrets(): VaultSecrets {
  if (!secrets) {
    throw new Error('Secrets have not been resolved yet — call resolveSecrets() before this.');
  }
  return secrets;
}

/**
 * Signs both our issued JWTs and the OIDC state / PKCE cookies (CLAUDE.md —
 * "SpaceReserve-JwtSecret ... also signs cookies"), so there is exactly one
 * signing key instead of a separate cookie secret.
 */
export function requireJwtSecret(): string {
  const secret = secrets?.jwtSecret;
  if (!secret) {
    throw new Error(
      'JWT secret is not configured. Set JWT_SECRET in .env for local development; ' +
        'in production it comes from Key Vault as SpaceReserve-JwtSecret.',
    );
  }
  return secret;
}
