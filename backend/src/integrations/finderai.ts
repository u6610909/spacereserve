import { logger } from '../lib/logger';

/**
 * FinderAI's real request/response shape for `/api/v1/items/by-location` is
 * still unknown (docs/architecture.md — "get their real contract before writing
 * the client; do not invent fields"). This interface is our own placeholder
 * shape, not theirs; `MockFinderAiClient` is the only implementation until
 * the contract lands (target per docs/architecture.md: keys exchanged 4 Sep,
 * joint test 16 Sep). Swapping in a real HTTP client is then a matter of
 * implementing `FinderAiClient` against their actual schema — nothing that
 * calls `lookupLostItems` below needs to change.
 */
export interface LostItemNotice {
  itemId: string;
  description: string;
  reportedAt: string;
}

export interface FinderAiClient {
  lookupItemsNearRoom(roomId: string, at: Date): Promise<LostItemNotice[]>;
}

class MockFinderAiClient implements FinderAiClient {
  async lookupItemsNearRoom(): Promise<LostItemNotice[]> {
    return [];
  }
}

function getClient(): FinderAiClient {
  return new MockFinderAiClient();
}

const TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 60_000;
const FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 60_000;

interface CacheEntry {
  value: LostItemNotice[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function cacheKey(roomId: string, at: Date): string {
  return `${roomId}:${at.toISOString()}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('FinderAI request timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err as Error);
      },
    );
  });
}

/**
 * `null` means "couldn't reach FinderAI" — check-in must still succeed with
 * `lostItemNotice: null` (docs/architecture.md), never a 500.
 */
export async function lookupLostItems(roomId: string, at: Date): Promise<LostItemNotice[] | null> {
  const key = cacheKey(roomId, at);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  if (Date.now() < circuitOpenUntil) {
    logger.warn({ roomId }, 'finderai circuit open — skipping lookup');
    return null;
  }

  try {
    const result = await withTimeout(getClient().lookupItemsNearRoom(roomId, at), TIMEOUT_MS);
    consecutiveFailures = 0;
    cache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    consecutiveFailures += 1;
    if (consecutiveFailures >= FAILURE_THRESHOLD) {
      circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
      logger.error({ err }, 'finderai circuit opened after repeated failures');
    } else {
      logger.warn({ err, roomId }, 'finderai lookup failed');
    }
    return null;
  }
}

/** Test-only: the mock never fails, so tests that want a "down" path use this. */
export function resetFinderAiCircuit(): void {
  cache.clear();
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}
