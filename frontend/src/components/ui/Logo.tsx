/** SpaceReserve mark — a room plan with a booked slot. Inherits `currentColor`. */
export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <rect x="7" y="7" width="6" height="6" rx="1.2" fill="currentColor" />
      <path d="M7 17h10M16 7.5l1.5 1.5L20 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
