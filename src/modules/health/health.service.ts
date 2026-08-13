import { config } from '../../config';

export type DependencyStatus = 'ok' | 'down' | 'not_configured';

export interface HealthReport {
  status: 'ok' | 'degraded';
  db: DependencyStatus;
  keyVault: DependencyStatus;
  version: string;
  uptimeSeconds: number;
}

/**
 * Dependency probes are cached so the Docker healthcheck (which polls every few
 * seconds) never hammers Postgres or Key Vault.
 */
const PROBE_TTL_MS = 30_000;

interface CachedProbe {
  value: DependencyStatus;
  expiresAt: number;
}

const probeCache = new Map<string, CachedProbe>();

async function cachedProbe(key: string, probe: () => Promise<DependencyStatus>): Promise<DependencyStatus> {
  const now = Date.now();
  const hit = probeCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const value = await probe();
  probeCache.set(key, { value, expiresAt: now + PROBE_TTL_MS });
  return value;
}

/** Replaced with a real `SELECT 1` in Phase 2. */
async function probeDatabase(): Promise<DependencyStatus> {
  return 'not_configured';
}

/** Replaced with a real Key Vault reachability check in Phase 3. */
async function probeKeyVault(): Promise<DependencyStatus> {
  return 'not_configured';
}

export async function getHealth(): Promise<HealthReport> {
  const [db, keyVault] = await Promise.all([
    cachedProbe('db', probeDatabase),
    cachedProbe('keyVault', probeKeyVault),
  ]);

  const status = db === 'down' || keyVault === 'down' ? 'degraded' : 'ok';

  return {
    status,
    db,
    keyVault,
    version: config.version,
    uptimeSeconds: Math.round(process.uptime()),
  };
}

/** Test helper — probe caching would otherwise leak between test cases. */
export function resetHealthCache(): void {
  probeCache.clear();
}
