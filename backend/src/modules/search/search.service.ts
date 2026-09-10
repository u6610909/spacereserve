import { interpretQuery } from '../../integrations/gemini';
import { getPrisma } from '../../lib/prisma';
import { listRooms } from '../rooms/rooms.service';

import type { ListRoomsQuery } from '../rooms/rooms.schema';
import type { Room } from '@prisma/client';

const GEMINI_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/** Fallback when Gemini is unavailable or times out — plain substring match. */
async function keywordSearch(query: string): Promise<Room[]> {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (words.length === 0) {
    return getPrisma().room.findMany({ orderBy: { name: 'asc' } });
  }

  return getPrisma().room.findMany({
    where: {
      OR: words.flatMap((word) => [
        { name: { contains: word, mode: 'insensitive' as const } },
        { building: { contains: word, mode: 'insensitive' as const } },
        { amenities: { has: word } },
      ]),
    },
    orderBy: { name: 'asc' },
  });
}

export interface NaturalSearchResult {
  rooms: Room[];
  degraded: boolean;
}

/** The distinct amenity keywords + building names currently in use, handed to
 * Gemini so it maps a request onto values the DB filter can actually match. */
async function loadSearchVocabulary(): Promise<{ amenities: string[]; buildings: string[] }> {
  const rooms = await getPrisma().room.findMany({ select: { amenities: true, building: true } });
  return {
    amenities: [...new Set(rooms.flatMap((r) => r.amenities))].sort(),
    buildings: [...new Set(rooms.map((r) => r.building))].sort(),
  };
}

/** Never throws for an AI failure (docs/architecture.md) — degrades to keyword search instead. */
export async function naturalSearch(query: string): Promise<NaturalSearchResult> {
  const vocab = await loadSearchVocabulary();
  const interpretation = await withTimeout(interpretQuery(query, vocab), GEMINI_TIMEOUT_MS);

  if (!interpretation) {
    return { rooms: await keywordSearch(query), degraded: true };
  }

  const hasWindow = Boolean(interpretation.startTime) && Boolean(interpretation.endTime);
  const listQuery: ListRoomsQuery = {
    capacity: interpretation.capacity ?? undefined,
    building: interpretation.building ?? undefined,
    amenities: interpretation.amenities ?? undefined,
    availableFrom: hasWindow ? new Date(interpretation.startTime!) : undefined,
    availableTo: hasWindow ? new Date(interpretation.endTime!) : undefined,
  };

  return { rooms: await listRooms(listQuery), degraded: false };
}
