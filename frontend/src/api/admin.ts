import { del, get, post } from './client';
import type {
  AuditLogEntry,
  IssuedPeerKey,
  PeerIntegration,
  ReservationSearchResult,
  SystemOverview,
  UtilizationStats,
} from './types';

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

export function deletePeerKey(id: string): Promise<void> {
  return del(`/admin/peer-keys/${id}`);
}

export function peerIntegrations(): Promise<{ peerIntegrations: PeerIntegration[] }> {
  return get('/admin/peer-integrations');
}

export function revealPeerIntegrationKey(id: string): Promise<{ apiKey: string }> {
  return get(`/admin/peer-integrations/${id}/reveal`);
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

export interface ReservationSearchInput {
  q?: string;
  from?: string;
  to?: string;
}

export function searchReservations(input: ReservationSearchInput): Promise<{ reservations: ReservationSearchResult[] }> {
  const params = new URLSearchParams();
  if (input.q) params.set('q', input.q);
  if (input.from) params.set('from', input.from);
  if (input.to) params.set('to', input.to);
  const qs = params.toString();
  return get(`/admin/reservations${qs ? `?${qs}` : ''}`);
}
