import { Link } from 'react-router-dom';

import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Spinner } from '../components/ui/Spinner';
import { formatDateTime } from '../lib/format';
import { useLostItems } from '../hooks/useLostItems';

export function LostFoundPage() {
  const { data, isLoading, error } = useLostItems();
  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-slate-900">Lost &amp; found</h1>
        <p className="mt-1 text-sm text-slate-500">
          Reported by FinderAI across every room — pulled fresh each visit, not pushed to us.
        </p>
      </div>

      <ErrorBanner error={error} />

      {isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">Nothing reported right now</p>
          <p className="mt-1 text-sm text-slate-500">Check back later, or look up a specific room's page.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-amber-900">{item.title}</span>
                <span className="text-xs font-medium uppercase text-amber-700">{item.category}</span>
              </div>
              <p className="mt-1 text-sm text-amber-800">{item.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-600">
                <Link to={`/rooms/${item.roomId}`} className="font-medium underline hover:text-amber-800">
                  {item.roomName}
                </Link>
                <span>Reported {formatDateTime(item.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
