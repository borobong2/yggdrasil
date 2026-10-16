// YG-30 calendar date math. Days are 'YYYY-MM-DD' Asia/Seoul calendar days; arithmetic runs on UTC midnight so the
// browser's own timezone never leaks in. ponytail: Asia/Seoul only, same as recurrences.ts.
export type CalendarMode = 'month' | 'week' | '3day' | 'day' | 'list';
export const modes: CalendarMode[] = ['month', 'week', '3day', 'day', 'list'];
const LIST_DAYS = 30;

const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');

export const addDays = (day: string, n: number) => iso(utc(day) + n * 86_400_000);
/** Monday of the week containing `day`. */
export const weekStart = (day: string) => addDays(day, -((new Date(utc(day)).getUTCDay() + 6) % 7));
export const dayOf = (instant: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(instant));
export const today = () => dayOf(new Date());
/** Minutes after Seoul midnight. ponytail: the grid treats 0 as the all-day row, so a timed 00:00 todo shows there too. */
export const seoulMinutes = (instant: string) => Math.floor(((Date.parse(instant) + 9 * 3_600_000) % 86_400_000) / 60_000);
export const slotAt = (day: string, minutes: number) => `${day}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00+09:00`;
/** PATCH value that moves `instant` to `day`, keeping its Seoul time; all-day stays a date-only string (YG-38 flag). */
export const moveKeepingTime = (instant: string, day: string, allDay: boolean) => allDay ? day : slotAt(day, seoulMinutes(instant));

/** Whole weeks (Mon–Sun) covering the month of `day`: 35 or 42 days (28 for a Feb starting on Monday). */
export function monthGrid(day: string): string[] {
  const first = `${day.slice(0, 8)}01`;
  const last = addDays(`${shift('month', first, 1)}`, -1);
  const days: string[] = [];
  for (let current = weekStart(first); current <= last || days.length % 7; current = addDays(current, 1)) days.push(current);
  return days;
}

export function rangeOf(mode: CalendarMode, day: string): { from: string; to: string } {
  if (mode === 'month') { const grid = monthGrid(day); return { from: grid[0]!, to: grid.at(-1)! }; }
  const from = mode === 'week' ? weekStart(day) : day;
  return { from, to: addDays(from, { week: 6, '3day': 2, day: 0, list: LIST_DAYS - 1 }[mode]) };
}

export function shift(mode: CalendarMode, day: string, direction: 1 | -1): string {
  if (mode === 'month') {
    const date = new Date(utc(day));
    return iso(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1));
  }
  return addDays(day, direction * { week: 7, '3day': 3, day: 1, list: LIST_DAYS }[mode]);
}

/** `#/calendar/<mode>/<YYYY-MM-DD>`; missing or invalid parts come back null. */
export function parseCalendarHash(hash: string): { view: CalendarMode | null; day: string | null } {
  const [, view, day] = hash.replace(/^#?\/calendar\/?/, '').match(/^([^/]*)\/?(.*)$/) ?? [];
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') && !Number.isNaN(utc(day!)) && iso(utc(day!)) === day;
  return { view: modes.includes(view as CalendarMode) ? view as CalendarMode : null, day: valid ? day! : null };
}

/** Serialize an existing date back to the write contract, including all-day and cleared dates. */
export const calendarDateInput = (value: string | null, allDay: boolean) => value && (allDay ? dayOf(value) : value);
