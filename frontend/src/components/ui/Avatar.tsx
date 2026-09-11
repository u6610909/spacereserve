function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const SIZE_CLASSES = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
} as const;

/** Initials-only profile chip — deliberately not a photo or contact card,
 * matching how little identity a room's "who's booked in" view needs. */
export function Avatar({ name, size = 'sm' }: { name: string; size?: keyof typeof SIZE_CLASSES }) {
  return (
    <span
      title={name}
      className={`grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700 ${SIZE_CLASSES[size]}`}
    >
      {initialsOf(name)}
    </span>
  );
}
