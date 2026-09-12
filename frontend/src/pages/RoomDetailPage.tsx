import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { searchUserByEmail } from '../api/users';
import type { RoomBusyInterval } from '../api/rooms';
import type { UserLookupResult } from '../api/users';
import { AmenityIcon } from '../components/ui/AmenityIcon';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Input } from '../components/ui/Input';
import { RoomImage } from '../components/ui/RoomImage';
import { Spinner } from '../components/ui/Spinner';
import {
  bangkokDateOf,
  bangkokDateTimeToIso,
  formatBangkokTime,
  generateTimeSlots,
  MAX_SLOT_COUNT,
  maxBookableDateBangkok,
  todayBangkok,
} from '../lib/bangkokTime';
import { amenityLabel } from '../lib/amenities';
import { formatDateTime } from '../lib/format';
import { useCreateReservation } from '../hooks/useReservations';
import { useRoom, useRoomLostItems, useRoomSchedule } from '../hooks/useRooms';
import type { TimeSlot } from '../lib/bangkokTime';

type Invitee = UserLookupResult;

interface Selection {
  startIdx: number;
  length: number;
}

const TIME_SLOTS = generateTimeSlots();
const MAX_ADVANCE_DAYS = 14;

function slotStartMs(date: string, slot: TimeSlot): number {
  return new Date(bangkokDateTimeToIso(date, slot.startLabel)).getTime();
}

function slotEndMs(date: string, slot: TimeSlot): number {
  return new Date(bangkokDateTimeToIso(date, slot.endLabel)).getTime();
}

