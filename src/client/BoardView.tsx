import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Issue, IssueStatus } from '../contracts/items.js';
import { DueBadge, HoldBadge, PriorityBadge, statusLabels } from './format.js';
import { GitHubChips } from './GitHubChips.js';

const statuses: IssueStatus[] = ['backlog', 'todo', 'doing', 'done'];
const dots: Record<IssueStatus, string> = { backlog: 'bg-line-strong', todo: 'bg-faint', doing: 'bg-info', done: 'bg-accent' };

export function BoardView({ token, onActivity }: { token: string; onActivity?: () => void }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  const columns = Object.fromEntries(statuses.map((status) => [status, issues.filter((issue) => issue.status === status)])) as Record<IssueStatus, Issue[]>;

  async function load(current = () => true) {
    if (current()) { setLoading(true); setError(''); }
    try {
      const response = await fetch('/api/issues', { headers });
      if (!response.ok) throw new Error();
      if (current()) setIssues(await response.json());
    } catch { if (current()) setError('보드를 불러오지 못했습니다.'); }
    if (current()) setLoading(false);
  }

  useEffect(() => { let current = true; void load(() => current); return () => { current = false; }; }, [token]);

  async function move(issue: Issue, status: IssueStatus) {
    const position = status === issue.status ? 0 : columns[status].length;
    try {
      const response = await fetch(`/api/issues/${issue.id}/move`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ status, position }) });
      if (!response.ok) throw new Error();
      onActivity?.();
      await load();
    } catch { setError('이슈를 옮기지 못했습니다.'); }
  }

  return <section aria-label="실행 보드" className="space-y-4">
    {loading ? <p role="status" className="empty">보드를 불러오는 중…</p> : error ? <p role="alert" className="alert">{error}</p> : issues.length === 0 ? <p className="card empty">백로그나 보드에 이슈가 없습니다.</p> : <>
      <div aria-label="Board columns" className="grid items-start gap-3 md:grid-cols-3">
        <BoardColumn status="todo" issues={columns.todo} onMove={move} />
        <BoardColumn status="doing" issues={columns.doing} onMove={move} />
        <BoardColumn status="done" issues={columns.done} onMove={move} />
      </div>
      <details className="group rounded-lg border border-line bg-sunken/50">
        <summary className="flex h-10 items-center gap-2 px-3 text-sm font-medium text-muted marker:content-none">
          <ArrowRight className="size-3.5 transition-transform group-open:rotate-90" />백로그 <span className="tabular-nums text-faint">{columns.backlog.length}</span>
        </summary>
        <div className="px-3 pb-3"><BoardColumn status="backlog" issues={columns.backlog} onMove={move} bare /></div>
      </details>
    </>}
  </section>;
}

function BoardColumn({ status, issues, onMove, bare }: { status: IssueStatus; issues: Issue[]; onMove: (issue: Issue, status: IssueStatus) => Promise<void>; bare?: boolean }) {
  const title = statusLabels[status];
  return <section aria-label={title} className={bare ? '' : 'rounded-lg bg-sunken/70 p-2'}>
    {!bare && <h3 className="flex items-center gap-2 px-1 pb-2 text-sm font-semibold"><span className={`size-2 rounded-full ${dots[status]}`} />{title}<span className="font-normal tabular-nums text-faint">{issues.length}</span></h3>}
    {issues.length === 0 ? <p className="rounded-md border border-dashed border-line-strong py-6 text-center text-xs text-faint">이슈 없음</p>
      : <ul className={bare ? 'grid gap-2 md:grid-cols-3' : 'space-y-2'}>{issues.map((issue) => <BoardCard key={`${issue.id}:${issue.position}`} issue={issue} onMove={onMove} />)}</ul>}
  </section>;
}

function BoardCard({ issue, onMove }: { issue: Issue; onMove: (issue: Issue, status: IssueStatus) => Promise<void> }) {
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  return <li className="card p-3">
    <strong className={`block break-words text-sm font-medium ${issue.status === 'done' ? 'text-muted line-through' : ''}`}>{issue.title}</strong>
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <PriorityBadge priority={issue.priority} />
      {issue.hold && <HoldBadge hold={issue.hold} reason={issue.holdReason} />}
      <DueBadge issue={issue} />
      <GitHubChips issue={issue} />
    </div>
    <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2">
      <select aria-label={`${issue.title} destination`} className="field h-7 flex-1 text-xs" value={status} onChange={(event) => setStatus(event.target.value as IssueStatus)}>
        {statuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
      </select>
      <button type="button" className="btn h-7 px-2 text-xs" title={status === issue.status ? "같은 열의 맨 위로" : undefined} onClick={() => void onMove(issue, status)}>이동</button>
    </div>
  </li>;
}
