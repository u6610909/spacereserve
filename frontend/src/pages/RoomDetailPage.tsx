import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { searchUserByEmail } from '../api/users';
import type { UserLookupResult } from '../api/users';
import { AmenityIcon } from '../components/ui/AmenityIcon';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Input } from '../components/ui/Input';
import { RoomImage } from '../components/ui/RoomImage';
import { Spinner } from '../components/ui/Spinner';
import { useCreateReservation } from '../hooks/useReservations';
import { useRoom } from '../hooks/useRooms';

interface Invitee extends UserLookupResult {}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 shrink-0">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"
      />
      <circle cx="12" cy="9.5" r="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 shrink-0">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 21v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 19.5V21M21 21v-1.5a3.5 3.5 0 0 0-2.5-3.35M14.5 4.16a3.5 3.5 0 0 1 0 6.68M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
      />
    </svg>
  );
}

function AttendeeInvite({
  invitees,
  onAdd,
  onRemove,
}: {
  invitees: Invitee[];
  onAdd: (u: Invitee) => void;
  onRemove: (id: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [notFound, setNotFound] = useState(false);
  const lookup = useMutation({
    mutationFn: (e: string) => searchUserByEmail(e),
    onSuccess: (res) => {
      if (res.users.length === 0) {
        setNotFound(true);
        return;
      }
      setNotFound(false);
      onAdd(res.users[0]!);
      setEmail('');
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-700">Invite attendees</span>
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="attendee@au.edu"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setNotFound(false);
          }}
          className="flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!email || lookup.isPending}
          onClick={() => lookup.mutate(email)}
        >
          Add
        </Button>
      </div>
      {notFound && <p className="text-xs text-red-600">No SpaceReserve user with that email.</p>}
      {invitees.length > 0 && (
        <ul className="flex flex-col gap-1">
          {invitees.map((u) => (
            <li key={u.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-sm">
              <span>
                {u.name} <span className="text-slate-400">({u.email})</span>
              </span>
              <button type="button" onClick={() => onRemove(u.id)} className="text-slate-400 hover:text-red-600">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RoomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useRoom(id);
  const createReservation = useCreateReservation();

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [purpose, setPurpose] = useState('');
  const [invitees, setInvitees] = useState<Invitee[]>([]);

  if (isLoading) return <Spinner label="Loading room…" />;
  if (error || !data) return <ErrorBanner error={error ?? 'Room not found'} />;

  const { room } = data;
  const isAvailable = room.status === 'AVAILABLE';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !startTime) return;
    const start = new Date(`${date}T${startTime}`);
    const end = new Date(start.getTime() + durationMinutes * 60_000);

    await createReservation.mutateAsync({
      roomId: room.id,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      purpose: purpose || undefined,
      attendeeIds: invitees.map((u) => u.id),
    });
    navigate('/reservations');
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/rooms" className="text-sm text-brand-600 hover:underline">
        ← Back to rooms
      </Link>

      <RoomImage src={room.imageUrl} alt={room.name} aspect="aspect-[16/9]" rounded="rounded-xl" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Details — left, wider column, like a hotel listing's info panel */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{room.name}</h1>
              <Badge tone={isAvailable ? 'green' : 'red'}>{isAvailable ? 'Available' : 'Out of order'}</Badge>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <PinIcon />
              {room.building} building
            </div>
          </div>

          <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
            <PeopleIcon />
            Fits up to {room.capacity} {room.capacity === 1 ? 'person' : 'people'}
          </div>

          <p className="text-sm leading-relaxed text-slate-600">
            A {room.building}-building space that comfortably seats up to {room.capacity}
            {room.amenities.length > 0 && <> — equipped with {formatAmenityList(room.amenities)}</>}.
          </p>

          {room.amenities.length > 0 && (
            <div className="border-t border-slate-200 pt-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">What this room offers</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                {room.amenities.map((a) => (
                  <div key={a} className="flex items-center gap-2 text-sm capitalize text-slate-700">
                    <AmenityIcon amenity={a} className="h-4.5 w-4.5 text-brand-600" />
                    {a}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Booking card — right, sticky, the "reserve" widget */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {isAvailable ? (
              <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
                <h2 className="text-base font-semibold text-slate-900">Reserve this room</h2>
                <div className="flex gap-2">
                  <Input type="date" label="Date" required value={date} onChange={(e) => setDate(e.target.value)} />
                  <Input
                    type="time"
                    label="Start"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <Input
                  type="number"
                  label="Duration (minutes, max 240)"
                  min={15}
                  max={240}
                  step={15}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
                <Input label="Purpose (optional)" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
                <AttendeeInvite
                  invitees={invitees}
                  onAdd={(u) => setInvitees((prev) => [...prev, u])}
                  onRemove={(uid) => setInvitees((prev) => prev.filter((u) => u.id !== uid))}
                />
                <ErrorBanner error={createReservation.error} />
                <Button type="submit" className="w-full" disabled={createReservation.isPending}>
                  {createReservation.isPending ? 'Booking…' : 'Book room'}
                </Button>
              </form>
            ) : (
              <>
                <h2 className="text-base font-semibold text-slate-900">Reserve this room</h2>
                <p className="mt-2 text-sm text-red-600">
                  This room is currently out of order and can&apos;t be booked.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAmenityList(amenities: string[]): string {
  if (amenities.length === 1) return amenities[0]!;
  if (amenities.length === 2) return `${amenities[0]} and ${amenities[1]}`;
  return `${amenities.slice(0, -1).join(', ')}, and ${amenities.at(-1)}`;
}
