import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import type { Hold, Issue, Priority } from '../contracts/items.js';
import { statusLabels } from './format.js';

// Date inputs speak Asia/Seoul calendar days, matching how the server parses 'YYYY-MM-DD'.
const seoulDay = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso)) : '';

type Draft = { title: string; priority: Priority; hold: '' | Hold; holdReason: string; dueAt: string; scheduledAt: string; estimateMinutes: string; notes: string };
const draftOf = (issue: Issue): Draft => ({ title: issue.title, priority: issue.priority, hold: issue.hold ?? '', holdReason: issue.holdReason ?? '', dueAt: seoulDay(issue.dueAt),
  scheduledAt: seoulDay(issue.scheduledAt), estimateMinutes: issue.estimateMinutes?.toString() ?? '', notes: issue.notes });
const payloadOf = (draft: Draft) => ({ title: draft.title, priority: draft.priority, hold: draft.hold || null, holdReason: draft.hold && draft.holdReason.trim() ? draft.holdReason : null,
  dueAt: draft.dueAt || null, scheduledAt: draft.scheduledAt || null, estimateMinutes: draft.estimateMinutes ? Number(draft.estimateMinutes) : null, notes: draft.notes });

export function TodoDetail({ issue, area, headers, onClose, onSaved }: { issue: Issue; area: string; headers: Record<string, string>; onClose: () => void; onSaved: (todo: Issue) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() => draftOf(issue));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (changes: Partial<Draft>) => setDraft({ ...draft, ...changes });

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function send(url: string, init: RequestInit) {
    setBusy(true); setError('');
    try {
      const response = await fetch(url, { ...init, headers: { ...headers, 'content-type': 'application/json' } });
      if (response.status === 400) throw new Error('입력값을 확인하세요. 제목은 1~200자, 예상 시간은 양의 정수(분)입니다.');
      if (!response.ok) throw new Error('저장하지 못했습니다. 다시 시도하세요.');
      onSaved(await response.json());
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '저장하지 못했습니다.'); }
    setBusy(false);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const [before, after] = [payloadOf(draftOf(issue)), payloadOf(draft)];
    const changes = Object.fromEntries(Object.entries(after).filter(([key, value]) => before[key as keyof typeof before] !== value));
    if (!Object.keys(changes).length) return onClose();
    void send(`/api/todos/${issue.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
  }

  return <dialog ref={dialog} aria-labelledby="todo-detail-title" onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    className="m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-xl border border-line bg-surface p-0 text-ink shadow-pop md:ml-auto md:mt-0 md:h-dvh md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-xl">
    <form onSubmit={save} className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow truncate">{[area, statusLabels[issue.status]].filter(Boolean).join(' · ')}</p>
          <h2 id="todo-detail-title" className="truncate font-semibold">{issue.title}</h2>
        </div>
        <button type="button" className="btn btn-ghost size-8 p-0" aria-label="상세 닫기" onClick={onClose}><X /></button>
      </header>
      <div className="flex-1 space-y-3 px-4 py-4">
        <label className="block"><span className="label">제목</span>
          <input className="field" required maxLength={200} value={draft.title} onChange={(event) => set({ title: event.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">우선순위</span>
            <select className="field" value={draft.priority} onChange={(event) => set({ priority: event.target.value as Priority })}>
              {(['p1', 'p2', 'p3', 'p4'] as const).map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
            </select></label>
          <label className="block"><span className="label">보류</span>
            <select className="field" value={draft.hold} onChange={(event) => set({ hold: event.target.value as Draft['hold'] })}>
              <option value="">없음</option><option value="waiting">대기</option><option value="blocked">막힘</option><option value="scheduled">예정</option>
            </select></label>
        </div>
        {draft.hold && <label className="block"><span className="label">보류 사유</span>
          <input className="field" maxLength={500} value={draft.holdReason} placeholder="무엇을 기다리나요?" onChange={(event) => set({ holdReason: event.target.value })} /></label>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">마감일</span><input type="date" className="field" value={draft.dueAt} onChange={(event) => set({ dueAt: event.target.value })} /></label>
          <label className="block"><span className="label">예정일</span><input type="date" className="field" value={draft.scheduledAt} onChange={(event) => set({ scheduledAt: event.target.value })} /></label>
        </div>
        <label className="block"><span className="label">예상 시간 (분)</span>
          <input type="number" inputMode="numeric" min={1} max={100000} step={1} className="field" value={draft.estimateMinutes} onChange={(event) => set({ estimateMinutes: event.target.value })} /></label>
        <label className="block"><span className="label">메모</span>
          <textarea className="field min-h-32" maxLength={20000} value={draft.notes} onChange={(event) => set({ notes: event.target.value })} /></label>
        {error && <p role="alert" className="alert">{error}</p>}
      </div>
      <footer className="sticky bottom-0 flex items-center gap-2 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {issue.status !== 'done' && <button type="button" className="btn" disabled={busy} onClick={() => void send(`/api/todos/${issue.id}/complete`, { method: 'POST' })}><Check />완료 처리</button>}
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>저장</button>
      </footer>
    </form>
  </dialog>;
}
