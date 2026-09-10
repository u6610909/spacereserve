import { get } from './client';
import type { AuditLogEntry, UtilizationStats } from './types';

export function auditLogs(limit = 100): Promise<{ auditLogs: AuditLogEntry[] }> {
  return get(`/admin/audit-logs?limit=${limit}`);
}

export function utilizationStats(): Promise<UtilizationStats> {
  return get('/admin/stats/utilization');
}
