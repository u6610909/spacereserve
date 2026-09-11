import { config, getSecrets } from '../config';
import { logger } from '../lib/logger';

/**
 * FinderAI's real contract (received 12 Sep, see docs/peer-api.md):
 *   GET <base>/items/by-location?location=<room name>&since=<ISO 8601, optional>
 *   header: x-api-key: <key they issued us>
 *   -> { success: boolean, location: string, items: LostItemNotice[] }
 * These are their actual field names — not invented ahead of the contract
 * landing (docs/architecture.md).
 */
export interface LostItemNotice {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  createdAt: string;
}

export interface FinderAiClient {
  lookupItemsNearRoom(roomName: string): Promise<LostItemNotice[]>;
}

interface FinderAiApiResponse {
  success: boolean;
  location: string;
  items: LostItemNotice[];
}

/** Only "recent" finds are worth surfacing at check-in — their whole history
 * for a busy room (a library, say) would otherwise bury the signal. */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

class MockFinderAiClient implements FinderAiClient {
  async lookupItemsNearRoom(): Promise<LostItemNotice[]> {
    return [];
  }
}

class RealFinderAiClient implements FinderAiClient {
  async lookupItemsNearRoom(roomName: string): Promise<LostItemNotice[]> {
    const { finderAiApiKey } = getSecrets();
    const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
    const url = `${config.finderAiBaseUrl}/items/by-location?location=${encodeURIComponent(roomName)}&since=${encodeURIComponent(since)}`;

    const res = await fetch(url, {
      headers: { 'x-api-key': finderAiApiKey, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`FinderAI responded ${res.status}`);

    const body = (await res.json()) as FinderAiApiResponse;
    if (!body.success) throw new Error('FinderAI reported success: false');
    return body.items;
  }
}

/** Mock unless both the base URL (non-secret, FINDERAI_BASE_URL) and the key
 * they issued us (SpaceReserve-FinderAIApiKey) are configured — the same
 * "degrade before real credentials exist" pattern as Gemini/ACS. */
function getClient(): FinderAiClient {
  const { finderAiApiKey } = getSecrets();
  if (!finderAiApiKey || !config.finderAiBaseUrl) return new MockFinderAiClient();
  return new RealFinderAiClient();
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
 * `lostItemNotice: null` (docs/architecture.md), never a 500. `roomName` is
 * the cache key too — the 60s TTL already covers the "since" window moving
 * a little between calls, so there's no need to key on the timestamp.
 */
export async function lookupLostItems(roomName: string): Promise<LostItemNotice[] | null> {
  const cached = cache.get(roomName);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  if (Date.now() < circuitOpenUntil) {
    logger.warn({ roomName }, 'finderai circuit open — skipping lookup');
    return null;
  }

  try {
    const result = await withTimeout(getClient().lookupItemsNearRoom(roomName), TIMEOUT_MS);
    consecutiveFailures = 0;
    cache.set(roomName, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    consecutiveFailures += 1;
    if (consecutiveFailures >= FAILURE_THRESHOLD) {
      circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
      logger.error({ err }, 'finderai circuit opened after repeated failures');
    } else {
      logger.warn({ err, roomName }, 'finderai lookup failed');
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
