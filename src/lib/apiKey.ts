import { createHash } from 'node:crypto';

/** Only the hash is ever stored (ApiKey.keyHash) — the raw key is shown once at issue time. */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}
