import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import type { Hold, Issue, Priority, Recurrence, Weekday } from '../contracts/items.js';
import { recurrenceLabel, weekdayLabels, weekdays } from '../contracts/recurrence.js';
import { statusLabels } from './format.js';
import { TodoLinks } from './LinkChips.js';

// Date inputs speak Asia/Seoul calendar days, matching how the server parses 'YYYY-MM-DD'.
const seoulDay = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso)) : '';
const seoulTime = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) : '';
const seoulWeekday = (iso: string | null) => weekdays[(new Date(`${seoulDay(iso) || seoulDay(new Date().toISOString())}T00:00:00Z`).getUTCDay() + 6) % 7]!;

// YG-28 repeat rule draft. '' = no rule (choosing it on a series ends the series).
type Repeat = { freq: '' | Recurrence['freq']; weekdays: Weekday[]; monthDay: string; time: string; paused: boolean };
const repeatOf = (issue: Issue): Repeat => {
  const rule = issue.recurrence;
  return { freq: rule?.freq ?? '', weekdays: rule?.weekdays ?? [seoulWeekday(issue.dueAt)], monthDay: String(rule?.monthDay ?? Number(seoulDay(issue.dueAt || new Date().toISOString()).slice(8))), time: rule?.time ?? '', paused: rule?.paused ?? false };
};
const recurrenceOf = (repeat: Repeat) => repeat.freq ? { freq: repeat.freq, ...(repeat.freq === 'weekly' ? { weekdays: weekdays.filter((day) => repeat.weekdays.includes(day)) } : {}),
  ...(repeat.freq === 'monthly' ? { monthDay: Number(repeat.monthDay) } : {}), time: repeat.time || null, paused: repeat.paused } : null;

type Draft = { title: string; priority: Priority; hold: '' | Hold; holdReason: string; dueAt: string; dueTime: string; scheduledAt: string; scheduledTime: string; targetAt: string; targetTime: string; estimateMinutes: string; actualMinutes: string; notes: string; repeat: Repeat; completedAt: string };
const draftOf = (issue: Issue): Draft => ({ title: issue.title, priority: issue.priority, hold: issue.hold ?? '', holdReason: issue.holdReason ?? '', dueAt: seoulDay(issue.dueAt), dueTime: issue.dueAllDay ? '' : seoulTime(issue.dueAt),
  scheduledAt: seoulDay(issue.scheduledAt), scheduledTime: issue.scheduledAllDay ? '' : seoulTime(issue.scheduledAt), targetAt: seoulDay(issue.targetAt), targetTime: issue.targetAllDay ? '' : seoulTime(issue.targetAt), estimateMinutes: issue.estimateMinutes?.toString() ?? '', actualMinutes: issue.actualMinutes?.toString() ?? '', notes: issue.notes, repeat: repeatOf(issue), completedAt: seoulDay(issue.completedAt) });
const payloadOf = (draft: Draft) => ({ title: draft.title, priority: draft.priority, hold: draft.hold || null, holdReason: draft.hold && draft.holdReason.trim() ? draft.holdReason : null,
  dueAt: draft.dueAt ? (draft.dueTime ? `${draft.dueAt}T${draft.dueTime}:00+09:00` : draft.dueAt) : null, scheduledAt: draft.scheduledAt ? (draft.scheduledTime ? `${draft.scheduledAt}T${draft.scheduledTime}:00+09:00` : draft.scheduledAt) : null, targetAt: draft.targetAt ? (draft.targetTime ? `${draft.targetAt}T${draft.targetTime}:00+09:00` : draft.targetAt) : null, estimateMinutes: draft.estimateMinutes ? Number(draft.estimateMinutes) : null, actualMinutes: draft.actualMinutes ? Number(draft.actualMinutes) : null, notes: draft.notes, recurrence: recurrenceOf(draft.repeat),
  ...(draft.completedAt ? { completedAt: draft.completedAt } : {}) });

