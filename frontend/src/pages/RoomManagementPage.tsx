import { useMemo, useRef, useState } from 'react';

import type { Room, RoomStatus } from '../api/types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { RoomImage } from '../components/ui/RoomImage';
import { Spinner } from '../components/ui/Spinner';
import { bangkokDateOf, todayBangkok } from '../lib/bangkokTime';
import {
  useCreateRoom,
  useDeleteRoom,
  useDeleteRoomImage,
  useRooms,
  useSetRoomStatus,
  useUpdateRoom,
  useUploadRoomImage,
} from '../hooks/useRooms';

/**
 * Same 4:3-crop template as everywhere else a room photo shows up (see
 * RoomImage) — staff see exactly the frame students will see, not the raw
 * uploaded file's own proportions.
 */
function RoomImageUploader({ room }: { room: Room }) {
  const upload = useUploadRoomImage();
  const remove = useDeleteRoomImage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-700">Photo</span>
      <RoomImage src={room.imageUrl} alt={room.name} className="max-w-[12rem]" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate({ id: room.id, file });
          e.target.value = '';
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={upload.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {upload.isPending ? 'Uploading…' : room.imageUrl ? 'Change photo' : 'Upload photo'}
        </Button>
        {room.imageUrl && (
          <Button type="button" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(room.id)}>
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-400">JPEG, PNG, or WebP — 5MB max.</p>
      <ErrorBanner error={upload.error ?? remove.error} />
    </div>
  );
}

interface RoomFormState {
  code: string;
  name: string;
  building: string;
  capacity: string;
  amenities: string;
}

const EMPTY_FORM: RoomFormState = { code: '', name: '', building: '', capacity: '', amenities: '' };

function RoomForm({
  initial,
  buildings,
  onSubmit,
  submitting,
  error,
}: {
  initial: RoomFormState;
  buildings: string[];
  onSubmit: (form: RoomFormState) => void;
  submitting: boolean;
  error: unknown;
}) {
  const [form, setForm] = useState(initial);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="flex flex-col gap-3"
    >
      <Input
        label="Code"
        placeholder="e.g. CL204 — the short room number, separate from the name"
        value={form.code}
        onChange={(e) => setForm({ ...form, code: e.target.value })}
      />
      <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input
        label="Building"
        required
        list="mng-buildings"
        value={form.building}
        onChange={(e) => setForm({ ...form, building: e.target.value })}
        placeholder="Pick an existing one or type a new name"
      />
      <datalist id="mng-buildings">
        {buildings.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <Input
        label="Capacity"
        type="number"
        min={1}
        required
        value={form.capacity}
        onChange={(e) => setForm({ ...form, capacity: e.target.value })}
      />
      <Input
        label="Amenities (comma-separated)"
        value={form.amenities}
        onChange={(e) => setForm({ ...form, amenities: e.target.value })}
        placeholder="projector, whiteboard"
      />
      <ErrorBanner error={error} />
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}

function BuildingSection({
  building,
  rooms,
  onEdit,
  onToggleStatus,
  onDelete,
  deleteError,
}: {
  building: string;
  rooms: Room[];
  onEdit: (id: string) => void;
  onToggleStatus: (room: Room) => void;
  onDelete: (room: Room) => void;
  deleteError: Record<string, unknown>;
}) {
  const outOfOrder = rooms.filter((r) => r.status !== 'AVAILABLE').length;

  return (
    <details open className="group overflow-hidden rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50">
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90"
          >
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-semibold text-slate-900">{building}</span>
        </div>
        <span className="text-xs text-slate-500">
          {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
          {outOfOrder > 0 && <span className="text-red-500"> · {outOfOrder} out of order</span>}
        </span>
      </summary>

      <div className="overflow-x-auto border-t border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-2">Photo</th>
              <th className="whitespace-nowrap px-4 py-2">Name</th>
              <th className="whitespace-nowrap px-4 py-2">Capacity</th>
              <th className="whitespace-nowrap px-4 py-2">Status</th>
              <th className="whitespace-nowrap px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rooms.map((room) => (
              <tr key={room.id}>
                <td className="whitespace-nowrap px-4 py-2">
                  <RoomImage src={room.imageUrl} alt={room.name} className="w-14" />
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <div className="font-medium text-slate-900">{room.name}</div>
                  {room.code && <div className="font-mono text-xs text-slate-400">{room.code}</div>}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{room.capacity}</td>
                <td className="whitespace-nowrap px-4 py-2">
                  <Badge tone={room.status === 'AVAILABLE' ? 'green' : 'red'}>
                    {room.status === 'AVAILABLE'
                      ? 'Available'
                      : `Out of order${room.outOfOrderUntil ? ` until ${bangkokDateOf(room.outOfOrderUntil)}` : ''}`}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <div className="flex flex-nowrap items-center justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => onEdit(room.id)}>
                      Edit
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => onToggleStatus(room)}>
                      {room.status === 'AVAILABLE' ? 'Take out of order' : 'Mark available'}
                    </Button>
                    <Button type="button" variant="danger" onClick={() => onDelete(room)}>
                      Delete
                    </Button>
                  </div>
                  <ErrorBanner error={deleteError[room.id]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Return date is optional on purpose — leaving it blank keeps the old
 * "unknown when it's back, every date blocked" behavior. Setting one means
 * dates on/after it stay bookable even while this room is still marked out
 * of order (see reservations.service.ts). */
function TakeOutOfOrderModal({
  room,
  onClose,
  onConfirm,
  submitting,
}: {
  room: Room;
  onClose: () => void;
  onConfirm: (returnDate: string | null) => void;
  submitting: boolean;
}) {
  const [returnDate, setReturnDate] = useState('');

  return (
    <Modal title={`Take "${room.name}" out of order`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(returnDate || null);
        }}
        className="flex flex-col gap-3"
      >
        <Input
          type="date"
          label="Expected back in service (optional)"
          hint="Leave blank if you don't know yet — the room stays fully blocked until you mark it available again. Set a date and it'll still show out of order, but people can book it starting that day."
          min={todayBangkok()}
          value={returnDate}
          onChange={(e) => setReturnDate(e.target.value)}
        />
        <Button type="submit" variant="danger" disabled={submitting}>
          {submitting ? 'Saving…' : 'Take out of order'}
        </Button>
      </form>
    </Modal>
  );
}

export function RoomManagementPage() {
  const { data, isLoading, error } = useRooms({});
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();
  const setStatus = useSetRoomStatus();
  const deleteRoom = useDeleteRoom();

  const [creating, setCreating] = useState(false);
  // An id, not a snapshot — so the modal re-reads the live room (e.g. a
  // freshly uploaded imageUrl) from `data.rooms` on every render instead of
  // showing a stale copy from the moment "Edit" was clicked.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = data?.rooms.find((r) => r.id === editingId) ?? null;
  const [deleteError, setDeleteError] = useState<Record<string, unknown>>({});
  const [takingOutOfOrder, setTakingOutOfOrder] = useState<Room | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, Room[]>();
    for (const room of data?.rooms ?? []) {
      const list = map.get(room.building) ?? [];
      list.push(room);
      map.set(room.building, list);
    }
    return [...map.entries()]
      .map(([building, rooms]) => ({
        building,
        rooms: rooms.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.building.localeCompare(b.building));
  }, [data]);

  const buildingNames = grouped.map((g) => g.building);

  function toRoomInput(form: RoomFormState) {
    return {
      code: form.code.trim() || undefined,
      name: form.name,
      building: form.building,
      capacity: Number(form.capacity),
      amenities: form.amenities
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
    };
  }

  function toggleStatus(room: Room) {
    if (room.status === 'AVAILABLE') {
      setTakingOutOfOrder(room); // ask for an optional return date first
      return;
    }
    setStatus.mutate({ id: room.id, status: 'AVAILABLE' as RoomStatus });
  }

  async function handleDelete(room: Room) {
    setDeleteError((prev) => ({ ...prev, [room.id]: null }));
    try {
      await deleteRoom.mutateAsync(room.id);
    } catch (err) {
      setDeleteError((prev) => ({ ...prev, [room.id]: err }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-slate-900">Manage rooms</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isLoading
              ? 'Loading…'
              : `${data?.rooms.length ?? 0} rooms in ${grouped.length} buildings. Create rooms, edit details, take rooms out of service.`}
          </p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          + New room
        </Button>
      </div>

      <ErrorBanner error={error} />
      {isLoading ? (
        <Spinner />
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No rooms yet — add the first one.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {grouped.map(({ building, rooms }) => (
            <BuildingSection
              key={building}
              building={building}
              rooms={rooms}
              onEdit={setEditingId}
              onToggleStatus={toggleStatus}
              onDelete={(room) => void handleDelete(room)}
              deleteError={deleteError}
            />
          ))}
        </div>
      )}

      {creating && (
        <Modal title="New room" onClose={() => setCreating(false)}>
          <RoomForm
            initial={EMPTY_FORM}
            buildings={buildingNames}
            submitting={createRoom.isPending}
            error={createRoom.error}
            onSubmit={(form) =>
              createRoom.mutate(toRoomInput(form), {
                onSuccess: (res) => {
                  setCreating(false);
                  setEditingId(res.room.id); // straight into Edit so a photo can be added right away
                },
              })
            }
          />
          <p className="mt-2 text-xs text-slate-400">You can add a photo right after saving.</p>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditingId(null)}>
          <div className="flex flex-col gap-5">
            <RoomImageUploader room={editing} />
            <RoomForm
              initial={{
                code: editing.code ?? '',
                name: editing.name,
                building: editing.building,
                capacity: String(editing.capacity),
                amenities: editing.amenities.join(', '),
              }}
              buildings={buildingNames}
              submitting={updateRoom.isPending}
              error={updateRoom.error}
              onSubmit={(form) =>
                updateRoom.mutate({ id: editing.id, input: toRoomInput(form) }, { onSuccess: () => setEditingId(null) })
              }
            />
          </div>
        </Modal>
      )}

      {takingOutOfOrder && (
        <TakeOutOfOrderModal
          room={takingOutOfOrder}
          submitting={setStatus.isPending}
          onClose={() => setTakingOutOfOrder(null)}
          onConfirm={(returnDate) =>
            setStatus.mutate(
              { id: takingOutOfOrder.id, status: 'OUT_OF_ORDER' as RoomStatus, outOfOrderUntil: returnDate },
              { onSuccess: () => setTakingOutOfOrder(null) },
            )
          }
        />
      )}
    </div>
  );
}
