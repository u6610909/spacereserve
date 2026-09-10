import { useQuery } from '@tanstack/react-query';

import * as adminApi from '../api/admin';

export function useAuditLogs(limit = 100) {
  return useQuery({
    queryKey: ['admin', 'audit-logs', limit],
    queryFn: () => adminApi.auditLogs(limit),
  });
}

export function useUtilization() {
  return useQuery({
    queryKey: ['admin', 'utilization'],
    queryFn: () => adminApi.utilizationStats(),
  });
}
