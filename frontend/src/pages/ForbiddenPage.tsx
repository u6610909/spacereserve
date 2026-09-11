import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold text-slate-900">You don't have access to this page</h1>
      <Link to="/rooms" className="text-brand-600 hover:underline">
        Back to rooms
      </Link>
    </div>
  );
}
