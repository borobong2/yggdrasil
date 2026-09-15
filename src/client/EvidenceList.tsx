import { FormEvent, useEffect, useState } from 'react';
import type { Issue, IssueEvidence } from '../contracts/items.js';

export function EvidenceList({ token }: { token: string }) {
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
      if (!response.ok) throw new Error((await response.json()).error || 'Could not load issues.');
      const next = await response.json() as Issue[];
      setIssues(next); setIssueId((current) => current || next[0]?.id || '');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not load issues.'); }
    finally { setLoading(false); }
  }

  async function loadEvidence(id = issueId) {
    if (!id) return setItems([]);
    const response = await fetch(`/api/issues/${id}/evidence`, { headers });
    if (!response.ok) throw new Error((await response.json()).error || 'Could not load evidence.');
    setItems(await response.json());
  }

  useEffect(() => { void loadIssues(); }, [token]);
  useEffect(() => { void loadEvidence().catch((error) => setError(error instanceof Error ? error.message : 'Could not load evidence.')); }, [issueId]);

  async function add(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const response = await fetch(`/api/issues/${issueId}/evidence`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not add evidence.');
      setUrl(''); await loadEvidence();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not add evidence.'); }
  }

  async function remove(id: string) {
    setError('');
    try {
      const response = await fetch(`/api/issues/${issueId}/evidence/${id}`, { method: 'DELETE', headers });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not remove evidence.');
      await loadEvidence();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not remove evidence.'); }
  }

  return <section aria-label="Issue evidence">
    <h2>Issue evidence</h2>
    {loading ? <p>Loading issues…</p> : issues.length === 0 ? <p>Create an issue before adding evidence.</p> : <>
      <label htmlFor="evidence-issue">Issue</label>
      <select id="evidence-issue" value={issueId} onChange={(event) => setIssueId(event.target.value)}>{issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.title}</option>)}</select>
      <form onSubmit={add}>
        <label htmlFor="evidence-url">GitHub PR, commit, or deployment URL</label>
        <input id="evidence-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} required />
        <button>Add evidence</button>
      </form>
      <ul>{items.map((item) => <li key={item.id}><a href={item.url} target="_blank" rel="noreferrer">{item.kind}</a> — {item.status} <button type="button" onClick={() => void remove(item.id)}>Remove</button></li>)}</ul>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
