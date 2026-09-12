import { get } from './client';
import type { LostItemNotice } from './types';

export interface LostItemWithRoom extends LostItemNotice {
  roomId: string;
  roomName: string;
}

/** Site-wide, sourced from FinderAI across every room — see docs/peer-api.md. */
export function listLostItems(): Promise<{ items: LostItemWithRoom[] }> {
  return get('/lost-items');
}
