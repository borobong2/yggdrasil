import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ArrowLeft, ChevronRight, Clock, FileText, MoveHorizontal, Plus, RotateCcw, SmilePlus, Trash2 } from 'lucide-react';
import type { Document, DocumentFormat, Issue } from '../contracts/items.js';
import { BlockEditor } from './BlockEditor.js';
import { HtmlDocument } from './HtmlDocument.js';
import { statusLabels } from './format.js';

type Props = { token: string };
type Status = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
type SaveJob = { id: string; changes: Record<string, unknown> };
type Zone = 'before' | 'after' | 'inside';
const json = { 'content-type': 'application/json' };
const untitled = '제목 없음';
const emojis = ['📄', '📝', '📌', '💡', '🎯', '🚀', '🧭', '🗂️', '📚', '🧪', '🛠️', '🐛', '✅', '📅', '📈', '💬', '🔒', '🌱', '🌳', '⭐', '🔥', '🧩', '🎨', '⚙️', '📦', '🧠', '🗺️', '🔍', '❤️', '🏁'];
const statusText: Record<Status, string> = { idle: '', dirty: '저장 대기…', saving: '저장 중…', saved: '저장됨', error: '저장 실패 · 다시 시도' };
const expandedKey = 'yggdrasil-docs-expanded';
const wideKey = 'yggdrasil-docs-wide';
const hashId = () => location.hash.match(/^#document-([0-9a-f-]{36})$/)?.[1] ?? null;

export function DocumentsWorkspace({ token }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [trash, setTrash] = useState<Document[] | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(hashId);
  const [links, setLinks] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(expandedKey) ?? '[]')); } catch { return new Set(); } });
  // YG-47: editor keeps a ~800px reading measure; 전체 폭 lets it use the whole area (remembered per browser).
  const [wide, setWide] = useState(() => { try { return localStorage.getItem(wideKey) === '1'; } catch { return false; } });
  const toggleWide = () => { setWide(!wide); try { localStorage.setItem(wideKey, wide ? '0' : '1'); } catch { /* private mode */ } };
  const [newFormat, setNewFormat] = useState<DocumentFormat>('markdown');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState<{ id: string; over?: string | null; zone?: Zone } | null>(null);
  const pending = useRef(new Map<string, SaveJob>());
  const saving = useRef<Promise<boolean> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const titleInput = useRef<HTMLInputElement>(null);
  const iconPicker = useRef<HTMLDivElement>(null);
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  const selected = documents.find((d) => d.id === selectedId) ?? null;
  const htmlSelected = selected?.format === 'html';
  const children = (parentId: string | null) => documents.filter((d) => d.parentId === parentId);
  const ancestors = (doc: Document | null): Document[] => { const chain: Document[] = []; for (let d = doc; d?.parentId;) { d = documents.find((x) => x.id === d!.parentId) ?? null; if (d) chain.unshift(d); } return chain; };
  const isInside = (id: string, ancestorId: string) => ancestors(documents.find((d) => d.id === id) ?? null).some((d) => d.id === ancestorId);

  async function load() {
    const [docs, work] = await Promise.all([fetch('/api/documents', { headers }), fetch('/api/issues', { headers })]);
    setLoading(false);
    if (!docs.ok || !work.ok) return setError('문서를 불러오지 못했습니다.');
    setDocuments(await docs.json()); setIssues(await work.json()); setError('');
  }
  async function loadTrash() { const response = await fetch('/api/documents?archived=true', { headers }); if (response.ok) setTrash(await response.json()); }

  useEffect(() => { void load(); }, [token]);
  useEffect(() => { try { localStorage.setItem(expandedKey, JSON.stringify([...expanded])); } catch { /* per-viewer convenience only */ } }, [expanded]);
  useEffect(() => {
    const onHash = () => { const id = hashId(); if (id || location.hash === '#/documents') void open(id); };
    const onLeave = () => { for (const job of pending.current.values()) void fetch(`/api/documents/${job.id}`, { method: 'PATCH', headers: { ...headers, ...json }, body: JSON.stringify(job.changes), keepalive: true }).catch(() => {}); };
    window.addEventListener('hashchange', onHash); window.addEventListener('pagehide', onLeave);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('pagehide', onLeave); onLeave(); };
  }, [token]);
  useEffect(() => {
    if (!selectedId) return setLinks([]);
    let current = true;
    void fetch(`/api/documents/${selectedId}/issue-links`, { headers }).then(async (response) => { if (current) setLinks(response.ok ? (await response.json()).map((link: { issueId: string }) => link.issueId) : []); });
    return () => { current = false; };
  }, [selectedId, token]);

  async function flush(): Promise<boolean> {
    window.clearTimeout(timer.current);
    if (saving.current) {
      if (!await saving.current) return false;
      return flush();
    }
    const job = pending.current.values().next().value;
    if (!job) return true;
    pending.current.delete(job.id); setStatus('saving');
    const save = async () => {
      const response = await fetch(`/api/documents/${job.id}`, { method: 'PATCH', headers: { ...headers, ...json }, body: JSON.stringify(job.changes) }).catch(() => null);
      if (!response?.ok) {
        const newer = pending.current.get(job.id);
        pending.current.set(job.id, { id: job.id, changes: { ...job.changes, ...newer?.changes } });
        setStatus('error'); return false;
      }
      const saved: Document = await response.json();
      setDocuments((all) => all.map((d) => d.id === saved.id ? { ...d, updatedAt: saved.updatedAt } : d));
      if (!pending.current.size) setStatus('saved');
      return true;
    };
    const task = save(); saving.current = task;
    let ok: boolean;
    try { ok = await task; } finally { if (saving.current === task) saving.current = null; }
    return ok ? flush() : false;
  }
  function edit(id: string, changes: Partial<Pick<Document, 'title' | 'body' | 'icon'>>) {
    setDocuments((all) => all.map((d) => d.id === id ? { ...d, ...changes } : d));
    const saveable = changes.title !== undefined && !changes.title.trim() ? { ...changes, title: undefined } : changes; // a blank title stays local until typed
    if (Object.values(saveable).every((value) => value === undefined)) return;
    pending.current.set(id, { id, changes: { ...pending.current.get(id)?.changes, ...saveable } });
    setStatus('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 700);
  }

  async function open(id: string | null) {
    if (!await flush()) return;
    setSelectedId(id); setStatus('idle');
    history.replaceState(null, '', id ? `#document-${id}` : '#/documents');
    if (id) setExpanded((current) => new Set([...current, ...ancestors(documents.find((d) => d.id === id) ?? null).map((d) => d.id)]));
  }

  async function create(parentId: string | null) {
    const response = await fetch('/api/documents', { method: 'POST', headers: { ...headers, ...json }, body: JSON.stringify({ title: untitled, parentId, format: newFormat }) });
    if (!response.ok) return setError('페이지를 만들지 못했습니다.');
    const doc: Document = await response.json();
    setDocuments((all) => [...all, doc]);
    if (parentId) setExpanded((current) => new Set([...current, parentId]));
    await open(doc.id);
    requestAnimationFrame(() => titleInput.current?.select());
  }

  async function archive(doc: Document) {
    await flush();
    const response = await fetch(`/api/documents/${doc.id}/archive`, { method: 'POST', headers });
    if (!response.ok) return setError('휴지통으로 옮기지 못했습니다.');
    if (selectedId && (selectedId === doc.id || isInside(selectedId, doc.id))) await open(doc.parentId);
    await load(); if (trash) await loadTrash();
  }
  async function restore(doc: Document) {
    const response = await fetch(`/api/documents/${doc.id}/restore`, { method: 'POST', headers });
    if (!response.ok) return setError('복원하지 못했습니다.');
    await Promise.all([load(), loadTrash()]);
  }

  async function drop(targetId: string | null, zone: Zone) {
    const dragId = drag?.id; setDrag(null);
    if (!dragId || dragId === targetId || targetId && isInside(targetId, dragId)) return; // never into its own subtree
    const target = documents.find((d) => d.id === targetId);
    const parentId = !target ? null : zone === 'inside' ? target.id : target.parentId;
    const siblings = children(parentId).filter((d) => d.id !== dragId);
    const index = !target || zone === 'inside' ? siblings.length : siblings.findIndex((d) => d.id === target.id) + (zone === 'after' ? 1 : 0);
    await flush();
    const response = await fetch(`/api/documents/${dragId}/move`, { method: 'POST', headers: { ...headers, ...json }, body: JSON.stringify({ parentId, index }) });
    if (!response.ok) setError('페이지를 옮기지 못했습니다.');
    if (parentId) setExpanded((current) => new Set([...current, parentId]));
    await load();
  }
  function dragOver(id: string, event: DragEvent<HTMLElement>) {
    if (!drag) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const y = (event.clientY - rect.top) / rect.height;
    const zone: Zone = y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside';
    if (drag.over !== id || drag.zone !== zone) setDrag({ ...drag, over: id, zone });
  }

  async function mention(issueId: string) {
    if (!selected || links.includes(issueId)) return;
    const response = await fetch(`/api/documents/${selected.id}/issue-links`, { method: 'POST', headers: { ...headers, ...json }, body: JSON.stringify({ issueId }) });
    if (response.ok || response.status === 400) setLinks((current) => current.includes(issueId) ? current : [...current, issueId]); // 400 = already linked
    else setError('할 일을 연결하지 못했습니다.');
  }

  // A render function, not a component: a nested component type would remount rows mid-drag.
  function row(doc: Document, depth: number) {
    const kids = children(doc.id);
    const isOpen = expanded.has(doc.id);
    const target = drag?.over === doc.id && drag.id !== doc.id ? drag.zone : undefined;
    return <li key={doc.id}>
      <div draggable data-doc={doc.id} aria-current={doc.id === selectedId || undefined}
        onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-yggdrasil-page', doc.id); setDrag({ id: doc.id }); }}
        onDragEnd={() => setDrag(null)} onDragOver={(event) => dragOver(doc.id, event)} onDrop={(event) => { event.preventDefault(); void drop(doc.id, drag?.zone ?? 'inside'); }}
        className={`group flex h-8 max-md:h-10 items-center gap-0.5 rounded-md pr-1 text-sm text-muted hover:bg-line/50 hover:text-ink aria-[current=true]:bg-accent-soft aria-[current=true]:font-medium aria-[current=true]:text-accent-ink
          ${target === 'inside' ? 'bg-accent-soft ring-1 ring-accent' : ''} ${target === 'before' ? 'shadow-[0_-2px_0_var(--color-accent)]' : ''} ${target === 'after' ? 'shadow-[0_2px_0_var(--color-accent)]' : ''} ${drag?.id === doc.id ? 'opacity-40' : ''}`}
        style={{ paddingLeft: 4 + depth * 14 }}>
        <button type="button" aria-label={isOpen ? '하위 페이지 접기' : '하위 페이지 펼치기'} aria-expanded={kids.length ? isOpen : undefined}
          className={`grid size-5 shrink-0 place-items-center rounded text-faint hover:bg-line hover:text-ink ${kids.length ? '' : 'invisible'}`}
          onClick={() => setExpanded((current) => { const next = new Set(current); if (!next.delete(doc.id)) next.add(doc.id); return next; })}>
          <ChevronRight className={`size-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </button>
        <button type="button" className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => void open(doc.id)}>
          <span className="grid w-4 shrink-0 place-items-center text-[13px]">{doc.icon ?? <FileText className="size-3.5" />}</span>
          <span className="truncate">{doc.title || untitled}</span>
        </button>
        <span className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          <button type="button" aria-label={`${doc.title} 하위 페이지 추가`} className="grid size-6 max-md:size-9 place-items-center rounded text-faint hover:bg-line hover:text-ink" onClick={() => void create(doc.id)}><Plus className="size-3.5" /></button>
          <button type="button" aria-label={`${doc.title} 휴지통으로 이동`} className="grid size-6 max-md:size-9 place-items-center rounded text-faint hover:bg-line hover:text-danger" onClick={() => void archive(doc)}><Trash2 className="size-3.5" /></button>
        </span>
      </div>
      {isOpen && kids.length > 0 && <ul>{kids.map((kid) => row(kid, depth + 1))}</ul>}
    </li>;
  }

  const recent = [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const linked = issues.filter((issue) => links.includes(issue.id));
  return <section aria-label="문서" className={`grid gap-4 ${htmlSelected ? 'xl:grid-cols-[280px_minmax(0,1fr)]' : 'md:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]'} md:gap-6`}>
    <aside aria-label="페이지 목록" className={`h-fit space-y-4 md:sticky md:top-16 ${selected ? htmlSelected ? 'max-xl:hidden' : 'max-md:hidden' : ''}`}>
      {documents.length > 3 && <div>
        <h2 className="eyebrow flex items-center gap-1 px-2 pb-1"><Clock className="size-3" />최근</h2>
        <ul>{recent.map((doc) => <li key={doc.id}><button type="button" onClick={() => void open(doc.id)} className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-sm text-muted hover:bg-line/50 hover:text-ink">
          <span className="w-4 shrink-0 text-center text-[13px]">{doc.icon ?? '·'}</span><span className="truncate">{doc.title}</span></button></li>)}</ul>
      </div>}
      <div>
        <div className="flex items-center justify-between px-2 pb-1" onDragOver={(event) => { if (drag) { event.preventDefault(); if (drag.over !== null) setDrag({ ...drag, over: null }); } }} onDrop={(event) => { event.preventDefault(); void drop(null, 'after'); }}>
          <h2 className="eyebrow">페이지 {documents.length}</h2>
          <label className="ml-auto mr-1"><span className="sr-only">새 페이지 형식</span><select aria-label="새 페이지 형식" value={newFormat} onChange={event => setNewFormat(event.target.value as DocumentFormat)} className="h-8 rounded border border-line bg-surface px-1 text-xs"><option value="markdown">Markdown</option><option value="html">HTML</option></select></label>
          <button type="button" className="btn btn-ghost h-7 px-2" onClick={() => void create(null)}><Plus />새 페이지</button>
        </div>
        {loading && <p role="status" className="px-2 py-1 text-xs text-faint">불러오는 중…</p>}
        {!loading && !documents.length ? <p className="empty">아직 페이지가 없습니다.<br />‘새 페이지’로 생각을 적어 보세요.</p>
          : <ul aria-label="페이지 트리">{children(null).map((doc) => row(doc, 0))}</ul>}
      </div>
      <div>
        <button type="button" aria-expanded={!!trash} className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-sm text-muted hover:bg-line/50 hover:text-ink" onClick={() => trash ? setTrash(null) : void loadTrash()}>
          <Trash2 className="size-3.5" />휴지통<ChevronRight className={`ml-auto size-3.5 transition-transform ${trash ? 'rotate-90' : ''}`} />
        </button>
        {trash && (!trash.length ? <p className="px-2 py-2 text-xs text-faint">휴지통이 비어 있습니다.</p> : <ul aria-label="휴지통">{trash.map((doc) => <li key={doc.id} className="flex h-7 items-center gap-1.5 pl-7 pr-1 text-sm text-faint">
          <span className="min-w-0 flex-1 truncate">{doc.icon} {doc.title}</span>
          <button type="button" aria-label={`${doc.title} 복원`} className="grid size-6 place-items-center rounded hover:bg-line hover:text-ink" onClick={() => void restore(doc)}><RotateCcw className="size-3.5" /></button>
        </li>)}</ul>)}
      </div>
    </aside>

    <div className={`min-w-0 space-y-3 ${selected ? '' : 'max-md:hidden'}`}>
      {error && <p role="alert" className="alert">{error}</p>}
      {!selected ? <div className="card empty py-20">{selectedId && !loading ? '페이지를 찾을 수 없습니다. 휴지통에 있는지 확인하세요.' : '왼쪽에서 페이지를 고르거나 새 페이지를 만드세요.'}</div>
        : <article className="card min-h-[70dvh]" aria-label={selected.title}>
          <div className="flex h-11 items-center gap-1 border-b border-line px-2 text-sm text-faint md:px-4">
            <button type="button" className={`btn btn-ghost h-8 px-2 ${htmlSelected ? 'xl:hidden' : 'md:hidden'}`} onClick={() => void open(null)}><ArrowLeft />페이지</button>
            <nav aria-label="경로" className="flex min-w-0 flex-1 items-center gap-1 max-md:hidden">
              {ancestors(selected).map((doc) => <span key={doc.id} className="flex min-w-0 items-center gap-1"><button type="button" className="truncate hover:text-ink" onClick={() => void open(doc.id)}>{doc.icon} {doc.title}</button><span>/</span></span>)}
              <span className="truncate text-muted">{selected.title || untitled}</span>
            </nav>
            <span role="status" aria-live="polite" data-save-status className={`ml-auto shrink-0 text-xs ${status === 'error' ? 'text-danger' : ''}`}>
              {status === 'error' ? <button type="button" className="underline" onClick={() => void flush()}>{statusText.error}</button> : statusText[status]}
            </span>
            <button type="button" className="btn btn-ghost h-8 px-2 max-lg:hidden" aria-pressed={wide} title="편집기를 영역 전체 폭으로" onClick={toggleWide}><MoveHorizontal />전체 폭</button>
          </div>
          <div data-editor-measure className={`mx-auto ${htmlSelected ? 'px-3 pb-6 pt-6 md:px-6 md:pt-8' : 'px-5 pb-10 pt-8 md:px-14 md:pt-14'} ${wide ? '' : 'max-w-[920px]'}`}>
            <div className="group/head">
              <button type="button" popoverTarget="icon-picker" aria-label="페이지 아이콘 선택"
                className={selected.icon ? 'mb-2 rounded-md p-1 text-[44px] leading-none hover:bg-sunken' : 'btn btn-ghost mb-1 h-7 px-1.5 text-xs opacity-100 md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100'}>
                {selected.icon ?? <><SmilePlus />아이콘 추가</>}
              </button>
              <div ref={iconPicker} id="icon-picker" popover="auto" aria-label="아이콘" className="m-auto w-72 rounded-lg border border-line bg-surface p-2 shadow-pop">
                <div className="grid grid-cols-6 gap-1">{emojis.map((emoji) => <button key={emoji} type="button" aria-label={`아이콘 ${emoji}`} className="grid size-10 place-items-center rounded-md text-xl hover:bg-sunken"
                  onClick={() => { edit(selected.id, { icon: emoji }); iconPicker.current?.hidePopover(); }}>{emoji}</button>)}</div>
                {selected.icon && <button type="button" className="btn btn-ghost mt-1 w-full" onClick={() => { edit(selected.id, { icon: null }); iconPicker.current?.hidePopover(); }}>아이콘 제거</button>}
              </div>
              <label className="sr-only" htmlFor="document-title">제목</label>
              <input id="document-title" ref={titleInput} value={selected.title} placeholder={untitled} maxLength={200} autoComplete="off"
                className="w-full bg-transparent text-[30px] font-bold leading-10 tracking-tight outline-none placeholder:text-line-strong md:text-[36px] md:leading-[44px]"
                onChange={(event) => edit(selected.id, { title: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  const first = document.querySelector<HTMLElement>('[data-row] textarea, [data-row] .cursor-text');
                  if (first instanceof HTMLTextAreaElement) first.focus(); else first?.click();
                }} />
            </div>
            <div className="mt-4 md:ml-0">
              {selected.format === 'html'
                ? <HtmlDocument key={selected.id} body={selected.body} onChange={body => edit(selected.id, { body })} />
                : <BlockEditor key={selected.id} initial={selected.body} issues={issues} onChange={(body) => edit(selected.id, { body })} onMention={(issueId) => void mention(issueId)} />}
            </div>
            {children(selected.id).length > 0 && <ul aria-label="하위 페이지" className="mb-6 space-y-0.5">{children(selected.id).map((doc) => <li key={doc.id}>
              <button type="button" className="flex items-center gap-2 rounded-md px-1 py-1 text-[15px] underline decoration-line-strong underline-offset-4 hover:bg-sunken" onClick={() => void open(doc.id)}>
                <span>{doc.icon ?? <FileText className="size-4 text-faint" />}</span>{doc.title}</button></li>)}</ul>}
            <section aria-label="연결된 할 일" className="border-t border-line pt-4">
              <h2 className="eyebrow mb-2">연결된 할 일 {linked.length}</h2>
              {linked.length ? <ul className="space-y-1">{linked.map((issue) => <li key={issue.id}>
                <a href={`#issue-${issue.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sunken">
                  <span className={`badge ${issue.status === 'done' ? 'bg-accent-soft text-accent-ink' : ''}`}>{statusLabels[issue.status]}</span>
                  <span className={`min-w-0 truncate ${issue.status === 'done' ? 'text-faint line-through' : ''}`}>{issue.title}</span>
                </a></li>)}</ul>
                : <p className="text-xs text-faint">본문에서 ‘@’를 입력하거나 ‘/할 일 언급’으로 할 일을 연결하세요.</p>}
            </section>
          </div>
        </article>}
    </div>
  </section>;
}
