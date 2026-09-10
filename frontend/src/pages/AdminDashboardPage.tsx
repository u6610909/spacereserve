import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Spinner } from '../components/ui/Spinner';
import { useAuditLogs, useUtilization } from '../hooks/useAdmin';

export function AdminDashboardPage() {
  const audit = useAuditLogs(50);
  const utilization = useUtilization();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Admin Dashboard</h1>
        <p className="text-sm text-slate-500">Audit trail and room utilization.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-slate-900">Utilization</h2>
        <ErrorBanner error={utilization.error} />
        {utilization.isLoading ? (
          <Spinner />
        ) : utilization.data ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-2xl font-semibold text-slate-900">{utilization.data.totals.totalRooms}</div>
                <div className="text-xs text-slate-500">Rooms</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-2xl font-semibold text-slate-900">
                  {utilization.data.totals.totalReservations}
                </div>
                <div className="text-xs text-slate-500">Reservations</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-2xl font-semibold text-slate-900">
                  {utilization.data.totals.totalBookedHours}h
                </div>
                <div className="text-xs text-slate-500">Booked hours</div>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Room</th>
                    <th className="px-4 py-2">Building</th>
                    <th className="px-4 py-2">Reservations</th>
                    <th className="px-4 py-2">Booked hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {utilization.data.rooms.map((r) => (
                    <tr key={r.roomId}>
                      <td className="px-4 py-2 font-medium text-slate-900">{r.name}</td>
                      <td className="px-4 py-2 text-slate-600">{r.building}</td>
                      <td className="px-4 py-2 text-slate-600">{r.reservationCount}</td>
                      <td className="px-4 py-2 text-slate-600">{r.totalBookedHours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-slate-900">Audit log</h2>
        <ErrorBanner error={audit.error} />
        {audit.isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Actor</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.data?.auditLogs.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-2 text-slate-500">{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2 text-slate-600">{entry.actor?.name ?? '—'}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{entry.action}</td>
                    <td className="px-4 py-2 text-slate-600">
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
