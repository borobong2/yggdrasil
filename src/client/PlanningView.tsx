import { FormEvent, useEffect, useState } from 'react';
import type { Issue, PlanningEpic, PlanningGoal } from '../contracts/items.js';
import { Plus } from 'lucide-react';
import { PlanningTree } from './PlanningTree.js';
import { DueBadge, formatDate, HoldBadge, PriorityBadge, ProgressBar, statusLabels } from './format.js';

export function PlanningView({ token }: { token: string }) {
  const [goals, setGoals] = useState<PlanningGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PlanningGoal | PlanningEpic | Issue>();
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  async function load(current = () => true) {
    if (current()) { setLoading(true); setError(''); }
    try {
      const response = await fetch('/api/planning/tree', { headers });
      if (response.ok) { const tree = await response.json(); if (current()) setGoals(tree); }
      else if (current()) setError('기획을 불러오지 못했습니다.');
    } catch { if (current()) setError('기획을 불러오지 못했습니다.'); }
    if (current()) setLoading(false);
  }

  useEffect(() => { let current = true; void load(() => current); return () => { current = false; }; }, [token]);

  const [kind, setKind] = useState<'goal' | 'epic' | 'issue'>('goal');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget; // currentTarget is null after the await below
    const form = new FormData(element);
    const title = String(form.get('title'));
    const parentId = String(form.get('parentId'));
    const path = kind === 'goal' ? '/api/goals' : kind === 'epic' ? '/api/epics' : '/api/issues';
    const body = kind === 'goal' ? { title } : kind === 'epic' ? { title, goalId: parentId } : { title, epicId: parentId };
    const response = await fetch(path, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) { setError('기획 항목을 만들지 못했습니다.'); return; }
    element.reset();
    await load();
  }

  async function updateStatus(id: string, status: 'backlog' | 'todo' | 'doing' | 'done') {
    try {
      const response = await fetch(`/api/issues/${id}`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!response.ok) { setError('이슈 상태를 바꾸지 못했습니다.'); return; }
      await load();
    } catch { setError('이슈 상태를 바꾸지 못했습니다.'); }
  }

  const epics = goals.flatMap((goal) => goal.epics);
  const kindLabels = { goal: '목표', epic: '에픽', issue: '이슈' } as const;
  return <section aria-label="기획" className="space-y-4">
    <form onSubmit={create} className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-end">
      <label className="sm:w-28"><span className="label">유형</span><select name="kind" className="field" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>{(['goal', 'epic', 'issue'] as const).map((value) => <option key={value} value={value}>{kindLabels[value]}</option>)}</select></label>
      <label className="min-w-0 flex-1"><span className="label">제목</span><input name="title" className="field" required maxLength={200} placeholder={`새 ${kindLabels[kind]} 제목`} /></label>
      {kind !== 'goal' && <label className="min-w-0 sm:w-56"><span className="label">상위 항목</span><select name="parentId" className="field" required><option value="">{kind === 'epic' ? '목표 선택' : '에픽 선택'}</option>{kind === 'epic' ? goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>) : epics.map((epic) => <option key={epic.id} value={epic.id}>{epic.title}</option>)}</select></label>}
      <button className="btn btn-primary h-8"><Plus />만들기</button>
    </form>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">{loading ? <p role="status" className="empty">기획을 불러오는 중…</p> : error ? <p role="alert" className="alert">{error}</p> : goals.length ? <PlanningTree goals={goals} selectedId={selected?.id} onSelect={setSelected} onStatusChange={updateStatus} /> : <p className="card empty">아직 기획 항목이 없습니다. 목표부터 만들어 보세요.</p>}</div>
      <aside aria-label="선택 항목" className="card p-4 lg:sticky lg:top-16">
        {!selected ? <p className="text-sm text-faint">항목을 선택하면 상세가 표시됩니다.</p> : <Detail item={selected} />}
      </aside>
    </div>
  </section>;
}

function Detail({ item }: { item: PlanningGoal | PlanningEpic | Issue }) {
  const kind = 'epics' in item ? '목표' : 'issues' in item ? '에픽' : '이슈';
  return <div className="space-y-3">
    <div><p className="eyebrow">{kind}</p><h2 className="mt-1 break-words text-lg font-semibold">{item.title}</h2></div>
    {'progress' in item && <ProgressBar {...item.progress} />}
    {'status' in item && <>
      <dl className="grid grid-cols-[72px_1fr] gap-y-2 text-sm">
        <dt className="text-muted">상태</dt><dd>{statusLabels[item.status]}</dd>
        <dt className="text-muted">우선순위</dt><dd><PriorityBadge priority={item.priority} /></dd>
        <dt className="text-muted">마감</dt><dd>{item.dueAt ? <DueBadge issue={item} /> : <span className="text-faint">없음</span>}</dd>
        {item.hold && <><dt className="text-muted">보류</dt><dd className="space-y-1"><HoldBadge hold={item.hold} reason={item.holdReason} />{item.holdReason && <p className="text-xs text-muted">{item.holdReason}</p>}{item.scheduledAt && <p className="text-xs text-muted">예정일 {formatDate(item.scheduledAt)}</p>}</dd></>}
        {item.estimateMinutes != null && <><dt className="text-muted">예상</dt><dd>{item.estimateMinutes}분</dd></>}
      </dl>
      {item.notes && <p className="whitespace-pre-wrap break-words rounded-md bg-sunken p-3 text-sm text-muted">{item.notes}</p>}
    </>}
  </div>;
}
