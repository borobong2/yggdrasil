import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import type { StaleTodo, Todo } from '../src/contracts/items.js';
import { createApp } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import { buildBriefing, runBriefing, sendTelegram, updateBriefingSettings } from '../src/server/briefing.js';
import { createTodo } from '../src/server/todos.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = createApp();
const TOKEN = '123456:SECRET-bot-token';
const kst = (local: string) => new Date(`${local}+09:00`);
let sent: { url: string; body: any }[] = [];
let reply: () => Response = () => Response.json({ ok: true });
const env = { BRIEFING_SECRET: 'scheduler-secret', TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '42' };

afterAll(() => pool.end());
beforeEach(() => {
  sent = []; reply = () => Response.json({ ok: true });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { sent.push({ url, body: JSON.parse(String(init.body)) }); return reply(); }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of [...Object.keys(env), 'BRIEFING_OWNER_ID']) delete process.env[name];
});

function owner(configure = true) {
  const id = crypto.randomUUID();
  installTestOwner(`br-${id}`, { id });
  if (configure) Object.assign(process.env, env, { BRIEFING_OWNER_ID: id });
  return { id, headers: { authorization: `Bearer br-${id}`, 'content-type': 'application/json' } };
}
const lastSent = async (ownerId: string) => (await pool.query("SELECT to_char(last_sent_date, 'YYYY-MM-DD') AS d FROM briefing_settings WHERE owner_id = $1", [ownerId])).rows[0]?.d ?? null;
const run = (headers: Record<string, string> = {}, query = '') => app.request(`/api/briefing/run${query}`, { method: 'POST', headers });

// ---- Message builder ----

let n = 0;
function todo(title: string, extra: Partial<Todo> = {}): Todo {
  n += 1;
  return { id: `t${n}`, title, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', epicId: 'e', status: 'todo', position: n, priority: 'p3',
    dueAt: null, dueAllDay: false, hold: null, holdReason: null, scheduledAt: null, scheduledAllDay: false, notes: '', estimateMinutes: null, source: null, key: null,
    completedAt: null, archivedAt: null, recurrence: null, links: [], area: '일반', epic: '일반', ...extra };
}
const allDay = (date: string) => ({ dueAt: kst(`${date}T00:00:00`).toISOString(), dueAllDay: true });
const now = kst('2026-10-14T07:00:00');
const empty = { date: '2026-10-14', today: [], overdue: [], waiting: [], week: [], late: [], timeline: { todos: [], ghosts: [] } }; // YG-34 added late/timeline to TodayView

it('builds the empty briefing', () => {
  expect(buildBriefing(empty, { date: '2026-10-14', todos: [] }, now)).toMatchInlineSnapshot(`
    "<b>10월 14일 (수) 아침 브리핑</b>

    오늘 챙길 일이 없습니다. 여유로운 하루예요.

    <a href="https://yg.justrunlab.com">Yggdrasil 열기</a>"
  `);
});

it('escapes HTML, orders P1 then time, splits overdue and recurring, counts waiting and stale', () => {
  const lateOld = todo('오래 밀린 <일>', { key: 'YG-3', ...allDay('2026-09-20') });
  const lateTimed = todo('어제 저녁', { dueAt: kst('2026-10-13T21:00:00').toISOString() });
  const lateToday = todo('오늘 새벽', { dueAt: kst('2026-10-14T06:00:00').toISOString() });
  const lateMid = todo('중간', allDay('2026-10-10'));
  const view = {
    ...empty,
    today: [
      todo('그냥 할 일 & 메모', allDay('2026-10-14')),
      todo('회의', { dueAt: kst('2026-10-14T15:00:00').toISOString() }),
      todo('급한 일', { priority: 'p1', key: 'YG-29', dueAt: kst('2026-10-14T09:30:00').toISOString() }),
      todo('일찍 시작', { scheduledAt: kst('2026-10-14T08:00:00').toISOString() }),
      todo('운동', { dueAt: kst('2026-10-14T07:30:00').toISOString(), recurrence: { id: 'r', freq: 'daily', weekdays: null, monthDay: null, time: '07:30', paused: false } }),
      lateOld, lateTimed, lateToday, lateMid
    ],
    overdue: [lateOld, lateTimed, lateToday, lateMid],
    waiting: [todo('답장 대기', { hold: 'waiting' }), todo('막힘', { hold: 'blocked' })]
  };
  const stale = { date: '2026-10-14', todos: [{ ...lateOld, stale: { overdueDays: 24, untouchedDays: null } } as StaleTodo] };
  expect(buildBriefing(view, stale, now)).toMatchInlineSnapshot(`
    "<b>10월 14일 (수) 아침 브리핑</b>

    <b>오늘 할 일</b> 4건
    • <b>P1</b> 09:30 <code>YG-29</code> 급한 일
    • 08:00 일찍 시작
    • 15:00 회의
    • 그냥 할 일 &amp; 메모

    <b>밀린 일</b> 4건 · 가장 오래된 것 24일 지남
    • <code>YG-3</code> 오래 밀린 &lt;일&gt; · 24일 지남
    • 중간 · 4일 지남
    • 어제 저녁 · 오늘 지남

    <b>기다리는 중</b> 2건 · <b>방치</b> 1건

    <b>오늘 반복</b>
    • 07:30 운동

    <a href="https://yg.justrunlab.com">Yggdrasil 열기</a>"
  `);
});

