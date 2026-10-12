import { FormEvent, useEffect, useState } from 'react';
import { FileText, Link2, Plus } from 'lucide-react';
import type { Document, Issue } from '../contracts/items.js';

type Props = { token: string };
const json = { 'content-type': 'application/json' };

function Tree({ documents, parentId, select, selectedId }: { documents: Document[]; parentId: string | null; select: (document: Document) => void; selectedId?: string }) {
  const children = documents.filter((document) => document.parentId === parentId);
  return !children.length ? null : <ul className={parentId ? 'ml-3 border-l border-line pl-2' : ''}>{children.map((document) => <li key={document.id} id={`document-${document.id}`}>
    <button type="button" aria-current={document.id === selectedId || undefined} onClick={() => select(document)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-sunken hover:text-ink aria-[current=true]:bg-accent-soft aria-[current=true]:font-medium aria-[current=true]:text-accent-ink">
      <FileText className="size-3.5 shrink-0" /><span className="truncate">{document.title}</span>
    </button>
    <Tree documents={documents} parentId={document.id} select={select} selectedId={selectedId} />
  </li>)}</ul>;
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
    if (!docs.ok || !work.ok) { setLoading(false); return setError('문서를 불러오지 못했습니다.'); }
    setDocuments(await docs.json()); setIssues(await work.json()); setError(''); setLoading(false);
  }

  async function select(document: Document) {
    setSelected(document);
    const response = await fetch(`/api/documents/${document.id}/issue-links`, { headers });
    setLinks(response.ok ? (await response.json()).map((link: { issueId: string }) => link.issueId) : []);
  }

  useEffect(() => { void load(); }, [token]);

  async function create() {
    const response = await fetch('/api/documents', { method: 'POST', headers: { ...headers, ...json }, body: JSON.stringify({ title: '제목 없는 문서' }) });
    if (!response.ok) return setError('문서를 만들지 못했습니다.');
    await load(); await select(await response.json());
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const response = await fetch(`/api/documents/${selected.id}`, { method: 'PATCH', headers: { ...headers, ...json }, body: JSON.stringify({ title: selected.title, body: selected.body, parentId: selected.parentId }) });
    if (!response.ok) return setError('문서를 저장하지 못했습니다.');
    const next = await response.json(); setSelected(next); setDocuments((current) => current.map((document) => document.id === next.id ? next : document)); setError('');
  }

  async function toggleIssue(issueId: string) {
    if (!selected || links.includes(issueId)) return;
    const response = await fetch(`/api/documents/${selected.id}/issue-links`, { method: 'POST', headers: { ...headers, ...json }, body: JSON.stringify({ issueId }) });
    if (!response.ok) return setError('이슈를 연결하지 못했습니다.');
    setLinks((current) => [...current, issueId]);
  }

  const linked = issues.filter((issue) => links.includes(issue.id));
  return <section aria-label="문서" className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="card h-fit p-2">
      <div className="flex items-center justify-between px-2 py-1">
        <h2 className="eyebrow">문서 {documents.length}</h2>
        <button type="button" className="btn btn-ghost h-7 px-2" onClick={() => void create()}><Plus />새 문서</button>
      </div>
      {loading && <p role="status" className="px-2 py-1 text-xs text-faint">문서를 불러오는 중…</p>}
      {!documents.length ? <p className="empty">아직 문서가 없습니다.</p> : <Tree documents={documents} parentId={null} select={(document) => void select(document)} selectedId={selected?.id} />}
    </aside>
    <div className="min-w-0 space-y-3">
      {error && <p role="alert" className="alert">{error}</p>}
      {!selected ? <div className="card empty py-16">왼쪽에서 문서를 고르거나 새 문서를 만드세요.</div> : <form onSubmit={save} className="card flex flex-col">
        <label className="sr-only" htmlFor="document-title">제목</label>
        <input id="document-title" className="w-full rounded-t-lg border-b border-line bg-transparent px-5 pb-3 pt-5 text-xl font-semibold tracking-tight outline-none focus:bg-sunken/40" value={selected.title} onChange={(event) => setSelected({ ...selected, title: event.target.value })} required />
        <label className="sr-only" htmlFor="document-body">본문</label>
        <textarea id="document-body" className="min-h-80 w-full resize-y bg-transparent px-5 py-4 text-base leading-7 outline-none focus:bg-sunken/40" placeholder="내용을 입력하세요" value={selected.body} onChange={(event) => setSelected({ ...selected, body: event.target.value })} />
        <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
          <label><span className="label">상위 문서</span><select className="field" value={selected.parentId ?? ''} onChange={(event) => setSelected({ ...selected, parentId: event.target.value || null })}><option value="">최상위</option>{documents.filter((document) => document.id !== selected.id).map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
          <label><span className="label">이슈 연결</span><select className="field" value="" onChange={(event) => { if (event.target.value) void toggleIssue(event.target.value); }}><option value="">이슈 선택</option>{issues.filter((issue) => !links.includes(issue.id)).map((issue) => <option key={issue.id} value={issue.id}>{issue.title}</option>)}</select></label>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <div className="mr-auto flex min-w-0 flex-wrap gap-1.5">{linked.length ? linked.map((issue) => <span key={issue.id} className="badge"><Link2 />{issue.title}</span>) : <span className="text-xs text-faint">연결된 이슈 없음</span>}</div>
          <button className="btn btn-primary">저장</button>
        </div>
      </form>}
    </div>
  </section>;
}
