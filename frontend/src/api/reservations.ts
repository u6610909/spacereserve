import { del, get, post } from './client';
import type { CheckInResult, Reservation } from './types';

export interface CreateReservationInput {
  roomId: string;
  startTime: string;
  endTime: string;
  purpose?: string;
  attendeeIds?: string[];
}

export function createReservation(input: CreateReservationInput): Promise<{ reservation: Reservation }> {
  return post('/reservations', input);
}

export function listMine(): Promise<{ reservations: Reservation[] }> {
  return get('/reservations/mine');
}

export function getReservation(id: string): Promise<{ reservation: Reservation }> {
  return get(`/reservations/${id}`);
}

export function cancelReservation(id: string): Promise<void> {
  return del(`/reservations/${id}`);
}

export function overrideReservation(id: string): Promise<{ reservation: Reservation }> {
  return post(`/reservations/${id}/override`);
}

export function checkIn(id: string): Promise<CheckInResult> {
  return post(`/reservations/${id}/check-in`);
}

export function addAttendee(id: string, userId: string): Promise<void> {
  return post(`/reservations/${id}/attendees`, { userId });
}

export function removeAttendee(id: string, userId: string): Promise<void> {
  return del(`/reservations/${id}/attendees/${userId}`);
}
