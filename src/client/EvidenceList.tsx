import { FormEvent, useEffect, useState } from 'react';
import type { EvidenceKind, Issue, IssueEvidence } from '../contracts/items.js';

const kindLabels: Record<EvidenceKind, string> = { github_pr: 'PR', github_commit: '커밋', github_branch: '브랜치', deployment: '배포' };

export function EvidenceList({ token, onActivity }: { token: string; onActivity?: () => void }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issueId, setIssueId] = useState('');
  const [items, setItems] = useState<IssueEvidence[]>([]);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  async function loadIssues() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/issues', { headers });
      if (!response.ok) throw new Error((await response.json()).error || '이슈를 불러오지 못했습니다.');
      const next = await response.json() as Issue[];
      setIssues(next); setIssueId((current) => current || next[0]?.id || '');
    } catch (error) { setError(error instanceof Error ? error.message : '이슈를 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }

  async function loadEvidence(id = issueId) {
    if (!id) return setItems([]);
    const response = await fetch(`/api/issues/${id}/evidence`, { headers });
    if (!response.ok) throw new Error((await response.json()).error || '근거를 불러오지 못했습니다.');
    setItems(await response.json());
  }

  useEffect(() => { void loadIssues(); }, [token]);
  useEffect(() => { void loadEvidence().catch((error) => setError(error instanceof Error ? error.message : '근거를 불러오지 못했습니다.')); }, [issueId]);

  async function add(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const response = await fetch(`/api/issues/${issueId}/evidence`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      if (!response.ok) throw new Error((await response.json()).error || '근거를 추가하지 못했습니다.');
      onActivity?.();
      setUrl(''); await loadEvidence();
    } catch (error) { setError(error instanceof Error ? error.message : '근거를 추가하지 못했습니다.'); }
  }

  async function remove(id: string) {
    setError('');
    try {
      const response = await fetch(`/api/issues/${issueId}/evidence/${id}`, { method: 'DELETE', headers });
      if (!response.ok) throw new Error((await response.json()).error || '근거를 삭제하지 못했습니다.');
      await loadEvidence();
    } catch (error) { setError(error instanceof Error ? error.message : '근거를 삭제하지 못했습니다.'); }
  }

  return <section aria-label="Issue evidence" className="card p-4">
    <h2 className="text-lg font-semibold">실행 근거</h2>
    <p className="text-sm text-muted">이슈에 GitHub PR, 커밋, 배포 URL을 연결합니다.</p>
    {loading ? <p role="status" className="mt-3 text-sm text-faint">이슈를 불러오는 중…</p> : issues.length === 0 ? <p className="mt-3 text-sm text-faint">근거를 추가하려면 먼저 이슈를 만드세요.</p> : <div className="mt-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <div><label htmlFor="evidence-issue" className="label">이슈</label>
          <select id="evidence-issue" className="field" value={issueId} onChange={(event) => setIssueId(event.target.value)}>{issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.title}</option>)}</select></div>
        <form onSubmit={add}>
          <label htmlFor="evidence-url" className="label">GitHub PR, 커밋 또는 배포 URL</label>
          <div className="flex gap-2"><input id="evidence-url" className="field" type="url" placeholder="https://github.com/…" value={url} onChange={(event) => setUrl(event.target.value)} required />
            <button className="btn btn-primary h-8">근거 추가</button></div>
        </form>
      </div>
      {items.length > 0 && <ul className="divide-y divide-line rounded-md border border-line">{items.map((item) => <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
        <span className="badge">{kindLabels[item.kind]}</span>
        <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-accent-ink hover:underline">{item.url}</a>
        <button type="button" className="btn btn-ghost btn-danger h-7 px-2" onClick={() => void remove(item.id)}>삭제</button>
      </li>)}</ul>}
    </div>}
    {error && <p role="alert" className="alert mt-3">{error}</p>}
  </section>;
}
