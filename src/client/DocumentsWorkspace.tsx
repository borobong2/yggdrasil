import { FormEvent, useEffect, useState } from 'react';
import type { Document, Issue } from '../contracts/items.js';

type Props = { token: string };
const json = { 'content-type': 'application/json' };

function Tree({ documents, parentId, select }: { documents: Document[]; parentId: string | null; select: (document: Document) => void }) {
  const children = documents.filter((document) => document.parentId === parentId);
  return !children.length ? null : <ul>{children.map((document) => <li key={document.id}><button type="button" onClick={() => select(document)}>{document.title}</button><Tree documents={documents} parentId={document.id} select={select} /></li>)}</ul>;
}

export function DocumentsWorkspace({ token }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState<Document | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  async function load() {
    setLoading(true);
    const [docs, work] = await Promise.all([fetch('/api/documents', { headers }), fetch('/api/issues', { headers })]);
    if (!docs.ok || !work.ok) { setLoading(false); return setError('Could not load documents.'); }
    setDocuments(await docs.json()); setIssues(await work.json()); setError(''); setLoading(false);
  }

  async function select(document: Document) {
    setSelected(document);
    const response = await fetch(`/api/documents/${document.id}/issue-links`, { headers });
    setLinks(response.ok ? (await response.json()).map((link: { issueId: string }) => link.issueId) : []);
  }

  useEffect(() => { void load(); }, [token]);

  async function create() {
    const response = await fetch('/api/documents', { method: 'POST', headers: { ...headers, ...json }, body: JSON.stringify({ title: 'Untitled document' }) });
    if (!response.ok) return setError('Could not create document.');
    await load(); await select(await response.json());
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const response = await fetch(`/api/documents/${selected.id}`, { method: 'PATCH', headers: { ...headers, ...json }, body: JSON.stringify({ title: selected.title, body: selected.body, parentId: selected.parentId }) });
    if (!response.ok) return setError('Could not save document.');
    const next = await response.json(); setSelected(next); setDocuments((current) => current.map((document) => document.id === next.id ? next : document)); setError('');
  }

  async function toggleIssue(issueId: string) {
    if (!selected || links.includes(issueId)) return;
    const response = await fetch(`/api/documents/${selected.id}/issue-links`, { method: 'POST', headers: { ...headers, ...json }, body: JSON.stringify({ issueId }) });
    if (!response.ok) return setError('Could not link issue.');
    setLinks((current) => [...current, issueId]);
  }

  return <section>
    <h1>Documents</h1>
    <>
      <button type="button" onClick={() => void create()}>New document</button>
      {error && <p role="alert">{error}</p>}
      {loading && <p>Loading documents…</p>}
      {!documents.length ? <p>No documents yet.</p> : <Tree documents={documents} parentId={null} select={(document) => void select(document)} />}
      {selected && <form onSubmit={save}>
        <label>Title<input value={selected.title} onChange={(event) => setSelected({ ...selected, title: event.target.value })} required /></label>
        <label>Body<textarea value={selected.body} onChange={(event) => setSelected({ ...selected, body: event.target.value })} /></label>
        <label>Parent<select value={selected.parentId ?? ''} onChange={(event) => setSelected({ ...selected, parentId: event.target.value || null })}><option value="">Top level</option>{documents.filter((document) => document.id !== selected.id).map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
        <button>Save</button>
        <label>Link issue<select value="" onChange={(event) => { if (event.target.value) void toggleIssue(event.target.value); }}><option value="">Choose an issue</option>{issues.filter((issue) => !links.includes(issue.id)).map((issue) => <option key={issue.id} value={issue.id}>{issue.title}</option>)}</select></label>
      </form>}
    </>
  </section>;
}
