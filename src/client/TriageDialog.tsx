import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowRight, Check, Inbox, Pause, Undo2, X } from 'lucide-react';
import type { BulkResult, LateTodo, TodoSnapshot } from '../contracts/items.js';
import { seoulDay } from '../contracts/dates.js';
import { DueBadge, HoldBadge, PriorityBadge } from './format.js';
import { nextMonday } from './BulkActions.js';

// YG-34 정리 모드: one 밀린 일 at a time, oldest first. Each decision applies at once (optimistic) and can be undone in reverse order.
type Decision = 'done' | 'today' | 'week' | 'backlog' | 'hold' | 'archive';
const decisions: { id: Decision; label: string; short: string; key: string; icon: typeof Check }[] = [
  { id: 'done', label: '이미 했어', short: '완료', key: 'D', icon: Check },
  { id: 'today', label: '오늘', short: '오늘', key: 'T', icon: ArrowRight },
  { id: 'week', label: '다음 주', short: '다음 주', key: 'W', icon: ArrowRight },
  { id: 'backlog', label: '백로그', short: '백로그', key: 'B', icon: Inbox },
  { id: 'hold', label: '대기로', short: '대기', key: 'H', icon: Pause },
  { id: 'archive', label: '보관', short: '보관', key: 'A', icon: Archive }
];
type Step = { index: number; todo: LateTodo; decision: Decision; undo: () => Promise<unknown> };

const snapshot = ({ id, status, dueAt, dueAllDay, scheduledAt, scheduledAllDay, hold, holdReason }: LateTodo): TodoSnapshot =>
  ({ id, status, dueAt: dueAt && (dueAllDay ? seoulDay(dueAt) : dueAt), scheduledAt: scheduledAt && (scheduledAllDay ? seoulDay(scheduledAt) : scheduledAt), hold, holdReason });
export const ageLabel = (days: number) => days >= 60 ? `${Math.floor(days / 30)}개월 동안 그대로` : `${days}일 동안 그대로`;

