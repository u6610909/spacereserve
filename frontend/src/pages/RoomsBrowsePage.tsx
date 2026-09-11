import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { naturalSearch } from '../api/search';
import type { RoomBusyInterval } from '../api/rooms';
import type { Room } from '../api/types';
import { AmenityIcon } from '../components/ui/AmenityIcon';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Input } from '../components/ui/Input';
import { RoomImage } from '../components/ui/RoomImage';
import { amenityLabel } from '../lib/amenities';
import { formatBangkokTime, maxBookableDateBangkok, todayBangkok } from '../lib/bangkokTime';
import { useRooms, useRoomsAvailability } from '../hooks/useRooms';

function PeopleIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={`${className} shrink-0`}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 21v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 19.5V21M21 21v-1.5a3.5 3.5 0 0 0-2.5-3.35M14.5 4.16a3.5 3.5 0 0 1 0 6.68M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
      />
    </svg>
  );
}

/** "Free all day" or the day's busy windows — for whichever date the
 * browse list is currently previewing, not necessarily today. */
function BusyOverview({ busy }: { busy: RoomBusyInterval[] }) {
  if (busy.length === 0) {
    return <span className="text-emerald-700">Free all day</span>;
  }
  const shown = busy.slice(0, 2);
  return (
    <span className="text-slate-500">
      Booked {shown.map((b) => `${formatBangkokTime(b.startTime)}–${formatBangkokTime(b.endTime)}`).join(', ')}
      {busy.length > shown.length && ` +${busy.length - shown.length} more`}
    </span>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-3.5 w-3.5 shrink-0 text-slate-400">
      <circle cx="12" cy="12" r="8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 2" />
    </svg>
  );
}

function RoomCard({ room, busy }: { room: Room; busy?: RoomBusyInterval[] }) {
  const outOfOrder = room.status !== 'AVAILABLE';
  return (
    <Link
      to={`/rooms/${room.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-brand-300 hover:shadow-md"
    >
      <div className="relative">
        <RoomImage src={room.imageUrl} alt={room.name} rounded="" />
        {outOfOrder && (
          <span className="absolute left-3 top-3">
            <Badge tone="red">Out of order</Badge>
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <div className="font-semibold text-slate-900 group-hover:text-brand-700">{room.name}</div>
          <div className="text-xs text-slate-500">{room.building}</div>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-slate-600">
          <PeopleIcon />
          Seats {room.capacity}
        </div>
        {!outOfOrder && busy && (
          <div className="flex items-center gap-1.5 text-xs">
            <ClockIcon />
            <BusyOverview busy={busy} />
          </div>
        )}
        {room.amenities.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-2.5">
            {room.amenities.slice(0, 4).map((a) => (
              <span key={a} className="flex items-center gap-1 text-xs text-slate-500">
                <AmenityIcon amenity={a} className="h-3.5 w-3.5 text-slate-400" />
                {amenityLabel(a)}
              </span>
            ))}
            {room.amenities.length > 4 && (
              <span className="text-xs text-slate-400">+{room.amenities.length - 4} more</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="aspect-[4/3] w-full animate-pulse bg-slate-100" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

export function RoomsBrowsePage() {
  const [capacity, setCapacity] = useState('');
  const [building, setBuilding] = useState('');
  const [activeAmenities, setActiveAmenities] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [overviewDate, setOverviewDate] = useState(todayBangkok());

  // Fetch the full list once (no server filter) so the building/amenity
  // choices come from real data; capacity + amenity + building filtering is
  // then applied client-side for instant feedback.
  const { data, isLoading, error } = useRooms({});
  const search = useMutation({ mutationFn: (q: string) => naturalSearch(q) });

  // Per-room busy hours for whichever day the visitor is previewing — one
  // batched request rather than one per card.
  const availability = useRoomsAvailability(overviewDate);
  const busyByRoom = useMemo(() => {
    const map = new Map<string, { startTime: string; endTime: string }[]>();
    for (const r of availability.data?.rooms ?? []) map.set(r.roomId, r.busy);
    return map;
  }, [availability.data]);

  const serverRooms = data?.rooms;
  const allRooms = useMemo(() => search.data?.rooms ?? serverRooms ?? [], [search.data, serverRooms]);
  const searching = Boolean(search.data);

  const buildings = useMemo(
    () => [...new Set((serverRooms ?? []).map((r) => r.building))].sort(),
    [serverRooms],
  );
  const amenityOptions = useMemo(
    () => [...new Set((serverRooms ?? []).flatMap((r) => r.amenities))].sort(),
    [serverRooms],
  );

  const rooms = useMemo(() => {
    if (searching) return allRooms; // natural search already scoped the list
    return allRooms.filter((r) => {
      if (capacity && r.capacity < Number(capacity)) return false;
      if (building && r.building !== building) return false;
      if (activeAmenities.length > 0 && !activeAmenities.every((a) => r.amenities.includes(a))) return false;
      return true;
    });
  }, [allRooms, searching, capacity, building, activeAmenities]);

  const hasFilters = Boolean(capacity || building || activeAmenities.length > 0);

  function toggleAmenity(a: string) {
    setActiveAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }
  function clearFilters() {
    setCapacity('');
    setBuilding('');
    setActiveAmenities([]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-slate-900">Find a room</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isLoading
            ? 'Loading the campus room list…'
            : `${allRooms.length} rooms across ${buildings.length} buildings.`}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) search.mutate(query.trim());
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Input
          className="flex-1"
          placeholder='Describe what you need — "a quiet room for 4 with a whiteboard tomorrow afternoon"'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={search.isPending}>
            {search.isPending ? 'Searching…' : 'Search'}
          </Button>
          {searching && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                search.reset();
                setQuery('');
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </form>

      {search.data?.degraded && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Smart search is busy right now — showing keyword matches instead.
        </div>
      )}
      <ErrorBanner error={search.error} />
      <ErrorBanner error={error} />

      {!searching && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="Min. seats"
              placeholder="Any"
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-28"
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Building</span>
              <select
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500"
              >
                <option value="">All buildings</option>
                {buildings.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Availability overview for</span>
              <input
                type="date"
                value={overviewDate}
                min={todayBangkok()}
                max={maxBookableDateBangkok(14)}
                onChange={(e) => setOverviewDate(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="pb-2 text-sm text-brand-600 hover:underline">
                Clear filters
              </button>
            )}
          </div>
          {amenityOptions.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              {amenityOptions.map((a) => {
                const on = activeAmenities.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAmenity(a)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      on
                        ? 'border-brand-300 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <AmenityIcon amenity={a} className="h-3.5 w-3.5" />
                    {amenityLabel(a)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!isLoading && (
        <div className="text-sm text-slate-500">
          {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
          {searching ? ' matched your search' : hasFilters ? ' match your filters' : ''}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No rooms match</p>
          <p className="mt-1 text-sm text-slate-500">
            {searching ? 'Try describing it differently.' : 'Loosen the filters and try again.'}
          </p>
          {hasFilters && !searching && (
            <Button type="button" variant="secondary" className="mt-4" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              busy={availability.isLoading ? undefined : (busyByRoom.get(room.id) ?? [])}
            />
          ))}
        </div>
      )}
    </div>
  );
}
