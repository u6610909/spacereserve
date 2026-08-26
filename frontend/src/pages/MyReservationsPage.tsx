import { useState } from 'react';

import type { Reservation } from '../api/types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../auth/AuthContext';
import { useCancelReservation, useCheckIn, useMyReservations, useRemoveAttendee } from '../hooks/useReservations';

function statusTone(status: Reservation['status']) {
  if (status === 'CONFIRMED') return 'green' as const;
  if (status === 'OVERRIDDEN') return 'amber' as const;
  return 'neutral' as const;
}

function ReservationCard({ reservation }: { reservation: Reservation }) {
  const { user } = useAuth();
  const cancel = useCancelReservation();
  const checkIn = useCheckIn();
  const removeAttendee = useRemoveAttendee();
  const [checkInError, setCheckInError] = useState<unknown>(null);
  const [checkInResult, setCheckInResult] = useState<{ items: number } | null>(null);

  const isOrganizer = user?.id === reservation.organizerId;
  const start = new Date(reservation.startTime);
  const end = new Date(reservation.endTime);

  async function handleCheckIn() {
    setCheckInError(null);
    try {
      const result = await checkIn.mutateAsync(reservation.id);
      setCheckInResult({ items: result.lostItemNotice?.length ?? 0 });
    } catch (err) {
      setCheckInError(err);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-slate-900">{reservation.room.name}</div>
          <div className="text-xs text-slate-500">{reservation.room.building}</div>
        </div>
        <Badge tone={statusTone(reservation.status)}>{reservation.status}</Badge>
      </div>
      <div className="text-sm text-slate-600">
        {start.toLocaleString()} – {end.toLocaleTimeString()}
      </div>
      {reservation.purpose && <div className="text-sm text-slate-500">{reservation.purpose}</div>}
      {!isOrganizer && <div className="text-xs text-slate-400">Organized by {reservation.organizer.name}</div>}

      {reservation.attendees.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {reservation.attendees.map((a) => (
            <li key={a.id} className="flex items-center gap-1 rounded bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
              {a.userId === user?.id ? 'You' : `Attendee ${a.userId.slice(0, 8)}`}
              {isOrganizer && (
                <button
                  type="button"
                  onClick={() => removeAttendee.mutate({ id: reservation.id, userId: a.userId })}
                  className="text-slate-400 hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {reservation.status === 'CONFIRMED' && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {isOrganizer && (
            <Button type="button" variant="secondary" onClick={() => void handleCheckIn()} disabled={checkIn.isPending}>
              {checkIn.isPending ? 'Checking in…' : 'Check in'}
            </Button>
          )}
          {(isOrganizer || user?.role === 'STAFF' || user?.role === 'ADMIN') && (
            <Button type="button" variant="danger" onClick={() => cancel.mutate(reservation.id)} disabled={cancel.isPending}>
              Cancel
            </Button>
          )}
        </div>
      )}

      {checkInResult && (
        <p className="text-xs text-emerald-600">
          Checked in.{' '}
          {checkInResult.items > 0
            ? `${checkInResult.items} lost item(s) reported near this room.`
            : 'No lost items reported near this room.'}
        </p>
      )}
      <ErrorBanner error={checkInError} />
      <ErrorBanner error={cancel.error} />
    </div>
  );
}

export function MyReservationsPage() {
  const { data, isLoading, error } = useMyReservations();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">My Reservations</h1>
        <p className="text-sm text-slate-500">Rooms you've booked or been invited to.</p>
      </div>

      <ErrorBanner error={error} />
      {isLoading ? (
        <Spinner />
      ) : !data || data.reservations.length === 0 ? (
        <p className="text-sm text-slate-500">No reservations yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.reservations.map((r) => (
            <ReservationCard key={r.id} reservation={r} />
          ))}
        </div>
      )}
    </div>
  );
}