export function TriageDialog({ items, date, headers, onDecided, onClose }: {
  items: LateTodo[]; date: string; headers: Record<string, string>; onDecided: (id: string, hidden: boolean) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const finish = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<Step[]>([]);
  const [error, setError] = useState('');
  const [announce, setAnnounce] = useState('');
  const [reason, setReason] = useState('');
  const [onDueDate, setOnDueDate] = useState(false);
  const current = items[index];

  useEffect(() => { dialog.current?.showModal(); }, []);
  // Window-level so shortcuts keep working when focus has left the dialog's controls (e.g. after a blur lands on body).
  const keys = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useEffect(() => { const listener = (event: KeyboardEvent) => keys.current(event); window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, []);
  useEffect(() => { if (!current) finish.current?.focus(); }, [current]);

  async function post(url: string, body?: unknown) {
    const response = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error();
    return response.json();
  }
  const bulk = (body: object) => post('/api/todos/bulk', body) as Promise<BulkResult>;

  async function decide(decision: Decision) {
    const todo = current;
    if (!todo) return;
    const at = index;
    const restore = async () => { const result = await bulk({ action: 'restore', items: [snapshot(todo)] }); if (result.skipped.length) setError('반복 할 일은 다음 회차가 이미 생겨 완료 상태로 두었습니다.'); };
    setIndex(at + 1); setError(''); onDecided(todo.id, true);
    const next = items[at + 1];
    const label = decisions.find((item) => item.id === decision)!.short;
    setAnnounce(`'${todo.title}' ${label}. ${next ? `다음 ${at + 2} / ${items.length}: ${next.title}` : '밀린 일을 모두 정리했습니다.'}`);
    try {
      let undo = restore;
      if (decision === 'done') await post(`/api/todos/${todo.id}/complete`, onDueDate && todo.dueAt && todo.lateDays !== null ? { completedAt: seoulDay(todo.dueAt) } : {});
      else if (decision === 'today') await bulk({ action: 'snooze', ids: [todo.id], until: date });
      else if (decision === 'week') await bulk({ action: 'snooze', ids: [todo.id], until: nextMonday(date) });
      else if (decision === 'backlog') await bulk({ action: 'backlog', ids: [todo.id] });
      else if (decision === 'hold') await bulk({ action: 'hold', ids: [todo.id], hold: 'waiting', holdReason: reason.trim() || null });
      else { await post(`/api/todos/${todo.id}/archive`); undo = () => post(`/api/todos/${todo.id}/unarchive`); }
      setReason('');
      setHistory((steps) => [...steps, { index: at, todo, decision, undo }]);
    } catch {
      setIndex(at); onDecided(todo.id, false);
      setError(`'${todo.title}'을(를) 저장하지 못했습니다. 다시 시도하세요.`); setAnnounce('');
    }
  }

  async function undoLast() {
    const step = history.at(-1);
    if (!step) return;
    setHistory((steps) => steps.slice(0, -1)); setIndex(step.index); setError(''); onDecided(step.todo.id, false);
    setAnnounce(`되돌렸습니다: '${step.todo.title}'`);
    try { await step.undo(); }
    catch { setError(`'${step.todo.title}'을(를) 되돌리지 못했습니다.`); }
  }

  keys.current = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement).matches('input[type="text"], textarea')) return;
    // event.code, not key, so shortcuts work with a Korean layout too.
    const letter = event.code.startsWith('Key') ? event.code.slice(3) : '';
    if (letter === 'U') { event.preventDefault(); void undoLast(); return; }
    const decision = current && decisions.find((item) => item.key === letter);
    if (decision) { event.preventDefault(); void decide(decision.id); }
  };

  const counts = decisions.map((item) => [item.short, history.filter((step) => step.decision === item.id).length] as const).filter(([, count]) => count > 0);
  const progress = items.length ? Math.round((Math.min(index, items.length) / items.length) * 100) : 100;
  return <dialog ref={dialog} aria-labelledby="triage-title" onCancel={(event) => { event.preventDefault(); onClose(); }}
    className="m-auto w-full max-w-[560px] rounded-xl border border-line bg-surface p-0 text-ink shadow-pop max-[719px]:m-0 max-[719px]:h-dvh max-[719px]:max-h-none max-[719px]:max-w-none max-[719px]:rounded-none max-[719px]:border-0">
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 id="triage-title" className="flex-1 font-semibold">밀린 일 정리</h2>
        <span className="text-xs tabular-nums text-muted">{Math.min(index, items.length)} / {items.length} 정리</span>
        <button type="button" className="btn btn-ghost size-8 p-0" aria-label="정리 모드 닫기" onClick={onClose}><X /></button>
      </header>
      <div className="h-1 bg-sunken" aria-hidden><span className="block h-full bg-accent" style={{ width: `${progress}%` }} /></div>
      {current ? <div className="flex-1 space-y-3 px-4 py-4" data-triage-card={current.id}>
        <p className="text-xs text-muted">밀린 일 {index + 1} / {items.length} · {current.lateDays !== null ? `마감 ${current.lateDays}일 지남` : `${current.untouchedDays}일 동안 그대로`} · {current.area}</p>
        <p className="break-words text-lg font-semibold">{current.key && <span className="mr-1.5 font-mono text-sm text-faint">{current.key}</span>}{current.title}</p>
        <div className="flex flex-wrap items-center gap-1">
          <PriorityBadge priority={current.priority} />
          <DueBadge issue={current} />
          {current.hold && <HoldBadge hold={current.hold} reason={current.holdReason} />}
          {current.untouchedDays >= 30 && <span className="badge bg-warn-soft text-warn">{ageLabel(current.untouchedDays)}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {decisions.map((item) => <button key={item.id} type="button" className="btn h-11 justify-start px-3 text-left" aria-keyshortcuts={item.key} onClick={() => void decide(item.id)}>
            <item.icon />{item.id === 'today' || item.id === 'week' ? `${item.label}로` : item.label}<kbd className="ml-auto font-mono text-xs text-faint">{item.key}</kbd>
          </button>)}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm">
          {current.dueAt && current.lateDays !== null && <label className="flex items-center gap-1.5 text-muted">
            <input type="checkbox" checked={onDueDate} onChange={(event) => setOnDueDate(event.target.checked)} />완료일: 마감일로</label>}
          <input type="text" aria-label="대기 사유" className="field h-8 min-w-0 flex-1 basis-40" maxLength={500} placeholder="대기 사유 (선택, H와 함께)" value={reason}
            onChange={(event) => setReason(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void decide('hold'); } }} />
        </div>
      </div> : <div className="grid flex-1 place-items-center content-center gap-2 px-4 py-10 text-center">
        <p className="text-xl font-semibold">밀린 일 0 🎉</p>
        <p className="text-sm text-muted">{counts.length ? counts.map(([label, count]) => `${label} ${count}`).join(' · ') : '정리할 밀린 일이 없습니다.'}</p>
        <button ref={finish} type="button" className="btn btn-primary mt-2" onClick={onClose}>닫기</button>
      </div>}
      {error && <p role="alert" className="alert mx-4 mb-3">{error}</p>}
      <footer className="flex items-center gap-2 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-xs text-muted">
        <span className="flex-1">결정하면 다음 장으로 · Esc 닫기</span>
        <button type="button" className="btn" disabled={!history.length} aria-keyshortcuts="U" onClick={() => void undoLast()}><Undo2 />되돌리기<kbd className="font-mono text-faint">U</kbd></button>
      </footer>
      <p aria-live="polite" className="sr-only">{announce}</p>
    </div>
  </dialog>;
}
