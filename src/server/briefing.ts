import { createHash, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BriefingSettings, StaleView, Todo, TodayView } from '../contracts/items.js';
import { seoulDay, seoulTime } from '../contracts/dates.js';
import { getDb } from './db.js';
import { briefingSettings } from './schema.js';
import { staleView, todayView } from './todos.js';

// YG-29 아침 브리핑: today/stale views → one Telegram HTML message, sent once per Asia/Seoul day.
const db = getDb();
export const APP_URL = 'https://yg.justrunlab.com';
export const SEND_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TODAY_MAX = 8;
const DAY = 86_400_000;

// ---- Message (pure) ----

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (text: string, max = 60) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

/** 'HH:mm' when the todo is timed on `date` (due first, then scheduled). */
function timeOn(todo: Todo, date: string): string | null {
  if (todo.dueAt && !todo.dueAllDay && seoulDay(todo.dueAt) === date) return seoulTime(todo.dueAt);
  if (todo.scheduledAt && !todo.scheduledAllDay && seoulDay(todo.scheduledAt) === date) return seoulTime(todo.scheduledAt);
  return null;
}

/** Whole days past due: all-day by Seoul day, timed by instant (same rule as isOverdue/staleView). */
function daysLate(todo: Todo, date: string, now: Date): number {
  if (!todo.dueAt) return 0;
  return todo.dueAllDay ? Math.round((Date.parse(date) - Date.parse(seoulDay(todo.dueAt))) / DAY) : Math.floor((now.getTime() - Date.parse(todo.dueAt)) / DAY);
}

function line(todo: Todo, prefix = '', suffix = ''): string {
  return `• ${prefix}${todo.key ? `<code>${escape(todo.key)}</code> ` : ''}${escape(clip(todo.title))}${suffix}`;
}

/** Telegram parse_mode HTML. Sections follow the app's 오늘 tab: an overdue todo shows only under 밀린 일, a recurring one only under 오늘 반복. */
export function buildBriefing(view: TodayView, stale: StaleView, now: Date): string {
  const { date } = view;
  const [, month, day] = date.split('-').map(Number);
  const lines = [`<b>${month}월 ${day}일 (${weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()]}) 아침 브리핑</b>`, ''];
  const late = new Set(view.overdue.map((todo) => todo.id));
  const rest = view.today.filter((todo) => !late.has(todo.id));
  const repeat = rest.filter((todo) => todo.recurrence);
  const today = rest.filter((todo) => !todo.recurrence)
    .map((todo) => ({ todo, time: timeOn(todo, date) }))
    .sort((a, b) => Number(a.todo.priority !== 'p1') - Number(b.todo.priority !== 'p1') || (a.time ?? '99').localeCompare(b.time ?? '99'));

  if (!today.length && !view.overdue.length && !repeat.length && !view.waiting.length && !stale.todos.length) {
    lines.push('오늘 챙길 일이 없습니다. 여유로운 하루예요.');
  } else {
    lines.push(today.length ? `<b>오늘 할 일</b> ${today.length}건` : '<b>오늘 할 일</b> 없음');
    for (const { todo, time } of today.slice(0, TODAY_MAX)) lines.push(line(todo, `${todo.priority === 'p1' ? '<b>P1</b> ' : ''}${time ? `${time} ` : ''}`));
    if (today.length > TODAY_MAX) lines.push(`… 외 ${today.length - TODAY_MAX}건`);

    const overdue = view.overdue.map((todo) => ({ todo, days: daysLate(todo, date, now) })).sort((a, b) => b.days - a.days);
    const ago = (days: number) => days > 0 ? `${days}일 지남` : '오늘 지남';
    lines.push('', overdue.length ? `<b>밀린 일</b> ${overdue.length}건 · 가장 오래된 것 ${ago(overdue[0]!.days)}` : '<b>밀린 일</b> 없음');
    for (const { todo, days } of overdue.slice(0, 3)) lines.push(line(todo, '', ` · ${ago(days)}`));

    const counts = [view.waiting.length && `<b>기다리는 중</b> ${view.waiting.length}건`, stale.todos.length && `<b>방치</b> ${stale.todos.length}건`].filter(Boolean);
    if (counts.length) lines.push('', counts.join(' · '));
    if (repeat.length) {
      lines.push('', '<b>오늘 반복</b>');
      for (const todo of repeat) { const time = timeOn(todo, date); lines.push(line(todo, time ? `${time} ` : '')); }
    }
  }
  lines.push('', `<a href="${APP_URL}">Yggdrasil 열기</a>`);
  return lines.join('\n');
}