it('caps 오늘 할 일 at 8 and clips long titles; empty overdue says 없음', () => {
  const view = { ...empty, today: Array.from({ length: 11 }, (_, i) => todo(i === 0 ? '가'.repeat(80) : `할 일 ${i}`)) };
  const text = buildBriefing(view, { date: '2026-10-14', todos: [] }, now);
  expect(text).toContain('<b>오늘 할 일</b> 11건');
  expect(text).toContain(`• ${'가'.repeat(59)}…\n`);
  expect(text).toContain('• 할 일 7\n… 외 3건');
  expect(text).not.toContain('할 일 8');
  expect(text).toContain('<b>밀린 일</b> 없음');
});

// ---- Sender ----

it('sends HTML to the chat and retries once on 5xx, never on 4xx; errors do not leak the token', async () => {
  await sendTelegram('hi', TOKEN, '42');
  expect(sent).toEqual([{ url: `https://api.telegram.org/bot${TOKEN}/sendMessage`, body: { chat_id: '42', text: 'hi', parse_mode: 'HTML', link_preview_options: { is_disabled: true } } }]);

  sent = []; reply = () => Response.json({ ok: false, description: 'Bad Gateway' }, { status: 502 });
  await expect(sendTelegram('hi', TOKEN, '42')).rejects.toThrow('Telegram sendMessage failed: 502 Bad Gateway');
  expect(sent).toHaveLength(2);

  sent = []; reply = () => Response.json({ ok: false, description: 'Bad Request: chat not found' }, { status: 400 });
  await expect(sendTelegram('hi', TOKEN, '42')).rejects.toThrow('400 Bad Request: chat not found');
  expect(sent).toHaveLength(1);

  sent = []; reply = () => { throw new TypeError(`fetch failed for https://api.telegram.org/bot${TOKEN}/sendMessage`); };
  const error = await sendTelegram('hi', TOKEN, '42').catch((failure: Error) => failure);
  expect(sent).toHaveLength(2);
  expect(String(error)).not.toContain(TOKEN);
});

// ---- Scheduler endpoint ----

it('rejects /run without BRIEFING_SECRET (503), with a missing or wrong secret (401), and when Telegram is unset (503)', async () => {
  expect((await run({ 'x-briefing-secret': 'anything' })).status).toBe(503);
  process.env.BRIEFING_SECRET = env.BRIEFING_SECRET;
  expect((await run()).status).toBe(401);
  expect((await run({ 'x-briefing-secret': 'wrong' })).status).toBe(401);
  const unconfigured = await run({ 'x-briefing-secret': env.BRIEFING_SECRET });
  expect(unconfigured.status).toBe(503);
  expect(await unconfigured.json()).toEqual({ error: 'Morning briefing is not configured: set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, BRIEFING_OWNER_ID', missing: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'BRIEFING_OWNER_ID'] });
  process.env.TELEGRAM_BOT_TOKEN = TOKEN; process.env.TELEGRAM_CHAT_ID = '42'; process.env.BRIEFING_OWNER_ID = 'not-a-uuid';
  expect((await (await run({ 'x-briefing-secret': env.BRIEFING_SECRET })).json()).missing).toEqual(['BRIEFING_OWNER_ID']);
  expect(sent).toHaveLength(0);
});

