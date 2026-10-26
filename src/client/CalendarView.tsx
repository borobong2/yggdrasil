import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DndContext, DragOverlay, KeyboardCode, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core';
import { ChevronDown, ChevronLeft, ChevronRight, Repeat, Undo2, X } from 'lucide-react';
import type { CalendarDateBasis, CalendarGhost, CalendarView as Calendar, Priority, Todo } from '../contracts/items.js';
import { addDays, calendarDateInput, dayOf, modes, monthGrid, moveKeepingTime, parseCalendarHash, rangeOf, seoulMinutes, shift, slotAt, today, type CalendarMode } from './calendar-dates.js';
import { formatDue, HoldBadge, isOverdue, PriorityBadge } from './format.js';
import { CalendarCreate } from './CalendarCreate.js';
import { TodoDetail } from './TodoDetail.js';

// YG-30 calendar. Position lives in the hash (#/calendar/<mode>/<day>); data comes from GET /api/calendar for the visible range.
const modeLabels: Record<CalendarMode, string> = { month: '월', week: '주', '3day': '3일', day: '일', list: '목록' };
const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
const priorityDots: Record<Priority, string> = { p1: 'bg-danger', p2: 'bg-warn', p3: 'bg-info', p4: 'bg-line-strong' };
const HOUR = 48; // px per hour in the time grid
const phone = () => window.matchMedia('(max-width: 767px)').matches;
const label = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00Z`).toLocaleDateString('ko-KR', { timeZone: 'UTC', ...options });
const dayLabel = (day: string) => label(day, { month: 'long', day: 'numeric', weekday: 'short' });
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

type Drop = { day?: string; hour?: number; allDay?: boolean; undated?: boolean; label: string };
type Entry = { kind: 'todo'; todo: Todo; minutes: number; allDay: boolean } | { kind: 'ghost'; ghost: CalendarGhost; minutes: number; allDay: boolean };
type Toast = { text: string; undo?: () => void; error?: boolean };

function readHash() {
  const { view, day } = parseCalendarHash(location.hash);
  return { mode: view ?? (phone() ? '3day' : 'month'), day: day ?? today() };
}

// Pointer drags hit what is under the finger — only targets actually visible there, so hour slots scrolled out of the time
// grid never win over the all-day row. Keyboard drags snap to the nearest target.
const collision: CollisionDetection = (args) => {
  const point = args.pointerCoordinates;
  if (!point) return closestCorners(args);
  const hits = document.elementsFromPoint(point.x, point.y);
  return pointerWithin(args).filter((hit) => { const node = args.droppableContainers.find((entry) => entry.id === hit.id)?.node.current; return node && hits.includes(node); });
};
// Arrow keys jump the card to the nearest drop target in that direction (day cell, hour slot, all-day row, 날짜 없음).
const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context: { active, collisionRect, droppableRects, droppableContainers, over } }) => {
  const ahead: Record<string, (rect: DOMRect | { top: number; left: number }) => boolean> = {
    [KeyboardCode.Right]: (rect) => rect.left > collisionRect!.left, [KeyboardCode.Left]: (rect) => rect.left < collisionRect!.left,
    [KeyboardCode.Down]: (rect) => rect.top > collisionRect!.top, [KeyboardCode.Up]: (rect) => rect.top < collisionRect!.top
  };
  if (!ahead[event.code] || !active || !collisionRect) return undefined;
  event.preventDefault();
  const candidates = droppableContainers.getEnabled().filter((entry) => { const rect = droppableRects.get(entry.id); return rect && entry.id !== over?.id && ahead[event.code]!(rect); });
  const id = closestCorners({ active, collisionRect, droppableRects, droppableContainers: candidates, pointerCoordinates: null })[0]?.id;
  const rect = id === undefined ? undefined : droppableRects.get(id);
  return rect && { x: rect.left, y: rect.top };
};

export function CalendarView({ token, onActivity }: { token: string; onActivity?: () => void }) {
  const [{ mode, day }, setLocation] = useState(readHash);
  const [result, setResult] = useState<{ key: string; data: Calendar | null; error: string } | null>(null);
  const request = useRef(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [basis, setBasis] = useState<CalendarDateBasis>('effective');
  const fieldOf = (todo: Todo) => basis === 'due' ? 'dueAt' : basis === 'scheduled' || todo.scheduledAt ? 'scheduledAt' : 'dueAt';
  const dateOf = (todo: Todo) => todo[fieldOf(todo)];
  const allDayOf = (todo: Todo) => fieldOf(todo) === 'dueAt' ? todo.dueAllDay : todo.scheduledAllDay;
  const [showDone, setShowDone] = useState(false);
  const [createAt, setCreateAt] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Todo | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  const range = rangeOf(mode, day);
  const queryKey = JSON.stringify([token, range.from, range.to, showDone, basis]);
  const latestKey = useRef(queryKey);
  latestKey.current = queryKey;
  const data = result?.key === queryKey ? result.data : null;
  const error = result?.key === queryKey ? result.error : '';
  function setData(update: (view: Calendar | null) => Calendar | null) {
    if (latestKey.current !== queryKey) return;
    setResult((previous) => previous?.key === queryKey ? { ...previous, data: update(previous.data) } : previous);
  }
  const now = today();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } })
  );

  // Keep the full position in the URL so reload lands on the same view and date.
  useEffect(() => { if (location.hash !== `#/calendar/${mode}/${day}`) history.replaceState(null, '', `#/calendar/${mode}/${day}`); }, [mode, day]);
  useEffect(() => {
    const onHash = () => { if (location.hash.startsWith('#/calendar')) setLocation(readHash()); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 6000); return () => clearTimeout(timer); }, [toast]);

  async function load() {
    // A save may finish after navigation; its old closure must not start an obsolete reload.
    if (latestKey.current !== queryKey) return;
    const generation = ++request.current;
    setResult({ key: queryKey, data: null, error: '' });
    try {
      const response = await fetch(`/api/calendar?from=${range.from}&to=${range.to}${showDone ? '&done=1' : ''}&basis=${basis}`, { headers });
      if (!response.ok) throw new Error();
      const saved: Calendar = await response.json();
      if (generation === request.current && latestKey.current === queryKey) setResult({ key: queryKey, data: saved, error: '' });
    } catch {
      if (generation === request.current && latestKey.current === queryKey) setResult({ key: queryKey, data: null, error: '캘린더를 불러오지 못했습니다.' });
    }
  }
  const reload = useRef(load);
  reload.current = load;
  useEffect(() => { void load(); return () => { request.current++; }; }, [queryKey]);

  const go = (nextMode: CalendarMode, nextDay: string) => { location.hash = `#/calendar/${nextMode}/${nextDay}`; };

  // Places a todo in the right list for the current range after a local or server change.
  const place = (view: Calendar, todo: Todo): Calendar => {
    const others = { todos: view.todos.filter((item) => item.id !== todo.id), undated: view.undated.filter((item) => item.id !== todo.id) };
    const date = dateOf(todo);
    if (todo.status === 'done' && !showDone) return { ...view, ...others };
    const undated = todo.status === 'done' || todo.scheduledAt ? others.undated : [todo, ...others.undated];
    if (!date) return { ...view, ...others, undated };
    const inRange = dayOf(date) >= view.from && dayOf(date) <= view.to;
    return { ...view, ...others, undated, todos: inRange ? [...others.todos, todo] : others.todos };
  };

  async function patch(todo: Todo, changes: { scheduledAt: string | null }, text?: string, undoing = false) {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setToast(null);
    request.current++; // Reads started before this mutation must not overwrite its result.
    const iso = (value: string | null) => value && new Date(/T/.test(value) ? value : `${value}T00:00:00+09:00`).toISOString();
    const previous = { scheduledAt: calendarDateInput(todo.scheduledAt, todo.scheduledAllDay) };
    // Undo waits for authoritative data, since another explicit date edit may have happened since the move.
    if (!undoing) setData((view) => view && place(view, { ...todo, scheduledAt: iso(changes.scheduledAt), scheduledAllDay: !!changes.scheduledAt && !changes.scheduledAt.includes('T') }));
    try {
      const response = await fetch(`/api/todos/${todo.id}`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(changes) });
      if (!response.ok) throw new Error();
      const saved: Todo = await response.json();
      setData((view) => view && place(view, saved));
      if (basis === 'due' && !undoing && latestKey.current === queryKey) setBasis('effective');
      else void reload.current(); // Also refill a view cleared by an earlier failure-recovery load.
      onActivity?.();
      if (text) setToast({ text, undo: () => { void patch(saved, previous, undefined, true); } });
    } catch {
      void reload.current(); // Never roll back by replaying a stale full todo.
      setToast(undoing
        ? { text: '되돌리지 못했습니다. 다시 시도하세요.', error: true, undo: () => { void patch(todo, changes, undefined, true); } }
        : { text: `'${todo.title}'을(를) 옮기지 못했습니다. 기존 작업 예정을 다시 불러옵니다.`, error: true });
    } finally { savingRef.current = false; setSaving(false); }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const todo = active.data.current?.todo as Todo | undefined;
    const target = over?.data.current as Drop | undefined;
    if (!todo || !target || savingRef.current) return;
    const current = todo.scheduledAt;
    if (target.undated) {
      if (!current) return;
      return void patch(todo, { scheduledAt: null }, `'${todo.title}' 작업 예정을 해제했습니다. 마감·목표는 유지합니다.`);
    }
    let value: string;
    if (target.hour !== undefined) {
      // The drop time is where the dragged card's top edge sits in the day column, snapped to 15 minutes.
      const card = document.querySelector('[data-drag-overlay]')?.getBoundingClientRect();
      const column = document.querySelector(`[data-day-column="${target.day}"]`)?.getBoundingClientRect();
      const raw = card && column ? (card.top - column.top) / HOUR * 60 : target.hour * 60;
      value = slotAt(target.day!, Math.min(Math.max(Math.round(raw / 15) * 15, 0), 24 * 60 - 15));
    } else value = target.allDay || !current ? target.day! : moveKeepingTime(current, target.day!, todo.scheduledAllDay);
    if (current && new Date(/T/.test(value) ? value : `${value}T00:00:00+09:00`).getTime() === Date.parse(current) && todo.scheduledAllDay === !value.includes('T')) return;
    void patch(todo, { scheduledAt: value }, `'${todo.title}' 작업 예정: ${target.label}. 마감·목표는 유지합니다.`);
  }


  const entries = new Map<string, Entry[]>();
  const push = (key: string, entry: Entry) => entries.set(key, [...entries.get(key) ?? [], entry]);
  for (const todo of data?.todos ?? []) push(dayOf(dateOf(todo)!), { kind: 'todo', todo, allDay: allDayOf(todo), minutes: seoulMinutes(dateOf(todo)!) });
  for (const ghost of data?.ghosts ?? []) push(dayOf(ghost.at), { kind: 'ghost', ghost, allDay: ghost.allDay, minutes: seoulMinutes(ghost.at) });
  for (const list of entries.values()) list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.minutes - b.minutes || (a.kind === 'todo' ? a.todo.priority : a.ghost.priority).localeCompare(b.kind === 'todo' ? b.todo.priority : b.ghost.priority));
  const open = openId ? [...data?.todos ?? [], ...data?.undated ?? []].find((todo) => todo.id === openId) : undefined;
  const title = mode === 'month' ? label(day, { year: 'numeric', month: 'long' })
    : range.from === range.to ? label(day, { month: 'long', day: 'numeric', weekday: 'long' })
    : `${label(range.from, { month: 'long', day: 'numeric' })} – ${label(range.to, range.from.slice(0, 7) === range.to.slice(0, 7) ? { day: 'numeric' } : { month: 'long', day: 'numeric' })}`;
  const where = (drop?: Drop) => drop?.label ?? '놓을 수 없는 위치';
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${active.data.current?.todo.title} 일정을 들었습니다.`,
    // Silent while still over the card's own day, so the pick-up message is not overwritten at once.
    onDragOver: ({ active, over }) => { const todo: Todo = active.data.current?.todo; const drop = over?.data.current as Drop | undefined;
      return drop && drop.hour === undefined && (drop.undated ? !todo.scheduledAt : dateOf(todo) && drop.day === dayOf(dateOf(todo)!)) ? undefined : `${todo.title}: ${where(drop)}`; },
    onDragEnd: ({ active, over }) => over ? `${active.data.current?.todo.title}을(를) ${where(over.data.current as Drop)}에 놓았습니다.` : '놓지 않았습니다.',
    onDragCancel: ({ active }) => `이동을 취소했습니다. ${active.data.current?.todo.title}은(는) 원래 날짜에 있습니다.`
  };
  const props = { entries, now, onOpen: setOpenId, onCreate: setCreateAt, onDay: (date: string) => go('day', date) };

  return <section aria-label="캘린더" className="space-y-3 pb-28 md:pb-0">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn" onClick={() => go(mode, now)}>오늘</button>
      <div className="flex">
        <button type="button" className="btn btn-ghost size-[30px] p-0" aria-label="이전" onClick={() => go(mode, shift(mode, day, -1))}><ChevronLeft /></button>
        <button type="button" className="btn btn-ghost size-[30px] p-0" aria-label="다음" onClick={() => go(mode, shift(mode, day, 1))}><ChevronRight /></button>
      </div>
      <h2 className="min-w-0 flex-1 truncate text-lg font-semibold tabular-nums max-md:order-first max-md:w-full max-md:flex-none" aria-live="polite">{title}</h2>
      <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm text-muted">연·월 선택<input aria-label="연·월 선택" type="month" className="field w-36" value={day.slice(0, 7)} min="1900-01" max="2100-12" onChange={(event) => { const value = event.target.value; if (value >= '1900-01' && value <= '2100-12' && /^\d{4}-\d{2}$/.test(value) && parseCalendarHash(`#/calendar/month/${value}-01`).day) go(mode, `${value}-01`); }} /></label>
      <div role="group" aria-label="보기" className="flex rounded-md bg-sunken p-0.5 max-md:order-last max-md:w-full">
        {modes.map((item) => <button key={item} type="button" aria-pressed={item === mode} onClick={() => go(item, day)}
          className="h-[26px] flex-1 whitespace-nowrap rounded-[5px] px-2.5 text-sm font-medium text-muted aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-card">{modeLabels[item]}</button>)}
      </div>
      <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm text-muted">표시 기준<select aria-label="표시 기준" className="field" value={basis} onChange={(event) => setBasis(event.target.value as CalendarDateBasis)}><option value="effective">예정 우선</option><option value="due">마감일</option><option value="scheduled">예정일</option></select></label>
      <label className="flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" className="accent-[var(--color-accent)]" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} />완료 표시</label>
    </div>
    <p className="text-xs text-muted">드래그는 작업 예정만 바꿉니다. 예정이 없으면 실제 마감 위치에 표시합니다.</p>
    {saving && <p role="status" className="text-xs text-muted">작업 예정 저장 중…</p>}
    {error && <p role="alert" className="alert">{error} <button type="button" className="btn" onClick={() => void load()}>다시 시도</button></p>}
    {!data ? (!error && <p role="status" className="empty">캘린더를 불러오는 중…</p>) :
      <DndContext sensors={saving ? [] : sensors} collisionDetection={collision} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}
        onDragStart={({ active }) => { setDragging(active.data.current?.todo ?? null); document.querySelectorAll<HTMLElement>('[popover]').forEach((element) => element.matches(':popover-open') && element.hidePopover()); }}
        accessibility={{ announcements, screenReaderInstructions: { draggable: '스페이스를 누르면 일정을 듭니다. 방향키로 날짜·시간을 옮기고 스페이스로 놓으며, Esc로 취소합니다. Enter는 상세를 엽니다.' } }}>
        <div className="md:grid md:grid-cols-[minmax(0,1fr)_224px] 2xl:grid-cols-[minmax(0,1fr)_280px] md:gap-4">
          <div className="min-w-0">
            {mode === 'month' && <MonthGrid day={day} {...props} />}
            {(mode === 'week' || mode === '3day' || mode === 'day') && <TimeGrid days={Array.from({ length: mode === 'week' ? 7 : mode === '3day' ? 3 : 1 }, (_, index) => addDays(range.from, index))} {...props} />}
            {mode === 'list' && <Agenda from={range.from} to={range.to} {...props} />}
          </div>
          <Undated todos={data.undated} onOpen={setOpenId} />
        </div>
        <DragOverlay dropAnimation={null}>{dragging ? <div data-drag-overlay className="w-full"><ChipFace todo={dragging} now={now} lifted /></div> : null}</DragOverlay>
      </DndContext>}
    {toast && <div role="status" className="card fixed inset-x-4 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center gap-2 px-3 py-2 shadow-pop md:bottom-6 md:left-[calc(208px+1.5rem)]">
      <span className={`min-w-0 flex-1 truncate text-sm ${toast.error ? 'text-danger' : ''}`}>{toast.text}</span>
      {toast.undo && <button type="button" className="btn" disabled={saving} onClick={toast.undo}><Undo2 />되돌리기</button>}
      <button type="button" className="btn btn-ghost size-7 p-0" aria-label="알림 닫기" onClick={() => setToast(null)}><X /></button>
    </div>}
    {createAt && <CalendarCreate at={createAt} field={basis === 'due' ? 'dueAt' : 'scheduledAt'} headers={headers} onClose={() => setCreateAt(null)} onSaved={() => { setCreateAt(null); void load(); onActivity?.(); }} />}
    {open && <TodoDetail key={open.id} issue={open} area={open.area} headers={headers} onClose={() => setOpenId(null)} onSaved={() => { void load(); onActivity?.(); }} />}
  </section>;
}

