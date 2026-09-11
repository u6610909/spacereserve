import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as adminApi from '../api/admin';
import type { CreatePeerIntegrationInput } from '../api/admin';

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

export function useSystemOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => adminApi.systemOverview(),
  });
}

export function useIssuePeerKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => adminApi.issuePeerKey(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
  });
}

export function usePeerIntegrations() {
  return useQuery({
    queryKey: ['admin', 'peer-integrations'],
    queryFn: () => adminApi.peerIntegrations(),
  });
}

function useInvalidatePeerIntegrations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['admin', 'peer-integrations'] });
}

export function useCreatePeerIntegration() {
  const invalidate = useInvalidatePeerIntegrations();
  return useMutation({
    mutationFn: (input: CreatePeerIntegrationInput) => adminApi.createPeerIntegration(input),
    onSuccess: invalidate,
  });
}

export function useDeletePeerIntegration() {
  const invalidate = useInvalidatePeerIntegrations();
  return useMutation({
    mutationFn: (id: string) => adminApi.deletePeerIntegration(id),
    onSuccess: invalidate,
  });
}
