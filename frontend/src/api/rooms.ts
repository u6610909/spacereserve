import { del, get, patch, post, postForm } from './client';
import type { LostItemNotice, Room, RoomStatus } from './types';

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

export interface RoomBusyInterval {
  startTime: string;
  endTime: string;
}

export interface RoomAvailabilityEntry {
  roomId: string;
  busy: RoomBusyInterval[];
}

/** Busy intervals for every room on one Bangkok calendar date, in a single
 * request — the room browse grid needs this per-card, and one call per room
 * would be an N+1. A room absent from `rooms` is free all day. */
export function roomsAvailability(date: string): Promise<{ date: string; rooms: RoomAvailabilityEntry[] }> {
  return get(`/rooms/availability?date=${date}`);
}

export interface RoomScheduleEntry {
  startTime: string;
  endTime: string;
  organizerName: string;
  attendeeNames: string[];
}

/** One room's bookings for a Bangkok calendar date — names only, no email,
 * for the "who's in here today" view on the room detail page. */
export function roomSchedule(roomId: string, date: string): Promise<{ date: string; bookings: RoomScheduleEntry[] }> {
  return get(`/rooms/${roomId}/schedule?date=${date}`);
}

/** Same FinderAI lookup check-in uses, callable any time someone views the
 * room — not gated on booking first. `items: null` means FinderAI couldn't
 * be reached, not that nothing was found. */
export function roomLostItems(roomId: string): Promise<{ items: LostItemNotice[] | null }> {
  return get(`/rooms/${roomId}/lost-items`);
}