type GridProps = { entries: Map<string, Entry[]>; now: string; onOpen: (id: string) => void; onCreate: (at: string) => void; onDay: (day: string) => void };

function MonthGrid({ day, entries, now, onOpen, onCreate, onDay }: { day: string } & GridProps) {
  const month = day.slice(0, 7);
  return <div className="overflow-hidden rounded-lg border border-line bg-surface">
    <div className="grid grid-cols-7 border-b border-line bg-sunken/60">{weekdayNames.map((name) => <span key={name} className="py-1 text-center text-xs font-medium text-muted">{name}</span>)}</div>
    <div className="grid grid-cols-7">
      {monthGrid(day).map((cell) => <DayCell key={cell} day={cell} faded={cell.slice(0, 7) !== month} list={entries.get(cell) ?? []} now={now} onOpen={onOpen} onCreate={onCreate} onDay={onDay} />)}
    </div>
  </div>;
}

function DayCell({ day, faded, list, now, onOpen, onCreate, onDay }: { day: string; faded: boolean; list: Entry[]; now: string; onOpen: (id: string) => void; onCreate: (at: string) => void; onDay: (day: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}`, data: { day, label: dayLabel(day) } satisfies Drop });
  const shown = list.length > 3 ? list.slice(0, 2) : list;
  const popover = `more-${day}`;
  return <div ref={setNodeRef} onClick={(event) => { if (event.target === event.currentTarget) onCreate(day); }} data-day={day} aria-label={dayLabel(day)} role="group"
    className={`min-h-[76px] min-w-0 border-b border-r border-line p-0.5 transition-colors [&:nth-child(7n)]:border-r-0 md:min-h-[112px] md:p-1 ${isOver ? 'bg-accent-soft' : faded ? 'bg-sunken/40' : ''}`}>
    <button type="button" aria-label={`${dayLabel(day)} 하루 보기`} onClick={() => onDay(day)} className={`mb-0.5 grid size-5 place-items-center rounded-full text-2xs font-medium tabular-nums md:size-6 md:text-xs ${day === now ? 'bg-accent text-white' : faded ? 'text-faint' : 'text-muted'}`}>{Number(day.slice(8))}</button>
    <ul className="space-y-0.5">
      {shown.map((entry) => <li key={entry.kind === 'todo' ? entry.todo.id : entry.ghost.at + entry.ghost.recurrenceId}>
        {entry.kind === 'todo' ? <Chip todo={entry.todo} now={now} onOpen={onOpen} compact /> : <Ghost ghost={entry.ghost} compact />}</li>)}
    </ul>
    <button type="button" aria-label={`${dayLabel(day)} 할 일 추가`} className="mt-1 w-full rounded px-1 text-left text-xs text-faint hover:bg-sunken" onClick={() => onCreate(day)}>+ 추가</button>
    {list.length > 3 && <>
      <button type="button" popoverTarget={popover} className="mt-0.5 w-full truncate rounded-sm px-1 text-left text-2xs font-medium text-muted hover:bg-sunken">+{list.length - 2}개 더</button>
      <div id={popover} popover="auto" aria-label={`${dayLabel(day)} 전체`} className="card m-auto w-72 max-w-[calc(100vw-2rem)] p-2 shadow-pop">
        <p className="mb-1.5 px-1 text-sm font-semibold">{dayLabel(day)}</p>
        <ul className="space-y-1">{list.map((entry) => <li key={entry.kind === 'todo' ? entry.todo.id : entry.ghost.at + entry.ghost.recurrenceId}>
          {entry.kind === 'todo' ? <Chip todo={entry.todo} now={now} onOpen={onOpen} idPrefix="more:" /> : <Ghost ghost={entry.ghost} />}</li>)}</ul>
      </div>
    </>}
  </div>;
}

function TimeGrid({ days, entries, now, onOpen, onCreate }: { days: string[] } & GridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState(() => seoulMinutes(new Date().toISOString()));
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 6 * HOUR; }, [days.length]);
  useEffect(() => { const timer = setInterval(() => setClock(seoulMinutes(new Date().toISOString())), 60_000); return () => clearInterval(timer); }, []);
  const columns = { gridTemplateColumns: `40px repeat(${days.length}, minmax(0, 1fr))` };
  return <div className="overflow-hidden rounded-lg border border-line bg-surface">
    <div className="grid border-b border-line bg-sunken/60" style={columns}>
      <span />
      {days.map((day) => { const weekday = weekdayNames[new Date(`${day}T00:00:00Z`).getUTCDay()]; return <span key={day} className="flex items-center justify-center gap-1 py-1 text-xs text-muted">
        {weekday}<span className={`grid size-6 place-items-center rounded-full font-semibold tabular-nums ${day === now ? 'bg-accent text-white' : 'text-ink'}`}>{Number(day.slice(8))}</span></span>; })}
    </div>
    <div className="grid border-b border-line" style={columns}>
      <span className="pt-1 text-center text-2xs text-faint">종일</span>
      {days.map((day) => <AllDayCell key={day} day={day} list={(entries.get(day) ?? []).filter((entry) => entry.allDay)} now={now} onOpen={onOpen} onCreate={onCreate} />)}
    </div>
    <div ref={scroller} aria-label="시간표" className="max-h-[calc(100dvh-300px)] min-h-72 overflow-y-auto overscroll-contain">
      <div className="grid" style={columns}>
        <div>{Array.from({ length: 24 }, (_, hour) => <span key={hour} className="block pr-1 text-right text-2xs tabular-nums text-faint" style={{ height: HOUR }}>{hour ? `${hour}시` : ''}</span>)}</div>
        {days.map((day) => <DayColumn key={day} day={day} list={(entries.get(day) ?? []).filter((entry) => !entry.allDay)} now={now} clock={day === now ? clock : null} onOpen={onOpen} onCreate={onCreate} />)}
      </div>
    </div>
  </div>;
}

function AllDayCell({ day, list, now, onOpen, onCreate }: { day: string; list: Entry[]; now: string; onOpen: (id: string) => void; onCreate: (at: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `allday:${day}`, data: { day, allDay: true, label: `${dayLabel(day)} 종일` } satisfies Drop });
  return <ul ref={setNodeRef} data-allday={day} onClick={(event) => { if (event.target === event.currentTarget) onCreate(day); }} aria-label={`${dayLabel(day)} 종일`} className={`max-h-28 min-h-8 min-w-0 space-y-0.5 overflow-y-auto border-l border-line p-0.5 ${isOver ? 'bg-accent-soft' : ''}`}>
    <li><button type="button" className="text-xs text-faint" aria-label={`${dayLabel(day)} 종일 할 일 추가`} onClick={() => onCreate(day)}>+ 추가</button></li>
    {list.map((entry) => <li key={entry.kind === 'todo' ? entry.todo.id : entry.ghost.at + entry.ghost.recurrenceId}>
      {entry.kind === 'todo' ? <Chip todo={entry.todo} now={now} onOpen={onOpen} compact /> : <Ghost ghost={entry.ghost} compact />}</li>)}
  </ul>;
}

function DayColumn({ day, list, now, clock, onOpen, onCreate }: { day: string; list: Entry[]; now: string; clock: number | null; onOpen: (id: string) => void; onCreate: (at: string) => void }) {
  // ponytail: greedy lanes per day (overlaps share width evenly); per-cluster widths if days get crowded.
  const laneEnds: number[] = [];
  const placed = list.map((entry) => {
    const length = Math.max((entry.kind === 'todo' ? entry.todo.estimateMinutes : null) ?? 30, 20);
    let lane = laneEnds.findIndex((end) => end <= entry.minutes);
    if (lane < 0) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = entry.minutes + length;
    return { entry, lane, length };
  });
  const width = 100 / Math.max(laneEnds.length, 1);
  return <div data-day-column={day} className="relative min-w-0 border-l border-line">
    {Array.from({ length: 24 }, (_, hour) => <HourSlot key={hour} day={day} hour={hour} onCreate={onCreate} />)}
    {placed.map(({ entry, lane, length }) => <div key={entry.kind === 'todo' ? entry.todo.id : entry.ghost.at + entry.ghost.recurrenceId} className="absolute px-px"
      style={{ top: entry.minutes / 60 * HOUR, height: length / 60 * HOUR, left: `${lane * width}%`, width: `${width}%` }}>
      {entry.kind === 'todo' ? <Chip todo={entry.todo} now={now} onOpen={onOpen} time={entry.minutes} fill /> : <Ghost ghost={entry.ghost} time={entry.minutes} fill />}
    </div>)}
    {clock !== null && <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[1] h-0.5 bg-danger" style={{ top: clock / 60 * HOUR }} />}
  </div>;
}

function HourSlot({ day, hour, onCreate }: { day: string; hour: number; onCreate: (at: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${day}:${hour}`, data: { day, hour, label: `${dayLabel(day)} ${hour}시` } satisfies Drop });
  return <button type="button" aria-label={`${dayLabel(day)} ${hour}시 할 일 추가`} onClick={() => onCreate(slotAt(day, hour * 60))} ref={setNodeRef} data-slot={`${day}T${hour}`} className={`block w-full border-b border-line/70 ${isOver ? 'bg-accent-soft' : ''}`} style={{ height: HOUR }} />;
}

