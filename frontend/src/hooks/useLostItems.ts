import { useQuery } from '@tanstack/react-query';

import { listLostItems } from '../api/lostItems';

export function useLostItems() {
  return useQuery({
    queryKey: ['lost-items'],
    queryFn: () => listLostItems(),
  });
}