function isSlotBusy(date: string, slot: TimeSlot, busy: RoomBusyInterval[], now: number): boolean {
  const start = slotStartMs(date, slot);
  const end = slotEndMs(date, slot);
  if (start <= now) return true; // can't book a slot that's already started/passed
  return busy.some((b) => start < new Date(b.endTime).getTime() && end > new Date(b.startTime).getTime());
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
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
              <button
                type="button"
                onClick={() => onRemove(u.id)}
                aria-label={`Remove ${u.name}`}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TodaysSchedule({ roomId, date }: { roomId: string; date: string }) {
  const schedule = useRoomSchedule(roomId, date);

  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase text-slate-500">Booked on this day</div>
      {schedule.isLoading ? (
        <Spinner label="Checking the schedule…" />
      ) : schedule.data && schedule.data.bookings.length === 0 ? (
        <p className="text-sm text-emerald-700">Free all day so far.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {schedule.data?.bookings.map((b, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-sm">
              <Avatar name={b.organizerName} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-800">{b.organizerName}</div>
                <div className="text-xs text-slate-500">
                  {formatBangkokTime(b.startTime)}–{formatBangkokTime(b.endTime)}
                  {b.attendeeNames.length > 0 && (
                    <span title={b.attendeeNames.join(', ')}> · +{b.attendeeNames.length} invited</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TimeSlotGrid({
  date,
  busy,
  selection,
  onSelect,
}: {
  date: string;
  busy: RoomBusyInterval[];
  selection: Selection | null;
  onSelect: (index: number, busy: boolean) => void;
}) {
  // Snapshotted once on mount, not read fresh on every render — a slot only
  // needs to flip from bookable to past at a coarse grain.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-time snapshot
  const now = useMemo(() => Date.now(), []);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase text-slate-500">Pick a time (max 2 hours)</span>
        <span className="text-xs text-slate-400">09:00–20:00</span>
      </div>
      <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
        {TIME_SLOTS.map((slot) => {
          const taken = isSlotBusy(date, slot, busy, now);
          const selected =
            selection !== null && slot.index >= selection.startIdx && slot.index < selection.startIdx + selection.length;
          return (
            <button
              key={slot.index}
              type="button"
              disabled={taken}
              title={`${slot.startLabel}–${slot.endLabel}`}
              onClick={() => onSelect(slot.index, taken)}
              className={`rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                taken
                  ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                  : selected
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50'
              }`}
            >
              {slot.startLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Pulled from FinderAI on every view — not pushed to us, so a fresh item
 * only shows up the next time someone loads this room's page (cached 60s
 * server-side). `null` (FinderAI unreachable) and an empty list both render
 * nothing — this is a heads-up when there's something to say, not a status
 * indicator that must always show. */
function LostItemsNotice({ roomId }: { roomId: string }) {
  const lostItems = useRoomLostItems(roomId);
  const items = lostItems.data?.items;

  if (!items || items.length === 0) return null;

  return (
    <div className="border-t border-slate-200 pt-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Reported lost near this room</h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-amber-900">{item.title}</span>
              <span className="text-xs font-medium uppercase text-amber-700">{item.category}</span>
            </div>
            <p className="mt-0.5 text-sm text-amber-800">{item.description}</p>
            <p className="mt-1 text-xs text-amber-600">Reported {formatDateTime(item.createdAt)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RoomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useRoom(id);
  const createReservation = useCreateReservation();

  const [date, setDate] = useState(todayBangkok());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [purpose, setPurpose] = useState('');
  const [invitees, setInvitees] = useState<Invitee[]>([]);

  // A slot's meaning is date-scoped (busy/free depends on the day), so
  // switching dates clears any selection. Reset during render rather than
  // in an effect — no need for the extra render pass an effect would add.
  const [selectionDate, setSelectionDate] = useState(date);
  if (date !== selectionDate) {
    setSelectionDate(date);
    setSelection(null);
  }

  const schedule = useRoomSchedule(id, date);
  const busy = useMemo(() => schedule.data?.bookings.map((b) => ({ startTime: b.startTime, endTime: b.endTime })) ?? [], [schedule.data]);

  if (isLoading) return <Spinner label="Loading room…" />;
  if (error || !data) return <ErrorBanner error={error ?? 'Room not found'} />;

  const { room } = data;
  const isAvailable = room.status === 'AVAILABLE';
  const returnDateBangkok = room.outOfOrderUntil ? bangkokDateOf(room.outOfOrderUntil) : null;
  // A known return date only blocks dates before it — same rule the backend
  // enforces in reservations.service.ts. No return date means every date
  // stays blocked while OUT_OF_ORDER.
  const bookableOnSelectedDate = isAvailable || (returnDateBangkok !== null && date >= returnDateBangkok);
  const maxDate = maxBookableDateBangkok(MAX_ADVANCE_DAYS);

  function handleSlotSelect(index: number, taken: boolean) {
    if (taken) return;
    setSelection((prev) => {
      if (!prev) return { startIdx: index, length: 1 };
      const lastIdx = prev.startIdx + prev.length - 1;
      if (index === lastIdx && prev.length > 1) return { ...prev, length: prev.length - 1 };
      if (index === prev.startIdx && prev.length > 1) return { startIdx: prev.startIdx + 1, length: prev.length - 1 };
      if (index === lastIdx + 1 && prev.length < MAX_SLOT_COUNT) return { ...prev, length: prev.length + 1 };
      if (index === prev.startIdx - 1 && prev.length < MAX_SLOT_COUNT) return { startIdx: index, length: prev.length + 1 };
      return { startIdx: index, length: 1 };
    });
  }

  const selectedStart = selection ? TIME_SLOTS[selection.startIdx] : undefined;
  const selectedEnd = selection ? TIME_SLOTS[selection.startIdx + selection.length - 1] : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStart || !selectedEnd) return;

    await createReservation.mutateAsync({
      roomId: room.id,
      startTime: bangkokDateTimeToIso(date, selectedStart.startLabel),
      endTime: bangkokDateTimeToIso(date, selectedEnd.endLabel),
      purpose: purpose || undefined,
      attendeeIds: invitees.map((u) => u.id),
    });
    navigate('/reservations');
  }

  return (
    <div className="flex flex-col gap-5">
      <nav className="text-sm text-slate-500">
        <Link to="/rooms" className="text-brand-600 hover:underline">
          Rooms
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-600">{room.name}</span>
      </nav>

      <RoomImage src={room.imageUrl} alt={room.name} aspect="aspect-[16/9]" rounded="rounded-xl" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-semibold text-slate-900">{room.name}</h1>
              {room.code && (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">
                  {room.code}
                </span>
              )}
              {!isAvailable && (
                <Badge tone="red">
                  Out of order{returnDateBangkok ? ` until ${returnDateBangkok}` : ''}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <PinIcon />
              {room.building}
            </div>
          </div>

          <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
            <PeopleIcon />
            Seats up to {room.capacity} {room.capacity === 1 ? 'person' : 'people'}
          </div>

          <p className="text-sm leading-relaxed text-slate-600">
            A room in {room.building}, seating up to {room.capacity}
            {room.amenities.length > 0 && <> — set up with {formatAmenityList(room.amenities)}</>}.
          </p>

          {room.amenities.length > 0 && (
            <div className="border-t border-slate-200 pt-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">What this room offers</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                {room.amenities.map((a) => (
                  <div key={a} className="flex items-center gap-2 text-sm text-slate-700">
                    <AmenityIcon amenity={a} className="h-4.5 w-4.5 text-brand-600" />
                    {amenityLabel(a)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <LostItemsNotice roomId={room.id} />
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-20 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Reserve this room</h2>

            <Input
              type="date"
              label="Date"
              required
              value={date}
              min={todayBangkok()}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
              className="mt-3"
            />

            <div className="border-t border-slate-100 pt-4">
              <TodaysSchedule roomId={room.id} date={date} />
            </div>

            {bookableOnSelectedDate ? (
              <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 flex flex-col gap-4">
                <div className="border-t border-slate-100 pt-4">
                  <TimeSlotGrid date={date} busy={busy} selection={selection} onSelect={handleSlotSelect} />
                  <p className="mt-2 text-sm text-slate-600">
                    {selectedStart && selectedEnd ? (
                      <>
                        Selected <span className="font-medium text-slate-900">{selectedStart.startLabel}–{selectedEnd.endLabel}</span>{' '}
                        ({selection!.length * 30} min)
                      </>
                    ) : (
                      'Pick a start time above.'
                    )}
                  </p>
                </div>

                <Input label="Purpose (optional)" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
                <AttendeeInvite
                  invitees={invitees}
                  onAdd={(u) => setInvitees((prev) => [...prev, u])}
                  onRemove={(uid) => setInvitees((prev) => prev.filter((u) => u.id !== uid))}
                />
                <ErrorBanner error={createReservation.error} />
                <Button type="submit" className="w-full" disabled={!selection || createReservation.isPending}>
                  {createReservation.isPending ? 'Booking…' : 'Book room'}
                </Button>
              </form>
            ) : (
              <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-red-600">
                This room is out of order on {date}
                {returnDateBangkok
                  ? ` — back in service from ${returnDateBangkok}. Pick a later date to book ahead.`
                  : ' and can’t be booked right now.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAmenityList(amenities: string[]): string {
  const labels = amenities.map(amenityLabel).map((l) => l.toLowerCase());
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}