function Agenda({ from, to, entries, now, onOpen }: { from: string; to: string } & GridProps) {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) if (entries.has(day)) days.push(day);
  if (!days.length) return <p className="card empty">이 기간에는 일정이 없습니다.</p>;
  return <div className="space-y-4">
    {days.map((day) => <section key={day} aria-label={dayLabel(day)} data-agenda-day={day}>
      <h3 className={`mb-1.5 flex items-center gap-2 text-sm font-semibold ${day === now ? 'text-accent-ink' : ''}`}>{dayLabel(day)}{day === now && <span className="badge bg-accent-soft text-accent-ink">오늘</span>}</h3>
      <ul className="space-y-1">{entries.get(day)!.map((entry) => <li key={entry.kind === 'todo' ? entry.todo.id : entry.ghost.at + entry.ghost.recurrenceId}>
        {entry.kind === 'todo' ? <Chip todo={entry.todo} now={now} onOpen={onOpen} time={entry.allDay ? undefined : entry.minutes} row /> : <Ghost ghost={entry.ghost} time={entry.allDay ? undefined : entry.minutes} row />}</li>)}</ul>
    </section>)}
  </div>;
}

function Undated({ todos, onOpen }: { todos: Todo[]; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(() => !phone());
  const { setNodeRef, isOver } = useDroppable({ id: 'undated', data: { undated: true, label: '작업 예정 없음' } satisfies Drop });
  // Desktop: right column. Phone: a bottom sheet above the tab bar; its header stays a drop target while collapsed.
  return <aside ref={setNodeRef} aria-label="작업 예정 없음" data-undated
    className={`card overflow-hidden transition-colors max-md:fixed max-md:inset-x-2 max-md:bottom-[calc(3.75rem+env(safe-area-inset-bottom))] max-md:z-20 max-md:shadow-pop md:sticky md:top-16 md:self-start ${isOver ? 'border-accent bg-accent-soft' : ''}`}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm font-semibold">
      <span className="flex-1">작업 예정 없음 <span className="font-normal tabular-nums text-faint">{todos.length}</span></span>
      <ChevronDown className={`size-4 text-faint transition-transform ${open ? '' : '-rotate-90'}`} />
    </button>
    {open && <div className="max-h-[38dvh] overflow-y-auto border-t border-line p-2 md:max-h-[calc(100dvh-160px)]">
      {todos.length ? <ul className="space-y-1">{todos.map((todo) => <li key={todo.id}><Chip todo={todo} now="" onOpen={onOpen} idPrefix="unscheduled:" row /></li>)}</ul>
        : <p className="py-4 text-center text-xs text-faint">여기로 끌어 놓으면 작업 예정만 해제합니다. 마감·목표는 유지합니다.</p>}
    </div>}
  </aside>;
}

type ChipProps = { todo: Todo; now: string; onOpen: (id: string) => void; time?: number; compact?: boolean; fill?: boolean; row?: boolean; idPrefix?: string };

function Chip({ todo, now, onOpen, idPrefix = '', ...look }: ChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: idPrefix + todo.id, data: { todo } });
  return <button type="button" ref={setNodeRef} {...attributes} {...listeners} aria-roledescription="이동 가능한 일정" data-todo-id={todo.id} onClick={() => onOpen(todo.id)}
    className={`block w-full min-w-0 cursor-grab touch-manipulation select-none text-left [-webkit-touch-callout:none] active:cursor-grabbing ${look.fill ? 'h-full' : ''} ${isDragging ? 'opacity-40' : ''}`}>
    <ChipFace todo={todo} now={now} {...look} />
  </button>;
}