// ---- Telegram ----

export class BriefingSendError extends Error {}

/** sendMessage with a 10s timeout and one retry (network error, 429, 5xx). Errors never include the URL: it carries the token. */
export async function sendTelegram(text: string, token: string, chatId: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    let error: BriefingSendError;
    let retry = true;
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
      });
      if (response.ok) return;
      const description = ((await response.json().catch(() => ({}))) as { description?: unknown }).description;
      error = new BriefingSendError(`Telegram sendMessage failed: ${response.status}${typeof description === 'string' ? ` ${description.slice(0, 200)}` : ''}`);
      retry = response.status === 429 || response.status >= 500;
    } catch (cause) {
      error = new BriefingSendError(`Telegram sendMessage failed: ${cause instanceof Error ? cause.name : 'error'}`);
    }
    if (!retry || attempt >= 2) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// ---- Config + run ----

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Env names still unset (BRIEFING_OWNER_ID also when not a UUID). Nothing is sent until this is empty. */
export function missingConfig(): string[] {
  const env = (name: string) => process.env[name]?.trim() ?? '';
  return [...['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'].filter((name) => !env(name)), ...(isUuid(env('BRIEFING_OWNER_ID')) ? [] : ['BRIEFING_OWNER_ID'])];
}
export const briefingOwner = () => process.env.BRIEFING_OWNER_ID?.trim() ?? '';

/** Timing-safe; hashing first makes the compare length-independent. */
export function secretMatches(expected: string, actual: string | undefined): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return actual !== undefined && timingSafeEqual(digest(expected), digest(actual));
}

export type BriefingResult = { sent: boolean; date: string; reason?: 'disabled' | 'before-send-time' | 'already-sent' };

/**
 * Scheduled run: sends when enabled, Seoul time ≥ send_time and not yet sent today, then records last_sent_date.
 * `force` (owner test) skips every check and does not touch last_sent_date, so it never suppresses the real briefing.
 * ponytail: the settings row stays locked across the Telegram call (≤ ~21s), which serializes double triggers; fine for one owner.
 */
export async function runBriefing(ownerId: string, { now = new Date(), force = false } = {}): Promise<BriefingResult> {
  const date = seoulDay(now);
  const deliver = async () => {
    const [view, stale] = await Promise.all([todayView(ownerId, now), staleView(ownerId, now)]);
    await sendTelegram(buildBriefing(view, stale, now), process.env.TELEGRAM_BOT_TOKEN!.trim(), process.env.TELEGRAM_CHAT_ID!.trim());
  };
  if (force) { await deliver(); return { sent: true, date }; }
  return db.transaction(async (tx) => {
    await tx.insert(briefingSettings).values({ ownerId }).onConflictDoNothing();
    const [row] = await tx.select().from(briefingSettings).where(eq(briefingSettings.ownerId, ownerId)).for('update');
    if (!row!.enabled) return { sent: false, date, reason: 'disabled' };
    if (seoulTime(now) < row!.sendTime) return { sent: false, date, reason: 'before-send-time' };
    if (row!.lastSentDate && row!.lastSentDate >= date) return { sent: false, date, reason: 'already-sent' };
    await deliver(); // a failed send rolls back, so the next scheduler run retries
    await tx.update(briefingSettings).set({ lastSentDate: date }).where(eq(briefingSettings.ownerId, ownerId));
    return { sent: true, date };
  });
}

// ---- Settings ----

export async function getBriefingSettings(ownerId: string): Promise<BriefingSettings> {
  const [row] = await db.select().from(briefingSettings).where(eq(briefingSettings.ownerId, ownerId));
  return { enabled: row?.enabled ?? true, sendTime: row?.sendTime ?? '07:00', lastSentDate: row?.lastSentDate ?? null, missing: missingConfig(), isOwner: briefingOwner() === ownerId };
}

export async function updateBriefingSettings(ownerId: string, changes: { enabled?: boolean; sendTime?: string }): Promise<BriefingSettings> {
  await db.insert(briefingSettings).values({ ownerId, ...changes }).onConflictDoUpdate({ target: briefingSettings.ownerId, set: changes });
  return getBriefingSettings(ownerId);
}
