import { post } from './client';
import type { Room } from './types';

export interface NaturalSearchResult {
  rooms: Room[];
  degraded: boolean;
}

export function naturalSearch(query: string): Promise<NaturalSearchResult> {
  return post('/search/natural', { query });
}
