import { del, get, post } from './client';
import type { AuditLogEntry, IssuedPeerKey, PeerIntegration, SystemOverview, UtilizationStats } from './types';

export function auditLogs(limit = 100): Promise<{ auditLogs: AuditLogEntry[] }> {
  return get(`/admin/audit-logs?limit=${limit}`);
}

export function utilizationStats(): Promise<UtilizationStats> {
  return get('/admin/stats/utilization');
}

export function systemOverview(): Promise<SystemOverview> {
  return get('/admin/stats/overview');
}

export function issuePeerKey(name: string): Promise<IssuedPeerKey> {
  return post('/admin/peer-keys', { name });
}

export function peerIntegrations(): Promise<{ peerIntegrations: PeerIntegration[] }> {
  return get('/admin/peer-integrations');
}

export interface CreatePeerIntegrationInput {
  name: string;
  baseUrl: string;
  apiKey: string;
  notes?: string;
}

export function createPeerIntegration(
  input: CreatePeerIntegrationInput,
): Promise<{ peerIntegration: PeerIntegration }> {
  return post('/admin/peer-integrations', input);
}

export function deletePeerIntegration(id: string): Promise<void> {
  return del(`/admin/peer-integrations/${id}`);
}