function ChipFace({ todo, now, time, fill, row, lifted }: Omit<ChipProps, 'onOpen'> & { lifted?: boolean }) {
  const late = isOverdue(todo);
  return <span data-late={late || undefined} className={`flex min-w-0 gap-1.5 overflow-hidden rounded-md border ${late ? 'border-danger/30 bg-danger-soft text-danger' : 'border-line bg-surface'} ${lifted ? 'shadow-pop' : ''}
    ${row ? 'items-center px-2.5 py-1.5 text-sm' : `px-1 text-2xs leading-4 md:text-xs ${fill ? 'h-full items-start py-0.5' : 'items-center py-px'}`}`}>
    <span className={`size-1.5 shrink-0 rounded-full ${priorityDots[todo.priority]} ${fill ? 'mt-[5px]' : ''}`} title={`우선순위 ${todo.priority.toUpperCase()}`} />
    {time !== undefined ? <span className={`shrink-0 tabular-nums text-muted ${row ? 'text-xs' : 'max-md:hidden'}`}>{hhmm(time)}</span> : null}
    <span className="min-w-0 flex-1">
      <span className={`block truncate ${todo.status === 'done' ? 'text-muted line-through' : ''}`}>{todo.title}</span>
      {(todo.dueAt || todo.targetAt) && <span className="block truncate text-2xs font-normal" title={[todo.dueAt && `실제 마감 ${formatDue(todo.dueAt, todo.dueAllDay)}`, todo.targetAt && `내부 목표 ${formatDue(todo.targetAt, todo.targetAllDay)}`].filter(Boolean).join(' · ')}>
        {todo.dueAt && `실제 마감 ${formatDue(todo.dueAt, todo.dueAllDay)}`}{todo.dueAt && todo.targetAt && ' · '}{todo.targetAt && `내부 목표 ${formatDue(todo.targetAt, todo.targetAllDay)}`}
      </span>}
    </span>
    {row && <span className="shrink-0 max-sm:hidden"><PriorityBadge priority={todo.priority} /></span>}
    {todo.hold && !fill && <span className={`shrink-0 ${row ? '' : 'max-md:hidden'}`}><HoldBadge hold={todo.hold} reason={todo.holdReason} /></span>}
    {todo.hold && !row && <span title="보류" className={`size-1.5 shrink-0 rounded-full ${fill ? 'mt-[5px]' : 'self-center md:hidden'} ${todo.hold === 'blocked' ? 'bg-danger' : todo.hold === 'waiting' ? 'bg-warn' : 'bg-info'}`} />}
  </span>;
}

function Ghost({ ghost, time, compact, fill, row }: { ghost: CalendarGhost; time?: number; compact?: boolean; fill?: boolean; row?: boolean }): ReactNode {
  return <span data-ghost={ghost.recurrenceId} title={`${ghost.title} · 반복 예정`} aria-label={`${ghost.title} 반복 예정`}
    className={`flex min-w-0 items-center gap-1 overflow-hidden rounded-md border border-dashed border-line-strong text-faint opacity-70 ${row ? 'px-2.5 py-1.5 text-sm' : `px-1 text-2xs leading-4 md:text-xs ${fill ? 'h-full items-start py-0.5' : compact ? 'py-px' : 'py-1'}`}`}>
    <Repeat className="size-3 shrink-0" />{time !== undefined ? <span className="shrink-0 tabular-nums max-md:hidden">{hhmm(time)}</span> : null}<span className="min-w-0 truncate">{ghost.title}</span>
  </span>;
}
