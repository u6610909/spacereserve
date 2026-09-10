/** One place for date/time formatting so every screen reads the same way. */

const dayFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "Wed 17 Sep · 14:00–16:00" — same calendar day collapses to one date. */
export function formatReservationWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${dayFmt.format(start)} · ${timeFmt.format(start)}–${timeFmt.format(end)}`;
  }
  return `${dayFmt.format(start)} ${timeFmt.format(start)} – ${dayFmt.format(end)} ${timeFmt.format(end)}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${dayFmt.format(d)} ${timeFmt.format(d)}`;
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}
