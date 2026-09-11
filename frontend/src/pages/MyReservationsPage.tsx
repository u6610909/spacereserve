import { useState } from 'react';

import type { Reservation } from '../api/types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../auth/AuthContext';
import { formatReservationWindow, isPast } from '../lib/format';
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
  const past = isPast(reservation.endTime);
  const canCheckIn = isOrganizer && reservation.status === 'CONFIRMED' && !past;
  const canCancel =
    reservation.status === 'CONFIRMED' &&
    !past &&
    (isOrganizer || user?.role === 'STAFF' || user?.role === 'ADMIN');

  const otherAttendees = reservation.attendees.filter((a) => a.userId !== user?.id);
  const youAreAttendee = reservation.attendees.some((a) => a.userId === user?.id);

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
    <div
      className={`flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-4 ${past ? 'opacity-75' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-900">{reservation.room.name}</div>
          <div className="text-xs text-slate-500">{reservation.room.building}</div>
        </div>
        <Badge tone={statusTone(reservation.status)}>{reservation.status.toLowerCase()}</Badge>
      </div>

      <div className="text-sm font-medium text-slate-700">
        {formatReservationWindow(reservation.startTime, reservation.endTime)}
      </div>
      {reservation.purpose && <div className="text-sm text-slate-500">{reservation.purpose}</div>}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {!isOrganizer && <span>Organised by {reservation.organizer.name}</span>}
        {isOrganizer && (
          <span>
            {reservation.attendees.length === 0
              ? 'Just you'
              : `You + ${reservation.attendees.length} ${
                  reservation.attendees.length === 1 ? 'guest' : 'guests'
                }`}
          </span>
        )}
        {!isOrganizer && youAreAttendee && otherAttendees.length > 0 && (
          <span>
            You + {otherAttendees.length} {otherAttendees.length === 1 ? 'other' : 'others'}
          </span>
        )}
      </div>

      {isOrganizer && reservation.attendees.length > 0 && !past && (
        <ul className="flex flex-wrap gap-1.5">
          {reservation.attendees.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
            >
              guest
              <button
                type="button"
                aria-label="Remove attendee"
                onClick={() => removeAttendee.mutate({ id: reservation.id, userId: a.userId })}
                className="-mr-0.5 rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(canCheckIn || canCancel) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {canCheckIn && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleCheckIn()}
              disabled={checkIn.isPending}
            >
              {checkIn.isPending ? 'Checking in…' : 'Check in'}
            </Button>
          )}
          {canCancel && (
            <Button
              type="button"
              variant="danger"
              onClick={() => cancel.mutate(reservation.id)}
              disabled={cancel.isPending}
            >
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

  const all = data?.reservations ?? [];
  const upcoming = all.filter((r) => !isPast(r.endTime)).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const past = all.filter((r) => isPast(r.endTime)).sort((a, b) => b.startTime.localeCompare(a.startTime));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-slate-900">My reservations</h1>
        <p className="mt-1 text-sm text-slate-500">Rooms you&apos;ve booked or been invited to.</p>
      </div>

      <ErrorBanner error={error} />

      {isLoading ? (
        <Spinner />
      ) : all.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">Nothing booked yet</p>
          <p className="mt-1 text-sm text-slate-500">Find a room and reserve it — it&apos;ll show up here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Upcoming ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-400">No upcoming reservations.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {upcoming.map((r) => (
                  <ReservationCard key={r.id} reservation={r} />
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Past ({past.length})</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {past.map((r) => (
                  <ReservationCard key={r.id} reservation={r} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
