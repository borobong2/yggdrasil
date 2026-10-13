import type { Issue } from './items.js';

// YG-38 date rules shared by the server (today view, MCP text) and the client badges. ponytail: Asia/Seoul only, like recurrences.ts.
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** 'YYYY-MM-DD' in Asia/Seoul. */
export const seoulDay = (instant: string | Date) => day.format(new Date(instant));
/** 'HH:mm' in Asia/Seoul. */
export const seoulTime = (instant: string | Date) => time.format(new Date(instant));

/** All-day: overdue once its Seoul day is over. Timed: overdue once the instant has passed. */
export function isOverdue(issue: Pick<Issue, 'dueAt' | 'dueAllDay' | 'status'>, now = new Date()): boolean {
  if (!issue.dueAt || issue.status === 'done') return false;
  return issue.dueAllDay ? seoulDay(issue.dueAt) < seoulDay(now) : Date.parse(issue.dueAt) < now.getTime();
}

/** '2026-10-13' or '2026-10-13 21:00' (MCP text). */
export const formatDay = (instant: string, allDay: boolean) => allDay ? seoulDay(instant) : `${seoulDay(instant)} ${seoulTime(instant)}`;
/** '10/13' or '10/13 21:00' (badges). */
export function formatDue(instant: string, allDay: boolean): string {
  const [, month, date] = seoulDay(instant).split('-').map(Number);
  return allDay ? `${month}/${date}` : `${month}/${date} ${seoulTime(instant)}`;
}
