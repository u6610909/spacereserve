import { getPrisma } from '../../lib/prisma';

export interface ActiveBookingResponse {
  room: string;
  at: string;
  reservation: {
    id: string;
    startTime: string;
    endTime: string;
    organizer: { name: string; email: string };
    attendeeCount: number;
  } | null;
}

/**
 * FinderAI calls this to learn who had a room booked at a given instant
 * (MASTER_PROMPT §7 — "they call us"). Returns the minimum personal data
 * needed, and `{ reservation: null }` both when nobody had it and when the
 * room name doesn't match one of ours — not distinguishing the two avoids
 * leaking whether a room name exists to an unauthenticated-beyond-the-key
 * caller.
 */
export async function getActiveBookingAt(roomName: string, at: Date): Promise<ActiveBookingResponse> {
  const room = await getPrisma().room.findUnique({ where: { name: roomName } });

  const reservation = room
    ? await getPrisma().reservation.findFirst({
        where: { roomId: room.id, status: 'CONFIRMED', startTime: { lte: at }, endTime: { gt: at } },
        include: { organizer: true, attendees: true },
      })
    : null;

  return {
    room: roomName,
    at: at.toISOString(),
    reservation: reservation
      ? {
          id: reservation.id,
          startTime: reservation.startTime.toISOString(),
          endTime: reservation.endTime.toISOString(),
          organizer: { name: reservation.organizer.name, email: reservation.organizer.email },
          attendeeCount: reservation.attendees.length,
        }
      : null,
  };
}
