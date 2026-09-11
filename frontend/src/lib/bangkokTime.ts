/**
 * Campus opening hours are fixed to Asia/Bangkok regardless of the viewer's
 * own device timezone — a room's "today" and "9am" are the campus's, not
 * whoever is looking at the page. Mirrors the backend's booking-hours rule
 * in reservations.service.ts.
 */

const BANGKOK_ZONE = 'Asia/Bangkok';
const BANGKOK_OFFSET = '+07:00';

const bangkokDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BANGKOK_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const bangkokTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: BANGKOK_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "2026-06-15" for whatever instant "today" is right now, in Bangkok. */
export function todayBangkok(): string {
  return bangkokDateFmt.format(new Date());
}

/** The last bookable calendar date, `daysAhead` from today in Bangkok. */
export function maxBookableDateBangkok(daysAhead: number): string {
  const today = new Date(`${todayBangkok()}T00:00:00${BANGKOK_OFFSET}`);
  today.setUTCDate(today.getUTCDate() + daysAhead);
  return bangkokDateFmt.format(today);
}

/** A Bangkok calendar date + "HH:MM" wall-clock time, as an ISO instant. */
export function bangkokDateTimeToIso(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00${BANGKOK_OFFSET}`).toISOString();
}

/** "14:00" for an ISO instant, always read in Bangkok time. */
export function formatBangkokTime(iso: string): string {
  return bangkokTimeFmt.format(new Date(iso));
}

export const BOOKING_START_HOUR = 9;
export const BOOKING_END_HOUR = 20; // 20:00 — "2 ทุ่ม"
export const SLOT_MINUTES = 30;
export const MAX_SLOT_COUNT = 4; // 4 × 30min = 2 hours

export interface TimeSlot {
  index: number;
  startLabel: string;
  endLabel: string;
}

function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Every bookable 30-minute slot from 09:00 up to (not including) 20:00. */
export function generateTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  let index = 0;
  for (let m = BOOKING_START_HOUR * 60; m < BOOKING_END_HOUR * 60; m += SLOT_MINUTES) {
    slots.push({ index, startLabel: minutesToLabel(m), endLabel: minutesToLabel(m + SLOT_MINUTES) });
    index += 1;
  }
  return slots;
}
