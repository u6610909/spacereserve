import { useState } from 'react';

import type { Room, RoomStatus } from '../api/types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { useCreateRoom, useDeleteRoom, useRooms, useSetRoomStatus, useUpdateRoom } from '../hooks/useRooms';

interface RoomFormState {
  name: string;
  building: string;
  capacity: string;
  amenities: string;
}

const EMPTY_FORM: RoomFormState = { name: '', building: '', capacity: '', amenities: '' };

function RoomForm({
  initial,
  onSubmit,
  submitting,
  error,
}: {
  initial: RoomFormState;
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
      <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input
        label="Building"
        required
        value={form.building}
        onChange={(e) => setForm({ ...form, building: e.target.value })}
      />
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

export function RoomManagementPage() {
  const { data, isLoading, error } = useRooms({});
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();
  const setStatus = useSetRoomStatus();
  const deleteRoom = useDeleteRoom();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [deleteError, setDeleteError] = useState<Record<string, unknown>>({});

  function toRoomInput(form: RoomFormState) {
    return {
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
    setStatus.mutate({ id: room.id, status: room.status === 'AVAILABLE' ? 'OUT_OF_ORDER' : ('AVAILABLE' as RoomStatus) });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Manage Rooms</h1>
          <p className="text-sm text-slate-500">Create rooms, edit details, take rooms out of service.</p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          + New room
        </Button>
      </div>

      <ErrorBanner error={error} />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Building</th>
                <th className="px-4 py-2">Capacity</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.rooms.map((room) => (
                <tr key={room.id}>
                  <td className="px-4 py-2 font-medium text-slate-900">{room.name}</td>
                  <td className="px-4 py-2 text-slate-600">{room.building}</td>
                  <td className="px-4 py-2 text-slate-600">{room.capacity}</td>
                  <td className="px-4 py-2">
                    <Badge tone={room.status === 'AVAILABLE' ? 'green' : 'red'}>{room.status}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => setEditing(room)}>
                        Edit
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => toggleStatus(room)}>
                        {room.status === 'AVAILABLE' ? 'Take out of order' : 'Mark available'}
                      </Button>
                      <Button type="button" variant="danger" onClick={() => void handleDelete(room)}>
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
      )}

      {creating && (
        <Modal title="New room" onClose={() => setCreating(false)}>
          <RoomForm
            initial={EMPTY_FORM}
            submitting={createRoom.isPending}
            error={createRoom.error}
            onSubmit={(form) =>
              createRoom.mutate(toRoomInput(form), { onSuccess: () => setCreating(false) })
            }
          />
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <RoomForm
            initial={{
              name: editing.name,
              building: editing.building,
              capacity: String(editing.capacity),
              amenities: editing.amenities.join(', '),
            }}
            submitting={updateRoom.isPending}
            error={updateRoom.error}
            onSubmit={(form) =>
              updateRoom.mutate(
                { id: editing.id, input: toRoomInput(form) },
                { onSuccess: () => setEditing(null) },
              )
            }
          />
        </Modal>
      )}
    </div>
  );
}
