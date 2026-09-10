import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

/**
 * The Key Vault's address. Not a secret (it's visible in the Azure portal),
 * so production passes it via `AZURE_KEY_VAULT_URL` — same as dev — rather
 * than baking it into the image and needing a code change + CI rebuild every
 * time it moves. `BUILD_TIME_DEFAULT` is a fallback for a pinned build; when
 * both are empty, production refuses to boot with a clear message (see
 * `loadVaultSecrets`), which is the intended behaviour until a real vault
 * exists. This file lives under `src/config/`, the only place allowed to
 * read `process.env`.
 */
const BUILD_TIME_DEFAULT = '';
const KEY_VAULT_URL = process.env.AZURE_KEY_VAULT_URL || BUILD_TIME_DEFAULT;

/** Vault secret names, prefixed to avoid collisions with other class projects. */
const SECRET_NAMES = {
  databaseUrl: 'SpaceReserve-DatabaseUrl',
  jwtSecret: 'SpaceReserve-JwtSecret',
  adClientId: 'SpaceReserve-AdClientId',
  adClientSecret: 'SpaceReserve-AdClientSecret',
  geminiApiKey: 'SpaceReserve-GeminiApiKey',
  sendGridApiKey: 'SpaceReserve-SendGridApiKey',
  finderAiApiKey: 'SpaceReserve-FinderAIApiKey',
  peerApiKeyHash: 'SpaceReserve-PeerApiKeyHash',
} as const;

export interface VaultSecrets {
  databaseUrl: string;
  jwtSecret: string;
  adClientId: string;
  adClientSecret: string;
  geminiApiKey: string;
  sendGridApiKey: string;
  finderAiApiKey: string;
  peerApiKeyHash: string;
}

let cachedClient: SecretClient | undefined;

function getClient(): SecretClient {
  if (!KEY_VAULT_URL) {
    throw new Error(
      'Key Vault URL is not configured. Production cannot boot without it — see ' +
        "CLAUDE.md's \"Still blocked\" list for <<KEY_VAULT_URL>>.",
    );
  }
  if (!cachedClient) {
    cachedClient = new SecretClient(KEY_VAULT_URL, new DefaultAzureCredential());
  }
  return cachedClient;
}

/**
 * Fetches every secret the app needs, in parallel. Never logs values — only
 * secret *names* on failure, so a boot-fail log line is safe to read aloud in
 * the demo video.
 */
export async function loadVaultSecrets(): Promise<VaultSecrets> {
  const client = getClient();
  const entries = Object.entries(SECRET_NAMES) as [keyof VaultSecrets, string][];

  const results = await Promise.allSettled(
    entries.map(async ([key, name]) => {
      const secret = await client.getSecret(name);
      if (!secret.value) throw new Error('empty value');
      return { key, value: secret.value };
    }),
  );

  const failedNames = entries
    .filter((_, i) => results[i]?.status === 'rejected')
    .map(([, name]) => name);

  if (failedNames.length > 0) {
    throw new Error(`Failed to fetch Key Vault secrets: ${failedNames.join(', ')}`);
  }

  const secrets = {} as VaultSecrets;
  for (const result of results) {
    if (result.status === 'fulfilled') secrets[result.value.key] = result.value.value;
  }
  return secrets;
}

/** Cheap reachability probe for the health endpoint — does not fetch secret values. */
export async function probeKeyVaultReachable(): Promise<boolean> {
  try {
    const client = getClient();
    // Listing properties is a lightweight call that proves auth + connectivity
    // without pulling any secret value into memory or logs.
    const iterator = client.listPropertiesOfSecrets().byPage({ maxPageSize: 1 });
    await iterator.next();
    return true;
  } catch {
    return false;
  }
}
