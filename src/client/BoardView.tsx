import { useEffect, useState } from 'react';
import type { Issue, IssueStatus } from '../contracts/items.js';

const statuses: IssueStatus[] = ['backlog', 'todo', 'doing', 'done'];

export function BoardView({ token }: { token: string }) {
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
    } catch { if (current()) setError('Board could not be loaded.'); }
    if (current()) setLoading(false);
  }

  useEffect(() => { let current = true; void load(() => current); return () => { current = false; }; }, [token]);

  async function move(issue: Issue, status: IssueStatus) {
    const position = status === issue.status ? 0 : columns[status].length;
    try {
      const response = await fetch(`/api/issues/${issue.id}/move`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ status, position }) });
      if (!response.ok) throw new Error();
      await load();
    } catch { setError('Issue could not be moved.'); }
  }

  return <section>
    <h2>Execution board</h2>
    {loading ? <p>Loading board…</p> : error ? <p role="alert">{error}</p> : issues.length === 0 ? <p>No issues in the backlog or board.</p> : <>
      <BoardColumn title="Backlog" issues={columns.backlog} onMove={move} />
      <div aria-label="Board columns">
        <BoardColumn title="To do" issues={columns.todo} onMove={move} />
        <BoardColumn title="Doing" issues={columns.doing} onMove={move} />
        <BoardColumn title="Done" issues={columns.done} onMove={move} />
      </div>
    </>}
  </section>;
}

function BoardColumn({ title, issues, onMove }: { title: string; issues: Issue[]; onMove: (issue: Issue, status: IssueStatus) => Promise<void> }) {
  return <section aria-label={title}><h3>{title}</h3>{issues.length === 0 ? <p>No issues.</p> : <ul>{issues.map((issue) => <BoardCard key={`${issue.id}:${issue.position}`} issue={issue} onMove={onMove} />)}</ul>}</section>;
}

function BoardCard({ issue, onMove }: { issue: Issue; onMove: (issue: Issue, status: IssueStatus) => Promise<void> }) {
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  return <li><strong>{issue.title}</strong> <label>Move to <select aria-label={`${issue.title} destination`} value={status} onChange={(event) => setStatus(event.target.value as IssueStatus)}>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label> <button type="button" onClick={() => void onMove(issue, status)}>Move</button></li>;
}
