import { useEffect, useRef, useState } from 'react';
import { Archive, Check, CircleAlert, Clock, Undo2, X } from 'lucide-react';
import type { BulkResult, Todo, TodoSnapshot } from '../contracts/items.js';

// YG-26 multi-select shared by 오늘 and 보드. Shift-click selects the range from the last clicked id in `order`.
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState(false); // explicit select mode (mobile: tap toggles instead of opening)
  const anchor = useRef<string | null>(null);
  function toggle(id: string, range: boolean, order: string[]) {
    const from = range && anchor.current ? order.indexOf(anchor.current) : -1;
    const to = order.indexOf(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (from >= 0 && to >= 0) for (const each of order.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(each);
      else if (!next.delete(id)) next.add(id);
      return next;
    });
    anchor.current = id;
  }
  const clear = () => { setSelected(new Set()); setMode(false); anchor.current = null; };
  return { selected, mode, setMode, toggle, clear, active: mode || selected.size > 0 };
}
export type Selection = ReturnType<typeof useSelection>;

const seoulToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const plusDays = (day: string, days: number) => { const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const nextMonday = (day: string) => plusDays(day, (8 - new Date(`${day}T00:00:00Z`).getUTCDay()) % 7 || 7);

type Action = { action: 'complete' | 'backlog' } | { action: 'snooze'; until: string } | { action: 'hold'; hold: 'waiting' | 'blocked'; holdReason: string | null };

/** Bulk bar while something is selected; afterwards an undo toast for the last action. */
export function BulkActions({ selection, headers, onApplied }: { selection: Selection; headers: Record<string, string>; onApplied: (todos: Todo[]) => void }) {
  const [menu, setMenu] = useState<'' | 'snooze' | 'hold'>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [undo, setUndo] = useState<{ label: string; previous: TodoSnapshot[] } | null>(null);
  const [date, setDate] = useState('');
  const [hold, setHold] = useState<'waiting' | 'blocked'>('waiting');
  const [reason, setReason] = useState('');
  const count = selection.selected.size;

  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), 10_000); return () => clearTimeout(timer); }, [undo]);
  useEffect(() => { if (count) setUndo(null); }, [count]);

  async function post(body: unknown): Promise<BulkResult | null> {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/todos/bulk', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error();
      const result: BulkResult = await response.json();
      onApplied(result.todos);
      return result;
    } catch { setError('일괄 변경하지 못했습니다. 다시 시도하세요.'); return null; }
    finally { setBusy(false); }
  }

  async function run(action: Action, label: string) {
    const result = await post({ ...action, ids: [...selection.selected] });
    if (!result) return;
    setMenu(''); setReason(''); setDate('');
    selection.clear();
    setUndo({ label: `${result.todos.length}개 ${label}`, previous: result.previous });
  }

  async function revert() {
    if (undo && await post({ action: 'restore', items: undo.previous })) setUndo(null);
  }

  const dock = 'fixed inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-xl md:bottom-6 md:left-[calc(208px+1.5rem)]';
  if (!count) return undo || error ? <div role="status" className={`${dock} card flex items-center gap-2 px-3 py-2 shadow-pop`}>
    <span className={`min-w-0 flex-1 truncate text-sm ${error ? 'text-danger' : ''}`}>{error || undo?.label}</span>
    {undo && <button type="button" className="btn" disabled={busy} onClick={() => void revert()}><Undo2 />되돌리기</button>}
    <button type="button" className="btn btn-ghost size-7 p-0" aria-label="알림 닫기" onClick={() => { setUndo(null); setError(''); }}><X /></button>
  </div> : null;

  const today = seoulToday();
  return <div role="toolbar" aria-label="일괄 작업" className={`${dock} card p-2 shadow-pop`}>
    {menu === 'snooze' && <div role="group" aria-label="미루기" className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-line pb-2">
      <button type="button" className="btn" disabled={busy} onClick={() => void run({ action: 'snooze', until: plusDays(today, 1) }, '내일로 미뤘습니다')}>내일</button>
      <button type="button" className="btn" disabled={busy} onClick={() => void run({ action: 'snooze', until: nextMonday(today) }, '다음 주 월요일로 미뤘습니다')}>다음 주 월요일</button>
      <input type="date" aria-label="미룰 날짜" className="field h-[30px] w-auto flex-1" min={today} value={date} onChange={(event) => setDate(event.target.value)} />
      <button type="button" className="btn btn-primary" disabled={busy || !date} onClick={() => void run({ action: 'snooze', until: date }, `${date}로 미뤘습니다`)}>적용</button>
    </div>}
    {menu === 'hold' && <form role="group" aria-label="보류 지정" className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-line pb-2"
      onSubmit={(event) => { event.preventDefault(); void run({ action: 'hold', hold, holdReason: reason.trim() || null }, `${hold === 'waiting' ? '대기' : '막힘'}로 지정했습니다`); }}>
      <select aria-label="보류 종류" className="field h-[30px] w-auto" value={hold} onChange={(event) => setHold(event.target.value as typeof hold)}>
        <option value="waiting">대기</option><option value="blocked">막힘</option>
      </select>
      <input aria-label="보류 사유" className="field h-[30px] min-w-0 flex-1 basis-32" maxLength={500} placeholder="사유 (선택)" value={reason} onChange={(event) => setReason(event.target.value)} />
      <button type="submit" className="btn btn-primary" disabled={busy}>적용</button>
    </form>}
    {error && <p role="alert" className="alert mb-2">{error}</p>}
    <div className="grid grid-cols-4 items-center gap-1.5 sm:flex">
      <span className="col-span-3 px-1 text-sm font-semibold tabular-nums sm:flex-1">{count}개 선택</span>
      <button type="button" className="btn" disabled={busy} onClick={() => void run({ action: 'complete' }, '완료했습니다')}><Check className="max-[380px]:hidden" />완료</button>
      <button type="button" className="btn" disabled={busy} onClick={() => void run({ action: 'backlog' }, '백로그로 옮겼습니다')}><Archive className="max-[380px]:hidden" />백로그로</button>
      <button type="button" className="btn" aria-expanded={menu === 'snooze'} onClick={() => setMenu(menu === 'snooze' ? '' : 'snooze')}><Clock className="max-[380px]:hidden" />미루기</button>
      <button type="button" className="btn" aria-expanded={menu === 'hold'} onClick={() => setMenu(menu === 'hold' ? '' : 'hold')}><CircleAlert className="max-[380px]:hidden" />보류</button>
      <button type="button" className="btn btn-ghost order-first col-start-4 row-start-1 size-[30px] justify-self-end p-0 sm:order-last" aria-label="선택 해제" onClick={() => { setMenu(''); selection.clear(); }}><X /></button>
    </div>
  </div>;
}

/** Selection checkbox; native so Space/Tab work. `onClick` carries shiftKey for range select. */
export function SelectBox({ label, checked, onToggle, className = '' }: { label: string; checked: boolean; onToggle: (range: boolean) => void; className?: string }) {
  return <input type="checkbox" aria-label={`${label} 선택`} checked={checked} onChange={() => undefined}
    onClick={(event) => onToggle(event.shiftKey)} className={`size-4 shrink-0 accent-[var(--color-accent)] ${className}`} />;
}
