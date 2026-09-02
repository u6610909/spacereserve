/** One consistent stroke-icon set for amenities, matching by keyword so seed data or a staff
 * typo (e.g. "Whiteboard" vs "whiteboard") still gets a real icon instead of falling through. */
function iconFor(amenity: string) {
  const key = amenity.toLowerCase();

  if (key.includes('projector') || key.includes('screen')) {
    return (
      <>
        <rect x="2" y="4" width="20" height="13" rx="1.5" />
        <path d="M8 20h8M12 17v3" />
      </>
    );
  }
  if (key.includes('whiteboard') || key.includes('board')) {
    return (
      <>
        <rect x="3" y="4" width="18" height="12" rx="1" />
        <path d="M7 20l2-4M17 20l-2-4M8 9l3 3 5-5" />
      </>
    );
  }
  if (key.includes('video') || key.includes('conf') || key.includes('camera')) {
    return (
      <>
        <rect x="2" y="6" width="14" height="12" rx="2" />
        <path d="M16 10l6-3v10l-6-3" />
      </>
    );
  }
  if (key.includes('piano') || key.includes('music')) {
    return (
      <>
        <rect x="3" y="6" width="18" height="12" rx="1" />
        <path d="M7 6v7M11 6v7M15 6v7M19 6v7" />
      </>
    );
  }
  if (key.includes('wifi')) {
    return (
      <>
        <path d="M2 8.5a15 15 0 0 1 20 0" />
        <path d="M5.5 12a10 10 0 0 1 13 0" />
        <path d="M9 15.5a5 5 0 0 1 6 0" />
        <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
      </>
    );
  }
  // Generic fallback — a plain check, still visually consistent with the set.
  return <path d="M4 12.5l5 5L20 7" />;
}

export function AmenityIcon({ amenity, className = 'h-4 w-4' }: { amenity: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {iconFor(amenity)}
    </svg>
  );
}
