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
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Comma-separated allow-list. Empty string = allow no cross-origin browser callers. */
  CORS_ORIGINS: z.string().default(''),
  APP_VERSION: z.string().default('0.1.0'),
  /**
   * Signs the OIDC state / PKCE cookies. Dev fallback only — from Phase 3 this
   * is replaced by `SpaceReserve-JwtSecret` fetched from Key Vault, and
   * production refuses to boot without it.
   */
  COOKIE_SECRET: z.string().min(1).default('dev-only-cookie-secret'),
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
  cookieSecret: env.COOKIE_SECRET,
  /** Every route lives under this prefix so Nginx can proxy it cleanly. */
  basePath: '/spacereserve/api/v1',
} as const;

export type Config = typeof config;
