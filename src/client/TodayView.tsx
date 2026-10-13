import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ListChecks, Repeat, Undo2, X } from 'lucide-react';
import type { BulkResult, CalendarGhost, LateTodo, Priority, Todo, TodayView as Today } from '../contracts/items.js';
import { lateBuckets } from '../contracts/stale.js';
import { seoulDay, seoulTime } from '../contracts/dates.js';
import { HoldBadge, PriorityBadge } from './format.js';
import { TodoDetail } from './TodoDetail.js';
import { BulkActions, SelectBox, plusDays, useSelection, type Selection } from './BulkActions.js';
import { seoulMinutes } from './calendar-dates.js';
import { TriageDialog } from './TriageDialog.js';

// YG-34 오늘 작업대: 타임라인 | 오늘 할 일 | 밀린 일 레일. ≥1100px three columns, 720–1100 two (timeline on top), <720 segmented tabs.
// Data is one GET /api/todos/today; 밀린 일 (server-merged 마감 지남 ∪ 방치) is shown only there, never twice.
type Pane = 'today' | 'late' | 'plan';
type Toast = { text: string; undo?: () => Promise<void>; error?: boolean };
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const priorities: Priority[] = ['p1', 'p2', 'p3', 'p4'];

export function TodayView({ token, onActivity }: { token: string; onActivity?: () => void }) {
  const [view, setView] = useState<Today | null>(null);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(() => new Set()); // optimistically completed / moved
  const [openId, setOpenId] = useState<string | null>(null);
  // YG-43: 회고's `#/today/stale` link lands on 밀린 일 and opens 정리 모드 once.
  const [pane, setPane] = useState<Pane>(() => location.hash === '#/today/stale' ? 'late' : 'today');
  const [triage, setTriage] = useState<LateTodo[] | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const selection = useSelection();
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  async function load() {
    try {
      const response = await fetch('/api/todos/today', { headers });
      if (!response.ok) throw new Error();
      const next: Today = await response.json();
      setView(next); setHidden(new Set()); setError('');
      if (location.hash === '#/today/stale') { history.replaceState(null, '', '#/today'); if (next.late.length) setTriage(next.late); }
    } catch { setError('오늘 할 일을 불러오지 못했습니다.'); }
  }
  useEffect(() => { void load(); }, [token]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 10_000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (selection.active) setToast(null); }, [selection.active]);

  if (error && !view) return <p role="alert" className="alert">{error}</p>;
  if (!view) return <p role="status" className="empty">오늘 할 일을 불러오는 중…</p>;

  const hide = (ids: string[], on = true) => setHidden((prev) => { const next = new Set(prev); for (const id of ids) if (on) next.add(id); else next.delete(id); return next; });
  const lateIds = new Set(view.late.map((todo) => todo.id));
  const show = (list: Todo[]) => list.filter((todo) => !hidden.has(todo.id) && !lateIds.has(todo.id));
  // Past-due todos the server left out of 밀린 일 are in 백로그 — put away on purpose, so not in 오늘 either.
  const todayList = show(view.today).filter((todo) => !(todo.status === 'backlog' && todo.dueAt && seoulDay(todo.dueAt) < view.date));
  const waiting = show(view.waiting);
  const week = show(view.week);
  const late = view.late.filter((todo) => !hidden.has(todo.id));
  const order = [...todayList, ...waiting, ...week].map((todo) => todo.id);
  const open = openId ? [...view.today, ...view.waiting, ...view.week, ...view.late, ...view.timeline.todos].find((todo) => todo.id === openId) : undefined;
  const changed = () => { void load(); onActivity?.(); };

  async function post(url: string, body?: unknown) {
    const response = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error();
    return response.json();
  }

  async function complete(todo: Todo) {
    hide([todo.id]); setToast(null);
    try { await post(`/api/todos/${todo.id}/complete`); onActivity?.(); }
    catch { hide([todo.id], false); setToast({ text: `'${todo.title}'을(를) 완료하지 못했습니다. 다시 시도하세요.`, error: true }); }
  }

  // Quick actions and 전부 백로그로: hide at once, one bulk call, toast undo sends the snapshots back.
  async function apply(ids: string[], action: object, label: string) {
    if (!ids.length) return;
    hide(ids);
    try {
      const result: BulkResult = await post('/api/todos/bulk', { ...action, ids });
      changed();
      setToast({ text: `${result.todos.length}개 ${label}`, undo: async () => { await post('/api/todos/bulk', { action: 'restore', items: result.previous }); changed(); } });
    } catch { hide(ids, false); setToast({ text: '변경하지 못했습니다. 다시 시도하세요.', error: true }); }
  }

  const date = new Date(`${view.date}T00:00:00+09:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul' });
  const counts = priorities.map((priority) => [priority, todayList.filter((todo) => todo.priority === priority).length] as const).filter(([, count]) => count > 0);
  const hiddenOn = (target: Pane) => pane === target ? '' : 'max-[719px]:hidden';
  const rowProps = { selection, order, date: view.date, onOpen: setOpenId, onComplete: complete };

  return <section aria-label="오늘" className="space-y-3 pb-24 md:pb-6">
    <div className="flex items-center gap-2">
      <p className="flex-1 text-sm text-muted">{date}</p>
      <button type="button" className="btn btn-ghost" aria-pressed={selection.mode} onClick={() => selection.mode ? selection.clear() : selection.setMode(true)}>
        <ListChecks />{selection.mode ? '선택 끝내기' : '선택'}</button>
    </div>
    <div role="tablist" aria-label="오늘 보기" className="grid grid-cols-3 gap-1 rounded-lg bg-sunken p-1 min-[720px]:hidden">
      {([['today', '오늘', todayList.length], ['late', '밀린 일', late.length], ['plan', '예정', waiting.length + week.length]] as const).map(([id, label, count]) =>
        <button key={id} type="button" role="tab" aria-selected={pane === id} onClick={() => setPane(id)}
          className="h-8 rounded-md text-sm font-medium text-muted aria-selected:bg-surface aria-selected:text-ink aria-selected:shadow-card">
          {label} <span className={`tabular-nums ${id === 'late' && count ? 'text-danger' : 'text-faint'}`}>{count}</span></button>)}
    </div>
    <div className="grid items-start gap-3 min-[720px]:grid-cols-2 min-[1100px]:grid-cols-[minmax(220px,1fr)_minmax(360px,1.6fr)_minmax(260px,1fr)]">
      <Timeline className={`max-[719px]:order-last min-[720px]:col-span-2 min-[1100px]:col-span-1 ${hiddenOn('today')}`} date={view.date}
        todos={view.timeline.todos.filter((todo) => !hidden.has(todo.id))} ghosts={view.timeline.ghosts} onOpen={setOpenId} />
      <Panel title="오늘 할 일" count={todayList.length} section="today" className={hiddenOn('today')}
        extra={counts.length > 0 && <span className="text-xs font-normal tabular-nums text-muted">{counts.map(([priority, count]) => `${priority.toUpperCase()} ${count}`).join(' · ')}</span>}>
        {todayList.length === 0 ? <p className="empty">오늘 챙길 일이 없습니다. 여유로운 하루예요.</p> :
          <ul>{todayList.map((todo) => <Row key={todo.id} todo={todo} {...rowProps}
            onTomorrow={() => void apply([todo.id], { action: 'snooze', until: plusDays(view.date, 1) }, '내일로 미뤘습니다')} />)}</ul>}
      </Panel>
      <div className="grid min-w-0 gap-3">
        <LatePanel late={late} className={hiddenOn('late')} onOpen={setOpenId}
          onBacklog={() => void apply(late.slice(0, 200).map((todo) => todo.id), { action: 'backlog' }, '백로그로 옮겼습니다')} // ponytail: bulk caps at 200 ids
          onTriage={() => setTriage(late)} />
        <Panel title="기다리는 중" count={waiting.length} section="waiting" className={hiddenOn('plan')}>
          {waiting.length === 0 ? <p className="px-3 py-3 text-xs text-faint">기다리는 일이 없습니다.</p> : <ul>{waiting.map((todo) => <Row key={todo.id} todo={todo} {...rowProps} />)}</ul>}
        </Panel>
        <Panel title="이번 주 예정" count={week.length} section="week" className={hiddenOn('plan')}>
          {week.length === 0 ? <p className="px-3 py-3 text-xs text-faint">이번 주에 예정된 일이 없습니다.</p> : <ul>{week.map((todo) => <Row key={todo.id} todo={todo} {...rowProps} />)}</ul>}
        </Panel>
      </div>
    </div>
    <BulkActions selection={selection} headers={headers} onApplied={changed} />
    {toast && !selection.active && <div role="status" className="card fixed inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-xl items-center gap-2 px-3 py-2 shadow-pop md:bottom-6 md:left-[calc(208px+1.5rem)]">
      <span className={`min-w-0 flex-1 truncate text-sm ${toast.error ? 'text-danger' : ''}`}>{toast.text}</span>
      {toast.undo && <button type="button" className="btn" onClick={() => { const undo = toast.undo!; setToast(null); undo().catch(() => setToast({ text: '되돌리지 못했습니다.', error: true })); }}><Undo2 />되돌리기</button>}
      <button type="button" className="btn btn-ghost size-7 p-0" aria-label="알림 닫기" onClick={() => setToast(null)}><X /></button>
    </div>}
    {open && <TodoDetail key={open.id} issue={open} area={open.area} headers={headers} onClose={() => setOpenId(null)} onSaved={changed} />}
    {triage && <TriageDialog items={triage} date={view.date} headers={headers} onDecided={(id, on) => hide([id], on)} onClose={() => { setTriage(null); changed(); }} />}
  </section>;
}

function Panel({ title, count, section, extra, className = '', children }: { title: string; count: number; section: string; extra?: ReactNode; className?: string; children: ReactNode }) {
  return <section aria-label={title} data-section={section} className={`card min-w-0 overflow-hidden ${className}`}>
    <h2 className="flex h-10 items-center gap-1.5 border-b border-line px-3 text-sm font-semibold">
      {title}<span className={`font-normal tabular-nums ${section === 'late' && count ? 'text-danger' : 'text-faint'}`}>{count}</span>
      <span className="flex-1" />{extra}
    </h2>
    {children}
  </section>;
}

/** Due (else scheduled) as a short badge: today → '오늘' or 'HH:mm' (red once past), other days → '금 10/16' or '수 20:00'. */
function WhenBadge({ todo, date }: { todo: Todo; date: string }) {
  const at = todo.dueAt ?? todo.scheduledAt;
  if (!at) return null;
  const allDay = todo.dueAt ? todo.dueAllDay : todo.scheduledAllDay;
  const day = seoulDay(at);
  const past = allDay ? day < date : Date.parse(at) < Date.now();
  const text = day === date ? allDay ? '오늘' : seoulTime(at)
    : `${weekdays[new Date(`${day}T00:00:00Z`).getUTCDay()]} ${allDay ? `${Number(day.slice(5, 7))}/${Number(day.slice(8))}` : seoulTime(at)}`;
  const tone = past ? 'bg-danger-soft text-danger' : !allDay ? 'bg-accent-soft text-accent-ink' : '';
  return <span className={`badge tabular-nums ${tone}`} data-overdue={past || undefined} title={todo.dueAt ? '마감' : '예정'}>{text}{past && !allDay ? ' 지남' : ''}</span>;
}

function Row({ todo, date, selection, order, onOpen, onComplete, onTomorrow }: {
  todo: Todo; date: string; selection: Selection; order: string[]; onOpen: (id: string) => void; onComplete: (todo: Todo) => void; onTomorrow?: () => void;
}) {
  const press = useRef<{ timer?: ReturnType<typeof setTimeout>; fired?: boolean }>({});
  const checked = selection.selected.has(todo.id);
  const toggle = (range: boolean) => selection.toggle(todo.id, range, order);
  // Long-press (touch) enters select mode with this row selected.
  const start = (event: React.PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    press.current = { timer: setTimeout(() => { press.current.fired = true; selection.setMode(true); if (!checked) toggle(false); navigator.vibrate?.(10); }, 450) };
  };
  const cancel = () => clearTimeout(press.current.timer);
  return <li data-todo-id={todo.id} className={`group flex min-h-9 items-center gap-2 border-b border-line px-3 last:border-b-0 hover:bg-sunken/70 ${checked ? 'bg-accent-soft' : ''}`}>
    <SelectBox label={todo.title} checked={checked} onToggle={toggle}
      className={selection.active ? '' : 'hidden md:block md:opacity-0 md:focus:opacity-100 md:group-hover:opacity-100'} />
    <button type="button" role="checkbox" aria-checked="false" aria-label={`${todo.title} 완료`} onClick={() => onComplete(todo)}
      className="group/check grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] border-line-strong hover:border-accent hover:bg-accent-soft">
      <Check className="size-2.5 text-accent opacity-0 group-hover/check:opacity-100" strokeWidth={3.5} />
    </button>
    <button type="button" className="min-w-0 flex-1 select-none truncate py-2 text-left text-sm [-webkit-touch-callout:none]" onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onClick={(event) => { if (press.current.fired) { press.current.fired = false; return; } if (selection.mode) toggle(event.shiftKey); else onOpen(todo.id); }}>
      {todo.key && <span className="badge mr-1.5 font-mono font-medium">{todo.key}</span>}{todo.title}
    </button>
    <span className="flex shrink-0 items-center gap-1">
      {onTomorrow && <span className="hidden gap-1 md:group-focus-within:flex md:group-hover:flex">
        <button type="button" className="btn h-6 px-1.5 text-xs" onClick={onTomorrow}>내일</button>
        <button type="button" className="btn h-6 px-1.5 text-xs" onClick={() => onComplete(todo)}>완료</button>
      </span>}
      <PriorityBadge priority={todo.priority} />
      {todo.hold && todo.hold !== 'scheduled' && <HoldBadge hold={todo.hold} reason={todo.holdReason} />}
      <WhenBadge todo={todo} date={date} />
      {todo.recurrence && !todo.recurrence.paused && <Repeat className="size-3 text-faint" aria-label="반복" />}
      <span className="hidden max-w-20 truncate text-xs text-faint sm:inline">{todo.hold && todo.holdReason ? todo.holdReason : todo.area}</span>
    </span>
  </li>;
}

function LatePanel({ late, className, onOpen, onBacklog, onTriage }: { late: LateTodo[]; className: string; onOpen: (id: string) => void; onBacklog: () => void; onTriage: () => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  return <Panel title="밀린 일" count={late.length} section="late" className={className}>
    {late.length === 0 ? <p className="empty">밀린 일이 없습니다.</p> : lateBuckets.map(([bucket, label]) => {
      const items = late.filter((todo) => todo.bucket === bucket);
      if (!items.length) return null;
      const all = expanded.has(bucket);
      const rest = items.length - 3;
      return <div key={bucket} data-bucket={bucket} className="border-b border-line px-3 py-2">
        <p className="flex items-center justify-between text-xs"><b className="font-semibold">{label}</b><span className="tabular-nums text-muted">{items.length}</span></p>
        <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden><span className="block h-full rounded-full bg-danger" style={{ width: `${Math.max(4, (items.length / late.length) * 100)}%` }} /></div>
        <ul>{(all ? items : items.slice(0, 3)).map((todo) => <li key={todo.id} data-todo-id={todo.id}>
          <button type="button" className="flex w-full items-center gap-2 rounded py-0.5 text-left text-sm hover:text-accent-ink" onClick={() => onOpen(todo.id)}>
            <span className="min-w-0 flex-1 truncate">{todo.title}</span>
            <span className={`shrink-0 text-xs tabular-nums ${todo.lateDays !== null ? 'text-danger' : 'text-warn'}`} title={todo.lateDays !== null ? `마감 ${todo.lateDays}일 지남` : `${todo.untouchedDays}일 동안 그대로`}>
              {todo.age}일{todo.lateDays === null ? ' 그대로' : ''}</span>
          </button>
        </li>)}</ul>
        {rest > 0 && <button type="button" className="mt-0.5 text-xs text-muted hover:text-ink" aria-expanded={all}
          onClick={() => setExpanded((prev) => { const next = new Set(prev); if (!next.delete(bucket)) next.add(bucket); return next; })}>{all ? '접기' : `+ ${rest}개`}</button>}
      </div>;
    })}
    <div className="flex gap-2 p-3">
      <button type="button" className="btn flex-1" disabled={!late.length} onClick={onBacklog}>전부 백로그로</button>
      <button type="button" className="btn btn-primary flex-1" disabled={!late.length} onClick={onTriage}>하나씩 정리</button>
    </div>
  </Panel>;
}

/** Today's timed todos (due, else scheduled) and upcoming series occurrences on an hour grid, scrolled to now. */
function Timeline({ date, todos, ghosts, onOpen, className }: { date: string; todos: Todo[]; ghosts: CalendarGhost[]; onOpen: (id: string) => void; className: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);
  const entries = [
    ...todos.map((todo) => ({ id: todo.id, at: todo.dueAt && !todo.dueAllDay ? todo.dueAt : todo.scheduledAt!, title: todo.title, todo })),
    ...ghosts.map((ghost) => ({ id: `${ghost.recurrenceId}-${ghost.at}`, at: ghost.at, title: ghost.title, todo: null }))
  ].sort((a, b) => a.at.localeCompare(b.at));
  const isToday = seoulDay(now) === date;
  const nowMinutes = seoulMinutes(now.toISOString());
  const first = Math.min(7, ...(isToday ? [Math.floor(nowMinutes / 60)] : []), ...entries.map((entry) => Math.floor(seoulMinutes(entry.at) / 60)));
  const hours = Array.from({ length: 24 - first }, (_, i) => first + i);
  useEffect(() => {
    const row = box.current?.querySelector<HTMLElement>(`[data-hour="${Math.max(first, Math.floor(nowMinutes / 60) - 1)}"]`);
    if (box.current && row) box.current.scrollTop = row.offsetTop;
  }, [entries.length > 0]);
  return <Panel title="타임라인" count={entries.length} section="timeline" className={className}>
    {entries.length === 0 ? <p className="px-3 py-4 text-center text-xs text-faint">오늘 시간이 정해진 일이 없습니다.<br />종일 할 일은 오늘 할 일 목록에 있습니다.</p> : <>
      <div ref={box} className="relative max-h-[220px] overflow-y-auto min-[1100px]:max-h-[calc(100dvh-13rem)]">
        {hours.map((hour) => <div key={hour} data-hour={hour} className="relative grid min-h-9 grid-cols-[40px_minmax(0,1fr)] border-b border-dashed border-line last:border-b-0">
          <span className="px-2 pt-1.5 text-right text-2xs tabular-nums text-faint">{String(hour).padStart(2, '0')}</span>
          <div className="space-y-1 py-1 pr-2">{entries.filter((entry) => Math.floor(seoulMinutes(entry.at) / 60) === hour).map((entry) => {
            const past = isToday && Date.parse(entry.at) < now.getTime();
            const body = <><span className="mr-1.5 tabular-nums">{seoulTime(entry.at)}</span>{entry.title}{!entry.todo && <span className="ml-1 text-2xs opacity-80">· 반복 예정</span>}</>;
            return entry.todo
              ? <button key={entry.id} type="button" onClick={() => onOpen(entry.todo!.id)} className={`block w-full truncate rounded-md bg-accent-soft px-2 py-1 text-left text-xs font-medium text-accent-ink hover:bg-accent/15 ${past ? 'opacity-55' : ''}`}>{body}</button>
              : <p key={entry.id} className="truncate rounded-md bg-warn-soft px-2 py-1 text-xs font-medium text-warn">{body}</p>;
          })}</div>
          {isToday && Math.floor(nowMinutes / 60) === hour && <div data-now className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-danger" style={{ top: `${((nowMinutes % 60) / 60) * 100}%` }}>
            <span className="absolute -top-[5px] left-9 size-2 rounded-full bg-danger" /><span className="sr-only">지금 {seoulTime(now)}</span>
          </div>}
        </div>)}
      </div>
      <p className="border-t border-line px-3 py-2 text-2xs text-faint">빨간 선 = 지금 · 종일 할 일은 가운데 목록에</p>
    </>}
  </Panel>;
}
