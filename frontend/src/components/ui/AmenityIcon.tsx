/** One consistent stroke-icon set for amenities, matched by keyword so seed data or a staff
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
  if (key.includes('tv') || key.includes('display') || key.includes('monitor')) {
    return (
      <>
        <rect x="3" y="4" width="18" height="12" rx="1.5" />
        <path d="M8 20h8M12 16v4" />
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
  if (key.includes('piano') || key.includes('keyboard')) {
    return (
      <>
        <rect x="3" y="6" width="18" height="12" rx="1" />
        <path d="M7 6v7M11 6v7M15 6v7M19 6v7" />
      </>
    );
  }
  if (key.includes('drum')) {
    return (
      <>
        <ellipse cx="12" cy="8" rx="8" ry="3" />
        <path d="M4 8v6c0 1.66 3.58 3 8 3s8-1.34 8-3V8M5 15l-2 4M19 15l2 4" />
      </>
    );
  }
  if (key.includes('mic')) {
    return (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
      </>
    );
  }
  if (key.includes('sound') || key.includes('speaker') || key.includes('audio')) {
    return (
      <>
        <path d="M4 9v6h4l5 4V5L8 9H4Z" />
        <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a9 9 0 0 1 0 12" />
      </>
    );
  }
  if (key.includes('podium') || key.includes('lectern')) {
    return (
      <>
        <path d="M8 3h9l-1.5 6H9.5L8 3Z" />
        <path d="M12 9v5M7 21l2-7h6l2 7M6 21h12" />
      </>
    );
  }
  if (key.includes('seating') || key.includes('movable') || key.includes('chair')) {
    return <path d="M6 5v7h12V5M5 12h14l-1 5H6l-1-5ZM7 17v3M17 17v3" />;
  }
  if (key.includes('light') || key.includes('window') || key.includes('natural')) {
    return (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2 2M17.1 17.1l2 2M19.1 4.9l-2 2M6.9 17.1l-2 2" />
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