export function TodoDetail({ issue, area, headers, onClose, onSaved }: { issue: Issue; area: string; headers: Record<string, string>; onClose: () => void; onSaved: (todo: Issue) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() => draftOf(issue));
  const initial = useRef(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorSummary = useRef<HTMLParagraphElement>(null);
  const field = (name: string, label?: string) => ({ 'data-field': name, 'aria-labelledby': label ? `todo-label-${label}` : undefined, 'aria-invalid': fieldErrors[name] ? true as const : undefined, 'aria-describedby': fieldErrors[name] ? `todo-error-${name}` : undefined });
  const fieldError = (name: string) => fieldErrors[name] && <p id={`todo-error-${name}`} className="mt-1 text-xs text-danger">{fieldErrors[name]}</p>;
  useEffect(() => {
    if (error && !busy) (dialog.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? errorSummary.current)?.focus();
  }, [error, fieldErrors, busy]);
  const set = (changes: Partial<Draft>) => { setDraft({ ...draft, ...changes }); setFieldErrors({}); setError(''); };
  const setRepeat = (changes: Partial<Repeat>) => set({ repeat: { ...draft.repeat, ...changes } });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const modal = dialog.current;
    modal?.showModal();
    return () => { modal?.close(); opener?.focus(); };
  }, []);

  function mayDiscard() {
    return !saving.current && (!dirty || window.confirm('저장하지 않은 변경을 버릴까요? 취소하면 계속 편집합니다.'));
  }
  function close() { if (mayDiscard()) onClose(); }

  async function send(url: string, init: RequestInit) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(''); setFieldErrors({});
    try {
      const response = await fetch(url, { ...init, headers: { ...headers, 'content-type': 'application/json' } });
      if (response.status === 400) {
        const body = await response.json().catch(() => null);
        const errors: Record<string, string> = {};
        if (init.method === 'PATCH' && Array.isArray(body?.issues)) for (const issue of body.issues) {
          if (!Array.isArray(issue?.path) || typeof issue.message !== 'string') continue;
          const name = issue.path.join('.');
          if (Array.from(dialog.current?.querySelectorAll<HTMLElement>('[data-field]') ?? []).some((element) => element.dataset.field === name)) errors[name] = issue.message;
        }
        setFieldErrors(errors);
        throw new Error('입력값을 확인하고 다시 저장하세요.');
      }
      if (!response.ok) throw new Error('저장하지 못했습니다. 다시 시도하세요.');
      onSaved(await response.json());
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '저장하지 못했습니다.'); }
    saving.current = false; setBusy(false);
  }

  // YG-36: keys are permanent, so there is promote but no remove. Empty prefix = the epic's default.
  const [prefix, setPrefix] = useState('');
  async function promote() {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(''); setFieldErrors({});
    try {
      const response = await fetch(`/api/todos/${issue.id}/promote`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(prefix.trim() ? { prefix: prefix.trim() } : {}) });
      if (response.status === 400) throw new Error(prefix.trim() ? '접두사는 영문으로 시작하는 1~10자(영문·숫자)입니다.' : '이 에픽에는 기본 접두사가 없습니다. 접두사를 입력하세요.');
      if (!response.ok) throw new Error('티켓으로 승격하지 못했습니다.');
      onSaved(await response.json());
    } catch (failure) { setError(failure instanceof Error ? failure.message : '티켓으로 승격하지 못했습니다.'); }
    saving.current = false; setBusy(false);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const [before, after] = [payloadOf(draftOf(issue)), payloadOf(draft)];
    const changes = Object.fromEntries(Object.entries(after).filter(([key, value]) => JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(value)));
    if (!Object.keys(changes).length) return onClose();
    void send(`/api/todos/${issue.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
  }

  return <dialog ref={dialog} aria-labelledby="todo-detail-title" onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    className="m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-xl border border-line bg-surface p-0 text-ink shadow-pop md:ml-auto md:mt-0 md:h-dvh md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-xl">
    <form onSubmit={save} onInvalid={(event) => {
      event.preventDefault();
      const input = event.target as HTMLInputElement;
      if (input.dataset.field) setFieldErrors((previous) => ({ ...previous, [input.dataset.field!]: input.validationMessage }));
      setError('입력값을 확인하고 다시 저장하세요.');
    }} className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow truncate">{[issue.key, area, statusLabels[issue.status]].filter(Boolean).join(' · ')}</p>
          <h2 id="todo-detail-title" className="truncate font-semibold">{issue.title}</h2>
        </div>
        <button type="button" className="btn btn-ghost size-8 p-0" aria-label="상세 닫기" disabled={busy} onClick={close}><X /></button>
      </header>
      <fieldset disabled={busy} className="min-w-0 flex-1 space-y-3 px-4 py-4">
        <label className="block"><span className="label" id="todo-label-title">제목</span>
          <input className="field" required maxLength={200} {...field('title', 'title')} value={draft.title} onChange={(event) => set({ title: event.target.value })} />{fieldError('title')}</label>
        {!issue.key && <div className="flex items-end gap-2">
          <label className="block w-28"><span className="label">티켓 키</span>
            <input className="field font-mono uppercase" maxLength={10} placeholder="에픽 기본값" value={prefix} onChange={(event) => setPrefix(event.target.value)} /></label>
          <button type="button" className="btn" disabled={busy || dirty} onClick={() => void promote()}>티켓으로 승격</button>
        </div>}
        {!issue.key && dirty && <p className="text-xs text-muted">변경을 저장한 뒤 티켓으로 승격하세요.</p>}
        <TodoLinks issue={issue} headers={headers} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label" id="todo-label-priority">우선순위</span>
            <select className="field" {...field('priority', 'priority')} value={draft.priority} onChange={(event) => set({ priority: event.target.value as Priority })}>
              {(['p1', 'p2', 'p3', 'p4'] as const).map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
            </select>{fieldError('priority')}</label>
          <label className="block"><span className="label" id="todo-label-hold">보류</span>
            <select className="field" {...field('hold', 'hold')} value={draft.hold} onChange={(event) => set({ hold: event.target.value as Draft['hold'] })}>
              <option value="">없음</option><option value="waiting">대기</option><option value="blocked">막힘</option><option value="scheduled">예정</option>
            </select>{fieldError('hold')}</label>
        </div>
        {draft.hold && <label className="block"><span className="label" id="todo-label-holdReason">보류 사유</span>
          <input className="field" maxLength={500} {...field('holdReason', 'holdReason')} value={draft.holdReason} placeholder="무엇을 기다리나요?" onChange={(event) => set({ holdReason: event.target.value })} />{fieldError('holdReason')}</label>}
        <fieldset className="space-y-3 rounded-lg border border-line p-3">
          <legend className="label px-1">일정 (선택 · 한국 시간)</legend>
          {([
            ['scheduledAt', 'scheduledTime', '시작/예정일', '시작/예정 시각'],
            ['targetAt', 'targetTime', '내부 완료 목표일', '내부 완료 목표 시각'],
            ['dueAt', 'dueTime', '마감일', '마감 시각']
          ] as const).map(([day, time, dayLabel, timeLabel]) => <div key={day} className="grid grid-cols-2 gap-3">
            <label className="block min-w-0"><span className="label" id={`todo-label-${day}`}>{dayLabel}</span>
              <input type="date" className="field min-w-0" {...field(day, day)} value={draft[day]} onChange={(event) => set({ [day]: event.target.value, ...(!event.target.value ? { [time]: '' } : {}) })} />{fieldError(day)}</label>
            <label className="block min-w-0"><span className="label" id={`todo-label-${time}`}>{timeLabel}</span>
              <input type="time" className="field min-w-0" {...field(day, time)} value={draft[time]} disabled={!draft[day]} onChange={(event) => set({ [time]: event.target.value })} /></label>
          </div>)}
          <p className="text-xs text-muted">날짜는 각각 지정하거나 지울 수 있습니다. 시각을 비우면 종일입니다.</p>
        </fieldset>
        <fieldset className="space-y-2 rounded-lg border border-line p-3">
          <legend className="label px-1">반복</legend>
          <div className="grid grid-cols-2 gap-3">
            <select className="field" aria-label="반복 주기" {...field('recurrence.freq')} value={draft.repeat.freq} onChange={(event) => setRepeat({ freq: event.target.value as Repeat['freq'] })}>
              <option value="">반복 안 함</option><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option>
            </select>
            {draft.repeat.freq && <input type="time" className="field" aria-label="반복 시각" {...field('recurrence.time')} value={draft.repeat.time} onChange={(event) => setRepeat({ time: event.target.value })} />}
          </div>
          {fieldError('recurrence.freq')}{fieldError('recurrence.time')}
          {draft.repeat.freq === 'weekly' && <div role="group" aria-label="반복 요일" tabIndex={-1} {...field('recurrence.weekdays')} className="flex gap-1">
            {weekdays.map((day) => { const on = draft.repeat.weekdays.includes(day); return <button key={day} type="button" aria-pressed={on}
              className={`btn h-8 flex-1 p-0 ${on ? 'btn-primary' : 'btn-ghost border border-line'}`}
              onClick={() => setRepeat({ weekdays: on ? draft.repeat.weekdays.filter((item) => item !== day) : [...draft.repeat.weekdays, day] })}>{weekdayLabels[day]}</button>; })}
          </div>}
          {fieldError('recurrence.weekdays')}
          {draft.repeat.freq === 'monthly' && <label className="flex items-center gap-2 text-sm">매월
            <input type="number" inputMode="numeric" min={1} max={31} className="field w-20" aria-label="반복 날짜" {...field('recurrence.monthDay')} value={draft.repeat.monthDay} onChange={(event) => setRepeat({ monthDay: event.target.value })} />일
            <span className="text-xs text-faint">(없는 날은 말일)</span></label>}
          {fieldError('recurrence.monthDay')}
          {draft.repeat.freq && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.repeat.paused} onChange={(event) => setRepeat({ paused: event.target.checked })} />일시정지</label>}
          <p className="text-xs text-muted">{draft.repeat.freq
            ? `${recurrenceLabel({ ...recurrenceOf(draft.repeat)!, weekdays: draft.repeat.weekdays, monthDay: Number(draft.repeat.monthDay) })} · 완료하면 다음 회차가 생깁니다. 마감일만 바꾸면 이번 회차만 옮겨집니다.`
            : issue.recurrence ? '저장하면 반복이 끝납니다. 이 할 일은 남습니다.' : '매일·매주·매월 반복할 수 있습니다.'}</p>
        </fieldset>
        {issue.status === 'done' && <label className="block"><span className="label" id="todo-label-completedAt">완료일</span>
          <input type="date" className="field" required max={seoulDay(new Date().toISOString())} {...field('completedAt', 'completedAt')} value={draft.completedAt} onChange={(event) => set({ completedAt: event.target.value })} />{fieldError('completedAt')}</label>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label" id="todo-label-estimateMinutes">예상 시간 (분)</span>
            <input type="number" inputMode="numeric" min={1} max={100000} step={1} className="field" {...field('estimateMinutes', 'estimateMinutes')} value={draft.estimateMinutes} onChange={(event) => set({ estimateMinutes: event.target.value })} />{fieldError('estimateMinutes')}</label>
          {/* YG-43: mainly for done todos; kept visible once set. */}
          {(issue.status === 'done' || issue.actualMinutes !== null) && <label className="block"><span className="label" id="todo-label-actualMinutes">실제 시간 (분)</span>
            <input type="number" inputMode="numeric" min={1} max={100000} step={1} className="field" {...field('actualMinutes', 'actualMinutes')} value={draft.actualMinutes} onChange={(event) => set({ actualMinutes: event.target.value })} />{fieldError('actualMinutes')}</label>}
        </div>
        <label className="block"><span className="label" id="todo-label-notes">메모</span>
          <textarea className="field min-h-32" maxLength={20000} {...field('notes', 'notes')} value={draft.notes} onChange={(event) => set({ notes: event.target.value })} />{fieldError('notes')}</label>
        {error && <p ref={errorSummary} role="alert" tabIndex={-1} className="alert">{error}</p>}
      </fieldset>
      <footer className="sticky bottom-0 flex items-center gap-2 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {issue.status !== 'done' && <button type="button" className="btn" disabled={busy} onClick={() => { if (mayDiscard()) void send(`/api/todos/${issue.id}/complete`, { method: 'POST' }); }}><Check />완료 처리</button>}
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={close}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>저장</button>
      </footer>
    </form>
  </dialog>;
}
