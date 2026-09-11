import { useRef, useState } from 'react';

import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import {
  useAuditLogs,
  useCreatePeerIntegration,
  useDeletePeerIntegration,
  useIssuePeerKey,
  usePeerIntegrations,
  useReservationSearch,
  useSystemOverview,
  useUtilization,
} from '../hooks/useAdmin';
import { formatDateTime } from '../lib/format';

import type { ReservationSearchResult, RoomUtilization } from '../api/types';

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

/** navigator.clipboard.writeText can reject even from a real click — e.g.
 * Chrome's "Document is not focused" if the tab lost focus a moment
 * earlier — so this is a real fallback, not a legacy nicety. */
function legacyCopy(value: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

/** One-click copy for endpoints/keys — only claims "Copied" once the copy
 * actually succeeded. On failure, selects the text in place so the user can
 * still Ctrl+C it themselves instead of silently ending up with nothing on
 * their clipboard. */
function CopyButton({ value, label = 'Copy', onFailure }: { value: string; label?: string; onFailure?: () => void }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function handleCopy() {
    let ok: boolean;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      ok = legacyCopy(value);
    }
    setStatus(ok ? 'copied' : 'failed');
    if (!ok) onFailure?.();
    setTimeout(() => setStatus('idle'), 1500);
  }

  return (
    <Button type="button" variant="secondary" onClick={() => void handleCopy()}>
      {status === 'copied' ? 'Copied' : status === 'failed' ? 'Selected — press Ctrl+C' : label}
    </Button>
  );
}

function CodeRow({ value }: { value: string }) {
  const codeRef = useRef<HTMLElement>(null);

  return (
    <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
      <code ref={codeRef} className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-slate-700">
        {value}
      </code>
      <CopyButton
        value={value}
        onFailure={() => {
          const el = codeRef.current;
          if (!el) return;
          const range = document.createRange();
          range.selectNodeContents(el);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }}
      />
    </div>
  );
}

/** Our one exposed peer capability — see docs/peer-api.md. Any partner team
 * gets this same URL, paired with a key issued to them below. Kept as a
 * clean, real URL (no bracketed placeholders baked in) so Copy hands them
 * something they can actually paste; the query params are documented
 * separately since they're per-request, not part of the endpoint itself. */
const OUR_ENDPOINT = `${window.location.origin}/spacereserve/api/v1/external/bookings/active-at`;
const OUR_ENDPOINT_PARAMS = 'Query params: room=<room name>, at=<ISO 8601 datetime>';

function IssueKeyModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const issue = useIssuePeerKey();

  return (
    <Modal title="Issue a peer API key" onClose={onClose}>
      {issue.data ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            Send <strong>{issue.data.name}</strong> these two things — the key is shown once and never stored in
            full, so copy it now.
          </p>
          <div>
            <div className="mb-1 text-xs font-medium uppercase text-slate-500">Endpoint</div>
            <CodeRow value={OUR_ENDPOINT} />
            <p className="mt-1 text-xs text-slate-400">{OUR_ENDPOINT_PARAMS}</p>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium uppercase text-slate-500">
              x-api-key for {issue.data.name}
            </div>
            <CodeRow value={issue.data.key} />
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) issue.mutate(name.trim());
          }}
          className="flex flex-col gap-3"
        >
          <Input
            label="Partner/team name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. EduCore"
          />
          <ErrorBanner error={issue.error} />
          <Button type="submit" disabled={issue.isPending}>
            {issue.isPending ? 'Issuing…' : 'Issue key'}
          </Button>
        </form>
      )}
    </Modal>
  );
}

function AddPeerIntegrationModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: '', baseUrl: '', apiKey: '', notes: '' });
  const create = useCreatePeerIntegration();

  return (
    <Modal title="Add a peer integration we consume" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(
            { ...form, notes: form.notes.trim() || undefined },
            { onSuccess: onClose },
          );
        }}
        className="flex flex-col gap-3"
      >
        <Input
          label="Partner/team name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. EduCore"
        />
        <Input
          label="Base URL"
          required
          type="url"
          value={form.baseUrl}
          onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          placeholder="https://their-domain.example.com/api"
        />
        <Input
          label="API key they issued us"
          required
          value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
        />
        <Input
          label="Notes (optional)"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="What we call, and why"
        />
        <ErrorBanner error={create.error} />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Modal>
  );
}

