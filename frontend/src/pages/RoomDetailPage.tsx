import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { searchUserByEmail } from '../api/users';
import type { UserLookupResult } from '../api/users';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Input } from '../components/ui/Input';
import { RoomImage } from '../components/ui/RoomImage';
import { Spinner } from '../components/ui/Spinner';
import { useCreateReservation } from '../hooks/useReservations';
import { useRoom } from '../hooks/useRooms';

interface Invitee extends UserLookupResult {}

function AttendeeInvite({ invitees, onAdd, onRemove }: {
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
    <div className="flex flex-col gap-6">
      <Link to="/rooms" className="text-sm text-brand-600 hover:underline">
        ← Back to rooms
      </Link>

      <RoomImage src={room.imageUrl} alt={room.name} className="max-w-md" />

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900">{room.name}</h1>
          <Badge tone={room.status === 'AVAILABLE' ? 'green' : 'red'}>
            {room.status === 'AVAILABLE' ? 'Available' : 'Out of order'}
          </Badge>
        </div>
        <p className="text-sm text-slate-500">
          {room.building} · Capacity {room.capacity}
        </p>
        {room.amenities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {room.amenities.map((a) => (
              <Badge key={a} tone="neutral">
                {a}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {room.status === 'OUT_OF_ORDER' ? (
        <p className="text-sm text-red-600">This room is out of order and can't be booked.</p>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="flex max-w-md flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Book this room</h2>
          <div className="flex gap-2">
            <Input type="date" label="Date" required value={date} onChange={(e) => setDate(e.target.value)} />
            <Input type="time" label="Start" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
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
          <Button type="submit" disabled={createReservation.isPending}>
            {createReservation.isPending ? 'Booking…' : 'Book room'}
          </Button>
        </form>
      )}
    </div>
  );
}
