import type { Todo, TodoVia } from './items.js';
import { seoulDay } from './dates.js';

// YG-43 주간 회고. Weeks run Monday–Sunday in Asia/Seoul; a week is named by its Monday ('YYYY-MM-DD').

/** 'YYYY-MM-DD' + n calendar days (date math on UTC midnight, so no DST/timezone drift). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Monday of the Asia/Seoul week containing `date` ('YYYY-MM-DD') or the instant. */
export function weekStart(date: string | Date = new Date()): string {
  const day = typeof date === 'string' ? date : seoulDay(date);
  return addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
}

/** ISO week label of the week starting `monday`, e.g. '2026-W42' (the week belongs to the year of its Thursday). */
export function isoWeek(monday: string): string {
  const thursday = addDays(monday, 3);
  const year = thursday.slice(0, 4);
  const week = Math.floor((Date.parse(`${thursday}T00:00:00Z`) - Date.parse(`${year}-01-01T00:00:00Z`)) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Title of the week's 회고 메모 document (found by exact title, created on demand). */
export const reviewDocumentTitle = (monday: string) => `주간 회고 ${isoWeek(monday)}`;

export type ReviewVia = TodoVia | 'github';
export type WeekReview = {
  /** Monday and Sunday of the week (Asia/Seoul, inclusive). */
  start: string; end: string; week: string;
  /** Done todos whose completedAt falls in the week, oldest first. */
  completed: Todo[];
  byArea: { area: string; count: number }[];
  /** Totals over completed todos that have both an estimate and an actual time. ratio = actual / estimated (null when nothing to compare). */
  minutes: { compared: number; estimated: number; actual: number; ratio: number | null };
  /** Due in the week but not done by the week's end (still open, or done later). */
  unfinished: Todo[];
  /** Still open, and their due passed during the week (all-day: once the day is over). */
  overdue: Todo[];
  /** YG-41 stale count — always as of now, whichever week is shown. */
  stale: number;
  activity: { created: number; completed: number; moved: number; via: Record<ReviewVia, number> };
  /** The week's 회고 메모 document, if it exists. */
  documentId: string | null;
};
