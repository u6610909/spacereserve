import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as roomsApi from '../api/rooms';
import type { RoomFilters, RoomInput } from '../api/rooms';
import type { RoomStatus } from '../api/types';

export function useRooms(filters: RoomFilters) {
  return useQuery({
    queryKey: ['rooms', filters],
    queryFn: () => roomsApi.listRooms(filters),
  });
}

export function useRoom(id: string | undefined) {
  return useQuery({
    queryKey: ['rooms', id],
    queryFn: () => roomsApi.getRoom(id!),
    enabled: Boolean(id),
  });
}

export function useRoomsAvailability(date: string) {
  return useQuery({
    queryKey: ['rooms', 'availability', date],
    queryFn: () => roomsApi.roomsAvailability(date),
  });
}

export function useRoomSchedule(roomId: string | undefined, date: string) {
  return useQuery({
    queryKey: ['rooms', roomId, 'schedule', date],
    queryFn: () => roomsApi.roomSchedule(roomId!, date),
    enabled: Boolean(roomId),
  });
}

export function useRoomLostItems(roomId: string | undefined) {
  return useQuery({
    queryKey: ['rooms', roomId, 'lost-items'],
    queryFn: () => roomsApi.roomLostItems(roomId!),
    enabled: Boolean(roomId),
  });
}

function useInvalidateRooms() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['rooms'] });
}

export function useCreateRoom() {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: (input: RoomInput) => roomsApi.createRoom(input),
    onSuccess: invalidate,
  });
}

export function useUpdateRoom() {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<RoomInput> }) => roomsApi.updateRoom(id, input),
    onSuccess: invalidate,
  });
}

export function useSetRoomStatus() {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: RoomStatus }) => roomsApi.setRoomStatus(id, status),
    onSuccess: invalidate,
  });
}

export function useDeleteRoom() {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: (id: string) => roomsApi.deleteRoom(id),
    onSuccess: invalidate,
  });
}

export function useUploadRoomImage() {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => roomsApi.uploadRoomImage(id, file),
    onSuccess: invalidate,
  });
}

export function useDeleteRoomImage() {
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: (id: string) => roomsApi.deleteRoomImage(id),
    onSuccess: invalidate,
  });
}