it('/run sends once per Seoul day; force=1 sends again without marking the day', async () => {
  const me = owner();
  await updateBriefingSettings(me.id, { sendTime: '00:00' });
  await createTodo(me.id, { area: '일반', title: '브리핑 <확인>', priority: 'p1' });
  const auth = { 'x-briefing-secret': env.BRIEFING_SECRET };
  const first = await run(auth);
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ sent: true });
  expect(sent).toHaveLength(1);
  expect(sent[0]!.body.text).toContain('<b>P1</b> 브리핑 &lt;확인&gt;');
  expect(await (await run(auth)).json()).toMatchObject({ sent: false, reason: 'already-sent' });
  expect(await (await run(auth, '?force=1')).json()).toMatchObject({ sent: true });
  expect(sent).toHaveLength(2);
});

it('gates on send_time and enabled, keeps the day on failure so the next run retries', async () => {
  const me = owner();
  expect(await runBriefing(me.id, { now: kst('2026-10-14T06:59:00') })).toEqual({ sent: false, date: '2026-10-14', reason: 'before-send-time' });
  reply = () => Response.json({ ok: false }, { status: 500 });
  await expect(runBriefing(me.id, { now: kst('2026-10-14T07:00:00') })).rejects.toThrow('500');
  expect(await lastSent(me.id)).toBeNull();
  reply = () => Response.json({ ok: true });
  expect(await runBriefing(me.id, { now: kst('2026-10-14T07:30:00') })).toEqual({ sent: true, date: '2026-10-14' });
  expect(await lastSent(me.id)).toBe('2026-10-14');
  expect(await runBriefing(me.id, { now: kst('2026-10-14T23:30:00') })).toMatchObject({ reason: 'already-sent' });
  expect(await runBriefing(me.id, { now: kst('2026-10-15T06:30:00') })).toMatchObject({ reason: 'before-send-time' });
  await runBriefing(me.id, { now: kst('2026-10-15T06:30:00'), force: true });
  expect(await lastSent(me.id)).toBe('2026-10-14');
  await updateBriefingSettings(me.id, { enabled: false });
  expect(await runBriefing(me.id, { now: kst('2026-10-15T08:00:00') })).toMatchObject({ reason: 'disabled' });
});

it('serializes concurrent triggers into one send', async () => {
  const me = owner();
  const at = { now: kst('2026-10-16T07:00:00') };
  const results = await Promise.all([runBriefing(me.id, at), runBriefing(me.id, at), runBriefing(me.id, at)]);
  expect(results.filter((result) => result.sent)).toHaveLength(1);
  expect(sent).toHaveLength(1);
});

// ---- Settings + test send ----

it('keeps settings per owner and validates input', async () => {
  const a = owner(false);
  const b = owner(false);
  const put = (headers: Record<string, string>, body: unknown) => app.request('/api/briefing/settings', { method: 'PUT', headers, body: JSON.stringify(body) });
  expect((await app.request('/api/briefing/settings')).status).toBe(401);
  expect(await (await put(a.headers, { enabled: false, sendTime: '06:30' })).json()).toMatchObject({ enabled: false, sendTime: '06:30', lastSentDate: null });
  expect(await (await app.request('/api/briefing/settings', { headers: b.headers })).json())
    .toEqual({ enabled: true, sendTime: '07:00', lastSentDate: null, missing: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'BRIEFING_OWNER_ID'], isOwner: false });
  expect((await put(a.headers, { sendTime: '7:00' })).status).toBe(400);
  expect((await put(a.headers, { sendTime: '24:00' })).status).toBe(400);
  expect((await put(a.headers, { ownerId: b.id })).status).toBe(400);
  expect((await app.request('/api/briefing/settings', { headers: a.headers })).status).toBe(200);
});

it('test send: 503 unconfigured, 403 for a non-owner, owner sends with force', async () => {
  const other = owner(false);
  expect((await app.request('/api/briefing/test', { method: 'POST', headers: other.headers })).status).toBe(503);
  const me = owner();
  expect((await app.request('/api/briefing/test', { method: 'POST', headers: other.headers })).status).toBe(403);
  await updateBriefingSettings(me.id, { enabled: false, sendTime: '23:59' });
  const response = await app.request('/api/briefing/test', { method: 'POST', headers: me.headers });
  expect(response.status).toBe(200);
  expect(sent).toHaveLength(1);
  expect(await lastSent(me.id)).toBeNull();
  expect((await (await app.request('/api/briefing/settings', { headers: me.headers })).json())).toMatchObject({ missing: [], isOwner: true });
  reply = () => Response.json({ ok: false, description: 'Unauthorized' }, { status: 401 });
  expect((await app.request('/api/briefing/test', { method: 'POST', headers: me.headers })).status).toBe(502);
});