function PeerApiSection() {
  const integrations = usePeerIntegrations();
  const deleteIntegration = useDeletePeerIntegration();
  const [issuing, setIssuing] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Peer API</h2>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <div className="mb-1 text-sm font-medium text-slate-900">Our endpoint</div>
          <CodeRow value={OUR_ENDPOINT} />
          <p className="mt-1 text-xs text-slate-400">{OUR_ENDPOINT_PARAMS}</p>
        </div>
        <Button type="button" variant="secondary" className="w-fit" onClick={() => setIssuing(true)}>
          + Issue key for a new team
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <span className="text-xs font-medium uppercase text-slate-500">Peer integrations we consume</span>
          <Button type="button" variant="ghost" onClick={() => setAdding(true)}>
            + Add
          </Button>
        </div>
        <ErrorBanner error={integrations.error} />
        {integrations.isLoading ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : integrations.data && integrations.data.peerIntegrations.length === 0 ? (
          <div className="px-4 py-3 text-sm text-slate-500">
            None recorded yet — actually calling one still needs its own integration code (each partner's response
            shape differs), this just keeps the base URL/key from getting lost in chat.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {integrations.data?.peerIntegrations.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{p.name}</span>
                  <Button type="button" variant="ghost" onClick={() => deleteIntegration.mutate(p.id)}>
                    Remove
                  </Button>
                </div>
                <div className="text-xs text-slate-500">
                  {p.baseUrl} · key <span className="font-mono">{p.apiKeyMasked}</span>
                </div>
                {p.notes && <div className="text-xs text-slate-400">{p.notes}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {issuing && <IssueKeyModal onClose={() => setIssuing(false)} />}
      {adding && <AddPeerIntegrationModal onClose={() => setAdding(false)} />}
    </section>
  );
}

const UTILIZATION_CHART_ROOM_COUNT = 12;

/** Horizontal bar chart, one sequential hue (booked hours = magnitude, one series). */
function UtilizationChart({ rooms }: { rooms: RoomUtilization[] }) {
  const sorted = [...rooms].sort((a, b) => b.totalBookedHours - a.totalBookedHours);
  const shown = sorted.slice(0, UTILIZATION_CHART_ROOM_COUNT);
  const max = Math.max(1, ...shown.map((r) => r.totalBookedHours));

  if (shown.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        No bookings yet — the chart fills in once rooms are reserved.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase text-slate-500">Booked hours by room</span>
        {sorted.length > shown.length && (
          <span className="text-xs text-slate-400">Top {shown.length} of {sorted.length}</span>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {shown.map((r) => {
          const pct = max === 0 ? 0 : (r.totalBookedHours / max) * 100;
          return (
            <div key={r.roomId} className="flex items-center gap-3">
              <div className="w-32 shrink-0 truncate text-sm text-slate-600" title={r.name}>
                {r.name}
              </div>
              <div className="h-3 flex-1 overflow-hidden rounded-sm bg-slate-100">
                <div className="h-full rounded-r-[4px] bg-brand-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="w-14 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700">
                {r.totalBookedHours}h
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BOOKING_ROW_COLUMN_COUNT = 6;

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
    >
      <path d="M7 4l6 6-6 6" />
    </svg>
  );
}

function PersonLine({ name, email }: { name: string; email: string }) {
  return (
    <div className="text-sm">
      <span className="font-medium text-slate-900">{name}</span>{' '}
      <span className="text-xs text-slate-500">{email}</span>
    </div>
  );
}

/** Click/Enter/Space to reveal who organized vs. who was invited — collapsed
 * by default since names+emails for every row at once would swamp the table. */
function BookingRow({
  r,
  expanded,
  onToggle,
}: {
  r: ReservationSearchResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className="cursor-pointer hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
      >
        <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">
          <div className="flex items-center gap-2">
            <ChevronIcon expanded={expanded} />
            <span>
              {r.roomName} {r.roomCode && <span className="text-slate-400">({r.roomCode})</span>}
            </span>
          </div>
        </td>
        <td className="whitespace-nowrap px-4 py-2 text-slate-600">{r.organizerName}</td>
        <td className="whitespace-nowrap px-4 py-2 text-slate-600">
          {r.attendees.length === 0 ? <span className="text-slate-400">None invited</span> : `${r.attendees.length} invited`}
        </td>
        <td className="whitespace-nowrap px-4 py-2 text-slate-600">{r.headcount}</td>
        <td className="whitespace-nowrap px-4 py-2 text-slate-500">
          {formatDateTime(r.startTime)} – {formatDateTime(r.endTime)}
        </td>
        <td className="whitespace-nowrap px-4 py-2 text-slate-600">{r.status}</td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={BOOKING_ROW_COLUMN_COUNT} className="px-4 py-4">
            <div className="grid gap-6 pl-6 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-xs font-medium uppercase text-slate-500">Organizer</div>
                <PersonLine name={r.organizerName} email={r.organizerEmail} />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium uppercase text-slate-500">
                  Invited{r.attendees.length > 0 && ` (${r.attendees.length})`}
                </div>
                {r.attendees.length === 0 ? (
                  <div className="text-sm text-slate-400">No one invited</div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {r.attendees.map((a) => (
                      <PersonLine key={a.email} name={a.name} email={a.email} />
                    ))}
                  </div>
                )}
              </div>
            </div>
            {r.purpose && <div className="mt-3 pl-6 text-xs text-slate-500">Purpose: {r.purpose}</div>}
          </td>
        </tr>
      )}
    </>
  );
}

function BookingsSearchSection() {
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const search = useReservationSearch({ q: submittedQ || undefined });

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Bookings</h2>
        <p className="text-xs text-slate-500">
          Search reservations by organizer, attendee, or room — distinct from the audit trail below, which only
          logs staff/admin actions.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedQ(q.trim());
        }}
        className="flex gap-2"
      >
        <div className="flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email, room, or code…"
            className="w-full"
          />
        </div>
        <Button type="submit">Search</Button>
        {submittedQ && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQ('');
              setSubmittedQ('');
            }}
          >
            Clear
          </Button>
        )}
      </form>

      <ErrorBanner error={search.error} />
      {search.isLoading ? (
        <Spinner />
      ) : search.data && search.data.reservations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {submittedQ ? `No bookings match "${submittedQ}".` : 'No bookings yet.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-2">Room</th>
                <th className="whitespace-nowrap px-4 py-2">Organizer</th>
                <th className="whitespace-nowrap px-4 py-2">Invited</th>
                <th className="whitespace-nowrap px-4 py-2">Headcount</th>
                <th className="whitespace-nowrap px-4 py-2">When</th>
                <th className="whitespace-nowrap px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {search.data?.reservations.map((r) => (
                <BookingRow
                  key={r.id}
                  r={r}
                  expanded={expandedId === r.id}
                  onToggle={() => setExpandedId((current) => (current === r.id ? null : r.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AdminDashboardPage() {
  const overview = useSystemOverview();
  const audit = useAuditLogs(50);
  const utilization = useUtilization();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-slate-900">Admin dashboard</h1>
        <p className="text-sm text-slate-500">System health, audit trail, and room utilization.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-900">System</h2>
        <ErrorBanner error={overview.error} />
        {overview.isLoading ? (
          <Spinner />
        ) : overview.data ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              <StatTile value={overview.data.usersByRole.STUDENT} label="Students" />
              <StatTile value={overview.data.usersByRole.STAFF} label="Staff" />
              <StatTile value={overview.data.usersByRole.ADMIN} label="Admins" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatTile value={overview.data.rooms.available} label="Rooms available" />
              <StatTile value={overview.data.rooms.outOfOrder} label="Rooms out of order" />
              <StatTile value={overview.data.reservations.upcoming} label="Upcoming reservations" />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase text-slate-500">
                Peer API keys issued
              </div>
              {overview.data.apiKeys.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-500">None issued yet.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {overview.data.apiKeys.map((key) => (
                    <li key={key.name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="font-medium text-slate-900">{key.name}</span>
                      <span className="text-slate-500">
                        {key.lastUsedAt ? `Last used ${formatDateTime(key.lastUsedAt)}` : 'Never used'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <PeerApiSection />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Utilization</h2>
        <ErrorBanner error={utilization.error} />
        {utilization.isLoading ? (
          <Spinner />
        ) : utilization.data ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatTile value={utilization.data.totals.totalRooms} label="Rooms" />
              <StatTile value={utilization.data.totals.totalReservations} label="Reservations" />
              <StatTile value={`${utilization.data.totals.totalBookedHours}h`} label="Booked hours" />
            </div>
            <UtilizationChart rooms={utilization.data.rooms} />
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2">Room</th>
                    <th className="whitespace-nowrap px-4 py-2">Building</th>
                    <th className="whitespace-nowrap px-4 py-2">Reservations</th>
                    <th className="whitespace-nowrap px-4 py-2">Booked hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {utilization.data.rooms.map((r) => (
                    <tr key={r.roomId}>
                      <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">{r.name}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-600">{r.building}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-600">{r.reservationCount}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-600">{r.totalBookedHours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <BookingsSearchSection />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Audit log</h2>
          <p className="text-xs text-slate-500">Staff/admin actions only — for bookings, use search above.</p>
        </div>
        <ErrorBanner error={audit.error} />
        {audit.isLoading ? (
          <Spinner />
        ) : audit.data && audit.data.auditLogs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            No activity yet — staff and admin actions will show up here.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2">When</th>
                  <th className="whitespace-nowrap px-4 py-2">Actor</th>
                  <th className="whitespace-nowrap px-4 py-2">Action</th>
                  <th className="whitespace-nowrap px-4 py-2">Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.data?.auditLogs.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">{entry.actor?.name ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">{entry.action}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                      {entry.entity} <span className="text-slate-400">{entry.entityId.slice(0, 8)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
