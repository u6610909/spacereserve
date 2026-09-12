import { getPrisma } from '../../lib/prisma';
import { lookupLostItems } from '../../integrations/finderai';

import type { LostItemNotice } from '../../integrations/finderai';

export interface LostItemWithRoom extends LostItemNotice {
  roomId: string;
  roomName: string;
}

/**
 * Site-wide "Lost & Found" — FinderAI's contract is location-scoped only (no
 * "all items" endpoint), so this fans out lookupLostItems() across every
 * room in parallel and flattens the results. Cheap on repeat loads: each
 * room name is cached 60s by the integration already, so this only ever
 * pays the full fan-out cost once a minute, not per page view. A room whose
 * lookup fails (FinderAI down, circuit open) just contributes nothing —
 * never turns the whole page into an error.
 */
export async function listAllLostItems(): Promise<LostItemWithRoom[]> {
  const rooms = await getPrisma().room.findMany({ select: { id: true, name: true } });

  const perRoom = await Promise.all(
    rooms.map(async (room): Promise<LostItemWithRoom[]> => {
      const items = await lookupLostItems(room.name);
      return (items ?? []).map((item) => ({ ...item, roomId: room.id, roomName: room.name }));
    }),
  );

  return perRoom.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
