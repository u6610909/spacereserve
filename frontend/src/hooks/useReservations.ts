import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as reservationsApi from '../api/reservations';
import type { CreateReservationInput } from '../api/reservations';

export function useMyReservations() {
  return useQuery({
    queryKey: ['reservations', 'mine'],
    queryFn: () => reservationsApi.listMine(),
  });
}

function useInvalidateReservations() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['reservations'] });
    // A booking/cancel changes room availability too.
    void queryClient.invalidateQueries({ queryKey: ['rooms'] });
  };
}

export function useCreateReservation() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: (input: CreateReservationInput) => reservationsApi.createReservation(input),
    onSuccess: invalidate,
  });
}

export function useCancelReservation() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: (id: string) => reservationsApi.cancelReservation(id),
    onSuccess: invalidate,
  });
}

export function useCheckIn() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: (id: string) => reservationsApi.checkIn(id),
    onSuccess: invalidate,
  });
}

export function useAddAttendee() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => reservationsApi.addAttendee(id, userId),
    onSuccess: invalidate,
  });
}

export function useRemoveAttendee() {
  const invalidate = useInvalidateReservations();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => reservationsApi.removeAttendee(id, userId),
    onSuccess: invalidate,
  });
}
