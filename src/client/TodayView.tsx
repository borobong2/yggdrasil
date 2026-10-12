import { useEffect, useRef, useState } from 'react';
import { Check, ListChecks } from 'lucide-react';
import type { Todo, TodayView as Today } from '../contracts/items.js';
import { DueBadge, HoldBadge, PriorityBadge, formatDate } from './format.js';
import { TodoDetail } from './TodoDetail.js';
import { BulkActions, SelectBox, useSelection, type Selection } from './BulkActions.js';

// YG-25 first screen. Sections come from the same todayView() as MCP todo://today; an overdue todo shows only under 마감 지남.
const titles = { today: '오늘 할 일', overdue: '마감 지남', waiting: '대기·막힘', week: '이번 주 예정' } as const;
type Key = keyof typeof titles;

export function TodayView({ token, onActivity }: { token: string; onActivity?: () => void }) {
  const [view, setView] = useState<Today | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(() => new Set()); // optimistically completed
  const [openId, setOpenId] = useState<string | null>(null);
  const selection = useSelection();
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  async function load() {
    try {
      const response = await fetch('/api/todos/today', { headers });
      if (!response.ok) throw new Error();
      setView(await response.json()); setHidden(new Set()); setError('');
    } catch { setError('오늘 할 일을 불러오지 못했습니다.'); }
  }
  useEffect(() => { void load(); }, [token]);

  if (error && !view) return <p role="alert" className="alert">{error}</p>;
  if (!view) return <p role="status" className="empty">오늘 할 일을 불러오는 중…</p>;

  const late = new Set(view.overdue.map((todo) => todo.id));
  const visible = (list: Todo[], dropLate = true) => list.filter((todo) => !hidden.has(todo.id) && !(dropLate && late.has(todo.id)));
  const sections: [Key, Todo[]][] = [['today', visible(view.today)], ['overdue', visible(view.overdue, false)], ['waiting', visible(view.waiting)], ['week', visible(view.week)]];
  const order = sections.flatMap(([, list]) => list.map((todo) => todo.id));
  const all = [...view.today, ...view.overdue, ...view.waiting, ...view.week];
  const open = openId ? all.find((todo) => todo.id === openId) : undefined;
  const changed = () => { void load(); onActivity?.(); };

  async function complete(todo: Todo) {
    setHidden((prev) => new Set(prev).add(todo.id)); setActionError('');
    try {
      const response = await fetch(`/api/todos/${todo.id}/complete`, { method: 'POST', headers });
      if (!response.ok) throw new Error();
      onActivity?.();
    } catch {
      setHidden((prev) => { const next = new Set(prev); next.delete(todo.id); return next; });
      setActionError(`'${todo.title}'을(를) 완료하지 못했습니다. 다시 시도하세요.`);
    }
  }

  const date = new Date(`${view.date}T00:00:00+09:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul' });
  return <section aria-label="오늘" className="mx-auto max-w-2xl space-y-5 pb-24">
    <div className="flex items-center gap-2">
      <p className="flex-1 text-sm text-muted">{date}</p>
      <button type="button" className="btn btn-ghost" aria-pressed={selection.mode} onClick={() => selection.mode ? selection.clear() : selection.setMode(true)}>
        <ListChecks />{selection.mode ? '선택 끝내기' : '선택'}</button>
    </div>
    {actionError && <p role="alert" className="alert">{actionError}</p>}
    {order.length === 0 && <p className="card empty">오늘 챙길 일이 없습니다. 여유로운 하루예요.</p>}
    {sections.map(([key, list]) => (key === 'today' || list.length > 0) && order.length > 0 &&
      <section key={key} aria-label={titles[key]} data-section={key}>
        <h2 className={`mb-2 flex items-center gap-2 text-sm font-semibold ${key === 'overdue' ? 'text-danger' : ''}`}>{titles[key]}
          <span className="font-normal tabular-nums text-faint">{list.length}</span></h2>
        {list.length === 0 ? <p className="rounded-md border border-dashed border-line-strong py-4 text-center text-xs text-faint">오늘 마감인 일은 없습니다.</p> :
          <ul className="space-y-1.5">{list.map((todo) => <Row key={todo.id} todo={todo} selection={selection} order={order} onOpen={setOpenId} onComplete={complete} />)}</ul>}
      </section>)}
    <BulkActions selection={selection} headers={headers} onApplied={changed} />
    {open && <TodoDetail key={open.id} issue={open} area={open.area} headers={headers} onClose={() => setOpenId(null)} onSaved={changed} />}
  </section>;
}

function Row({ todo, selection, order, onOpen, onComplete }: { todo: Todo; selection: Selection; order: string[]; onOpen: (id: string) => void; onComplete: (todo: Todo) => void }) {
  const press = useRef<{ timer?: ReturnType<typeof setTimeout>; fired?: boolean }>({});
  const checked = selection.selected.has(todo.id);
  const toggle = (range: boolean) => selection.toggle(todo.id, range, order);
  // Long-press (touch) enters select mode with this row selected.
  const start = (event: React.PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    press.current = { timer: setTimeout(() => { press.current.fired = true; selection.setMode(true); if (!checked) toggle(false); navigator.vibrate?.(10); }, 450) };
  };
  const cancel = () => clearTimeout(press.current.timer);
  return <li data-todo-id={todo.id} className={`card flex items-start gap-2.5 px-3 py-2.5 ${checked ? 'border-accent bg-accent-soft' : ''}`}>
    <SelectBox label={todo.title} checked={checked} onToggle={toggle} className={`mt-[3px] ${selection.mode ? '' : 'hidden md:block'}`} />
    <button type="button" role="checkbox" aria-checked="false" aria-label={`${todo.title} 완료`} onClick={() => onComplete(todo)}
      className="group mt-px grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-line-strong hover:border-accent hover:bg-accent-soft">
      <Check className="size-3 text-accent opacity-0 group-hover:opacity-100" strokeWidth={3} />
    </button>
    <button type="button" className="min-w-0 flex-1 select-none text-left [-webkit-touch-callout:none]" onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onClick={(event) => { if (press.current.fired) { press.current.fired = false; return; } if (selection.mode) toggle(event.shiftKey); else onOpen(todo.id); }}>
      <strong className="block break-words text-sm font-medium">{todo.key && <span className="mr-1.5 font-mono text-xs text-faint">{todo.key}</span>}{todo.title}</strong>
      <span className="mt-1 flex flex-wrap items-center gap-1">
        <PriorityBadge priority={todo.priority} />
        {todo.hold && <HoldBadge hold={todo.hold} reason={todo.holdReason} />}
        <DueBadge issue={todo} />
        {todo.scheduledAt && <span className="badge">예정 {formatDate(todo.scheduledAt)}</span>}
        <span className="badge bg-transparent px-0 font-medium text-faint">{todo.area}</span>
      </span>
    </button>
  </li>;
}
