import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, NotebookPen } from 'lucide-react';
import type { Todo } from '../contracts/items.js';
import { addDays, reviewDocumentTitle, weekStart, type WeekReview } from '../contracts/review.js';
import { DueBadge, PriorityBadge } from './format.js';
import { TodoDetail } from './TodoDetail.js';

// YG-43 주간 회고. The week lives in the hash (#/review/2026-10-12) so prev/next and reload keep it.
const weekFromHash = () => location.hash.match(/^#\/review\/(\d{4}-\d{2}-\d{2})$/)?.[1];
const short = (day: string) => { const [, m, d] = day.split('-').map(Number); return `${m}/${d}`; };
const minutes = (value: number | null) => value ? `${value}분` : '—';
const done = (todo: Todo) => new Date(todo.completedAt!).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' });

export function ReviewView({ token, onActivity }: { token: string; onActivity?: () => void }) {
  const [start, setStart] = useState(() => weekStart(weekFromHash() ?? new Date()));
  const [review, setReview] = useState<WeekReview | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    const onHash = () => { const week = weekFromHash(); if (week) setStart(weekStart(week)); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  async function load(week = start) {
    try {
      const response = await fetch(`/api/review/week?start=${week}`, { headers });
      if (!response.ok) throw new Error();
      setReview(await response.json()); setError('');
    } catch { setError('회고를 불러오지 못했습니다.'); }
  }
  useEffect(() => { setReview(null); void load(start); }, [token, start]);

  const go = (days: number) => { location.hash = `#/review/${addDays(start, days)}`; };
  const thisWeek = weekStart(new Date());

  async function openDocument() {
    if (!review) return;
    if (review.documentId) { location.hash = `#document-${review.documentId}`; return; }
    setBusy(true);
    try {
      const body = `## 잘된 것\n\n- \n\n## 아쉬운 것\n\n- \n\n## 다음 주에 바꿀 것\n\n- \n`;
      const response = await fetch('/api/documents', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ title: reviewDocumentTitle(review.start), body }) });
      if (!response.ok) throw new Error();
      location.hash = `#document-${(await response.json() as { id: string }).id}`;
    } catch { setError('회고 문서를 만들지 못했습니다.'); setBusy(false); }
  }

  const all = review ? [...review.completed, ...review.unfinished, ...review.overdue] : [];
  const open = openId ? all.find((todo) => todo.id === openId) : undefined;
  const listed = new Set(review?.unfinished.map((todo) => todo.id));
  const newlyOverdue = review?.overdue.filter((todo) => !listed.has(todo.id)) ?? [];

  return <section aria-label="주간 회고" className="space-y-5 pb-24">
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button type="button" className="btn btn-ghost size-8 p-0" aria-label="이전 주" onClick={() => go(-7)}><ChevronLeft /></button>
        <h2 className="min-w-36 text-center font-semibold tabular-nums" aria-live="polite">{review?.week ?? '…'} <span className="text-sm font-normal text-muted">{short(start)} – {short(addDays(start, 6))}</span></h2>
        <button type="button" className="btn btn-ghost size-8 p-0" aria-label="다음 주" onClick={() => go(7)}><ChevronRight /></button>
      </div>
      {start !== thisWeek && <a className="btn btn-ghost" href={`#/review/${thisWeek}`}>이번 주</a>}
      <span className="flex-1" />
      <button type="button" className="btn" disabled={!review || busy} onClick={() => void openDocument()}><NotebookPen />{review?.documentId ? '회고 문서 열기' : '회고 문서 만들기'}</button>
    </div>

    {error && <p role="alert" className="alert">{error}</p>}
    {!review ? !error && <p role="status" className="empty">회고를 불러오는 중…</p> : <>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="완료" value={`${review.completed.length}건`} />
        <Stat label="예상 대비 실제" value={review.minutes.ratio === null ? '—' : `${review.minutes.ratio}배`} />
        <Stat label="못 끝낸 것" value={`${review.unfinished.length}건`} />
        <Stat label="방치 (현재)" value={`${review.stale}건`} />
      </dl>

      {/* YG-47: wide screens put 이번 주 완료 on the left and the rest stacked on the right; DOM order (and phone order) unchanged. */}
      <div className="grid gap-5 xl:grid-cols-2 xl:grid-rows-[repeat(3,auto)_1fr] xl:items-start">
      <Section title="이번 주 완료" className="xl:row-span-4" count={review.completed.length} id="completed">
        {review.byArea.length > 0 && <p className="flex flex-wrap gap-1.5 px-1">{review.byArea.map((row) => <span key={row.area} className="badge">{row.area} {row.count}</span>)}</p>}
        <List todos={review.completed} empty="이번 주에 완료한 일이 없습니다." onOpen={setOpenId}
          meta={(todo) => <span className="text-xs tabular-nums text-muted">{done(todo)} · 예상 {minutes(todo.estimateMinutes)} · 실제 {minutes(todo.actualMinutes)}</span>} />
      </Section>

      <Section title="예상 vs 실제" count={review.minutes.compared} id="minutes">
        {review.minutes.compared === 0 ? <p className="card empty">예상·실제 시간이 모두 있는 완료 항목이 없습니다. 완료한 일의 상세에서 실제 시간을 적어 보세요.</p>
          : <div className="card space-y-3 p-4">
            <p className="text-sm">예상 <strong className="tabular-nums">{review.minutes.estimated}분</strong> → 실제 <strong className="tabular-nums">{review.minutes.actual}분</strong>
              <span className="text-muted"> · {review.minutes.ratio}배 ({review.minutes.compared}건)</span></p>
            <Bars todos={review.completed.filter((todo) => todo.estimateMinutes && todo.actualMinutes)} />
          </div>}
      </Section>

      <Section title="못 끝낸 것" count={review.unfinished.length} id="unfinished">
        <List todos={review.unfinished} empty="이번 주 마감을 모두 끝냈습니다." onOpen={setOpenId}
          meta={(todo) => <>{todo.status === 'done' ? <span className="badge">주 넘겨 완료</span> : <DueBadge issue={todo} />}</>} />
        {newlyOverdue.length > 0 && <>
          <h4 className="eyebrow px-1 pt-2">이번 주에 새로 기한 지남</h4>
          <List todos={newlyOverdue} empty="" onOpen={setOpenId} meta={(todo) => <DueBadge issue={todo} />} />
        </>}
      </Section>

      <Section title="방치" count={review.stale} id="stale">
        <p className="card flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
          <span className="flex-1">오래 마감이 지났거나 한동안 그대로인 일이 지금 <strong className="tabular-nums">{review.stale}건</strong> 있습니다.</span>
          <a className="btn" href="#/today/stale">오늘에서 밀린 일 정리하기</a>
        </p>
      </Section>

      <Section title="활동 요약" id="activity">
        <dl className="card grid grid-cols-3 divide-x divide-line text-center">
          {([['생성', review.activity.created], ['완료', review.activity.completed], ['이동', review.activity.moved]] as const).map(([label, value]) =>
            <div key={label} className="px-2 py-3"><dt className="text-xs text-muted">{label}</dt><dd className="text-lg font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        <p className="flex flex-wrap gap-1.5 px-1 text-xs text-muted">경로:
          {(['ui', 'mcp', 'github', 'import'] as const).filter((via) => via !== 'import' || review.activity.via.import > 0).map((via) =>
            <span key={via} className="badge">{via === 'ui' ? '화면' : via === 'mcp' ? 'MCP' : via === 'github' ? 'GitHub' : '가져오기'} {review.activity.via[via]}</span>)}
        </p>
      </Section>
      </div>
    </>}
    {open && <TodoDetail key={open.id} issue={open} area={open.area} headers={headers} onClose={() => setOpenId(null)} onSaved={() => { void load(); onActivity?.(); }} />}
  </section>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="card px-3 py-2.5"><dt className="text-xs text-muted">{label}</dt><dd className="text-lg font-semibold tabular-nums">{value}</dd></div>;
}

function Section({ title, count, id, className = '', children }: { title: string; count?: number; id: string; className?: string; children: React.ReactNode }) {
  return <section aria-label={title} data-section={id} className={`min-w-0 space-y-2 ${className}`}>
    <h3 className="px-1 text-sm font-semibold">{title}{count !== undefined && <span className="ml-1.5 font-normal tabular-nums text-faint">{count}</span>}</h3>
    {children}
  </section>;
}

function List({ todos, empty, meta, onOpen }: { todos: Todo[]; empty: string; meta: (todo: Todo) => React.ReactNode; onOpen: (id: string) => void }) {
  if (!todos.length) return empty ? <p className="card empty">{empty}</p> : null;
  return <ul className="card divide-y divide-line">{todos.map((todo) => <li key={todo.id} data-todo-id={todo.id}>
    <button type="button" className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left hover:bg-sunken" onClick={() => onOpen(todo.id)}>
      <PriorityBadge priority={todo.priority} />
      <strong className="todo-title min-w-0 flex-[1_1_12rem] truncate text-sm font-medium">{todo.key && <span className="mr-1.5 font-mono text-xs text-faint">{todo.key}</span>}{todo.title}</strong>
      <span className="flex items-center gap-2"><span className="text-xs text-faint">{todo.area}</span>{meta(todo)}</span>
    </button>
  </li>)}</ul>;
}

// Two thin bars per todo on one shared minute scale: 예상 (neutral) and 실제 (accent). Text carries the difference, so color is never the only cue.
function Bars({ todos }: { todos: Todo[] }) {
  const max = Math.max(...todos.flatMap((todo) => [todo.estimateMinutes!, todo.actualMinutes!]));
  const row = 34;
  return <figure className="space-y-2">
    <figcaption className="flex gap-3 text-xs text-muted">
      <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-line-strong" />예상</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-accent" />실제</span>
    </figcaption>
    <ul className="space-y-1">{todos.map((todo) => {
      const diff = todo.actualMinutes! - todo.estimateMinutes!;
      return <li key={todo.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] items-center gap-2 text-xs sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_5rem]">
        <span className="truncate" title={todo.title}>{todo.title}</span>
        <svg viewBox={`0 0 100 ${row}`} preserveAspectRatio="none" className="h-[34px] w-full" role="img" aria-label={`${todo.title}: 예상 ${todo.estimateMinutes}분, 실제 ${todo.actualMinutes}분`}>
          <title>{`예상 ${todo.estimateMinutes}분 · 실제 ${todo.actualMinutes}분`}</title>
          <rect x="0" y="7" height="8" rx="1" width={Math.max((todo.estimateMinutes! / max) * 100, 1)} className="fill-line-strong" />
          <rect x="0" y="19" height="8" rx="1" width={Math.max((todo.actualMinutes! / max) * 100, 1)} className="fill-accent" />
        </svg>
        <span className={`text-right tabular-nums ${diff > 0 ? 'text-danger' : diff < 0 ? 'text-accent-ink' : 'text-muted'}`}>{diff > 0 ? `+${diff}분 초과` : diff < 0 ? `${diff}분 단축` : '예상대로'}</span>
      </li>;
    })}</ul>
  </figure>;
}
