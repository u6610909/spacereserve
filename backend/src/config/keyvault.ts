import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

/**
 * Class Key Vault URL — still on CLAUDE.md's "Still blocked" list. Deliberately
 * left empty rather than guessed (MASTER_PROMPT §14: never invent a `<<>>`
 * value). CLAUDE.md hard rule 1 also caps production to exactly three env vars
 * (AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET), so this can't be a
 * 4th prod env var — it has to be a config constant, same pattern as
 * AD_TENANT_ID. An empty value here correctly makes production refuse to boot
 * (see `loadVaultSecrets` below), which is the required behaviour until the
 * real URL is issued — fill it in as a one-line change, not a code change.
 */
const KEY_VAULT_URL =
  process.env.AZURE_KEY_VAULT_URL /* dev-only override, see .env.example */ || '';

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
