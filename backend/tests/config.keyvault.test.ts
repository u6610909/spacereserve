import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `src/config/index.ts` reads `NODE_ENV` at import time, so each mode is
 * exercised in its own dynamic `import()` after setting the env var — a
 * static top-level import would only ever see the `test` mode vitest sets.
 */
async function loadConfigModule(nodeEnv: string) {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', nodeEnv);
  return import('../src/config');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock('../src/config/keyvault');
});

describe('resolveSecrets — test mode', () => {
  it('returns fixed fakes and never touches the vault', async () => {
    const loadVaultSecrets = vi.fn();
    vi.doMock('../src/config/keyvault', () => ({
      loadVaultSecrets,
      probeKeyVaultReachable: vi.fn(),
    }));

    const { resolveSecrets } = await loadConfigModule('test');
    const secrets = await resolveSecrets();

    expect(secrets.databaseUrl).toContain('postgresql://');
    expect(secrets.jwtSecret).toBeTruthy();
    expect(loadVaultSecrets).not.toHaveBeenCalled();
  });
});

describe('resolveSecrets — development mode', () => {
  it('falls back to env values', async () => {
    vi.doMock('../src/config/keyvault', () => ({
      loadVaultSecrets: vi.fn(),
      probeKeyVaultReachable: vi.fn(),
    }));
    vi.stubEnv('JWT_SECRET', 'dev-jwt-secret-from-env');
    vi.stubEnv('DATABASE_URL', 'postgresql://dev:dev@localhost:5432/spacereserve');

    const { resolveSecrets } = await loadConfigModule('development');
    const secrets = await resolveSecrets();

    expect(secrets.jwtSecret).toBe('dev-jwt-secret-from-env');
    expect(secrets.databaseUrl).toBe('postgresql://dev:dev@localhost:5432/spacereserve');
  });
});

describe('resolveSecrets — production mode', () => {
  it('refuses to boot when the vault is unreachable', async () => {
    vi.doMock('../src/config/keyvault', () => ({
      loadVaultSecrets: vi.fn().mockRejectedValue(new Error('Key Vault URL is not configured.')),
      probeKeyVaultReachable: vi.fn(),
    }));

    const { resolveSecrets } = await loadConfigModule('production');

    await expect(resolveSecrets()).rejects.toThrow(/Key Vault/);
  });

  it('resolves from the vault when reachable', async () => {
    const vaultSecrets = {
      databaseUrl: 'postgresql://vault:vault@db.internal:5432/spacereserve',
      jwtSecret: 'vault-jwt-secret',
      adClientId: 'vault-ad-client-id',
      adClientSecret: 'vault-ad-client-secret',
      geminiApiKey: 'vault-gemini-key',
      acsConnectionString: 'vault-acs-connection-string',
      acsSenderAddress: 'vault-acs-sender-address',
      finderAiApiKey: 'vault-finderai-key',
      peerApiKeyHash: 'vault-peer-api-key-hash',
    };
    vi.doMock('../src/config/keyvault', () => ({
      loadVaultSecrets: vi.fn().mockResolvedValue(vaultSecrets),
      probeKeyVaultReachable: vi.fn(),
    }));

    const { resolveSecrets } = await loadConfigModule('production');
    const secrets = await resolveSecrets();

    expect(secrets).toEqual(vaultSecrets);
  });
});
