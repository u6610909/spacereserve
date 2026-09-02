import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { naturalSearch } from '../api/search';
import type { Room } from '../api/types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Input } from '../components/ui/Input';
import { RoomImage } from '../components/ui/RoomImage';
import { Spinner } from '../components/ui/Spinner';
import { useRooms } from '../hooks/useRooms';

function RoomCard({ room }: { room: Room }) {
  return (
    <Link
      to={`/rooms/${room.id}`}
      className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white transition-shadow hover:shadow-md"
    >
      <RoomImage src={room.imageUrl} alt={room.name} rounded="" />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-semibold text-slate-900">{room.name}</div>
            <div className="text-xs text-slate-500">{room.building}</div>
          </div>
          <Badge tone={room.status === 'AVAILABLE' ? 'green' : 'red'}>
            {room.status === 'AVAILABLE' ? 'Available' : 'Out of order'}
          </Badge>
        </div>
        <div className="text-sm text-slate-600">Capacity {room.capacity}</div>
        {room.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {room.amenities.map((a) => (
              <Badge key={a} tone="neutral">
                {a}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

export function RoomsBrowsePage() {
  const [capacity, setCapacity] = useState('');
  const [building, setBuilding] = useState('');
  const [query, setQuery] = useState('');

  const filters = {
    capacity: capacity ? Number(capacity) : undefined,
    building: building || undefined,
  };
  const { data, isLoading, error } = useRooms(filters);

  const search = useMutation({ mutationFn: (q: string) => naturalSearch(q) });

  const rooms = search.data?.rooms ?? data?.rooms ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Rooms</h1>
        <p className="text-sm text-slate-500">Search or filter for a room to book.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) search.mutate(query.trim());
        }}
        className="flex gap-2"
      >
        <Input
          className="flex-1"
          placeholder='Try "a room for 4 with a whiteboard"'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" disabled={search.isPending}>
          {search.isPending ? 'Searching…' : 'Search'}
        </Button>
        {search.data && (
          <Button type="button" variant="ghost" onClick={() => search.reset()}>
            Clear
          </Button>
        )}
      </form>

      {search.data?.degraded && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Natural-language search is unavailable right now — showing keyword matches instead.
        </div>
      )}
      <ErrorBanner error={search.error} />

      {!search.data && (
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Min capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="w-36"
          />
          <Input
            placeholder="Building"
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
            className="w-36"
          />
        </div>
      )}

      <ErrorBanner error={error} />
      {isLoading && !search.data ? (
        <Spinner label="Loading rooms…" />
      ) : rooms.length === 0 ? (
        <p className="text-sm text-slate-500">No rooms match.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  );
}
