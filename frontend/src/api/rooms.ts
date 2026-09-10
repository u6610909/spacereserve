import { del, get, patch, post, postForm } from './client';
import type { Room, RoomStatus } from './types';

export interface RoomFilters {
  capacity?: number;
  building?: string;
  amenities?: string[];
  availableFrom?: string;
  availableTo?: string;
}

function toQueryString(filters: RoomFilters): string {
  const params = new URLSearchParams();
  if (filters.capacity) params.set('capacity', String(filters.capacity));
  if (filters.building) params.set('building', filters.building);
  if (filters.amenities && filters.amenities.length > 0) params.set('amenities', filters.amenities.join(','));
  if (filters.availableFrom) params.set('availableFrom', filters.availableFrom);
  if (filters.availableTo) params.set('availableTo', filters.availableTo);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listRooms(filters: RoomFilters = {}): Promise<{ rooms: Room[] }> {
  return get(`/rooms${toQueryString(filters)}`);
}

export function getRoom(id: string): Promise<{ room: Room }> {
  return get(`/rooms/${id}`);
}

export interface RoomInput {
  name: string;
  building: string;
  capacity: number;
  amenities: string[];
  status?: RoomStatus;
}

export function createRoom(input: RoomInput): Promise<{ room: Room }> {
  return post('/rooms', input);
}

export function updateRoom(id: string, input: Partial<RoomInput>): Promise<{ room: Room }> {
  return patch(`/rooms/${id}`, input);
}

export function setRoomStatus(id: string, status: RoomStatus): Promise<{ room: Room }> {
  return patch(`/rooms/${id}/status`, { status });
}

export function deleteRoom(id: string): Promise<void> {
  return del(`/rooms/${id}`);
}

export function uploadRoomImage(id: string, file: File): Promise<{ room: Room }> {
  const formData = new FormData();
  formData.set('image', file);
  return postForm(`/rooms/${id}/image`, formData);
}

export function deleteRoomImage(id: string): Promise<{ room: Room }> {
  return del(`/rooms/${id}/image`);
}
