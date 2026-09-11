export type Role = 'STUDENT' | 'STAFF' | 'ADMIN';
export type RoomStatus = 'AVAILABLE' | 'OUT_OF_ORDER';
export type ReservationStatus = 'CONFIRMED' | 'CANCELLED' | 'OVERRIDDEN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Room {
  id: string;
  code: string | null;
  name: string;
  building: string;
  capacity: number;
  amenities: string[];
  status: RoomStatus;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationAttendee {
  id: string;
  reservationId: string;
  userId: string;
  invitedAt: string;
}

export interface Reservation {
  id: string;
  roomId: string;
  organizerId: string;
  startTime: string;
  endTime: string;
  purpose: string | null;
  status: ReservationStatus;
  createdAt: string;
  updatedAt: string;
  room: Room;
  organizer: User;
  attendees: ReservationAttendee[];
}

export interface LostItemNotice {
  itemId: string;
  description: string;
  reportedAt: string;
}

export interface CheckInResult {
  reservation: Reservation;
  lostItemNotice: LostItemNotice[] | null;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  metadata: unknown;
  createdAt: string;
  actor: User | null;
}

export interface RoomUtilization {
  roomId: string;
  name: string;
  building: string;
  reservationCount: number;
  totalBookedHours: number;
}

export interface UtilizationStats {
  rooms: RoomUtilization[];
  totals: {
    totalRooms: number;
    totalReservations: number;
    totalBookedHours: number;
  };
}

export interface SystemOverview {
  usersByRole: Record<Role, number>;
  rooms: { available: number; outOfOrder: number };
  reservations: { upcoming: number };
  apiKeys: { name: string; lastUsedAt: string | null }[];
}
