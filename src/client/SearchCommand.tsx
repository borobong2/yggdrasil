import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { SearchResult } from '../contracts/search.js';

const kindLabels: Record<SearchResult['kind'], string> = { document: '문서', goal: '목표', epic: '에픽', issue: '이슈', capture: '캡처' };

export function SearchCommand({ token }: { token: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<{
    token: string;
    status: 'idle' | 'loading' | 'done' | 'error';
    results: SearchResult[];
    error?: string;
  }>({ token, status: 'idle', results: [] });
  const current = state.token === token ? state : null;

  function open() {
    if (!dialog.current || dialog.current.open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current.showModal();
    input.current?.focus();
  }

  function reset() {
    request.current?.abort();
    request.current = null;
    setState({ token, status: 'idle', results: [] });
  }

  function close() {
    reset();
    dialog.current?.close();
    if (previousFocus.current?.isConnected) previousFocus.current.focus();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.altKey && !event.isComposing) {
        event.preventDefault();
        open();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useLayoutEffect(() => {
    setQuery('');
    setState({ token, status: 'idle', results: [] });
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [token]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const q = query.trim();
    if (!q) return;
    if (q.length > 200) {
      setState({ token, status: 'error', results: [], error: '200자 이하로 입력하세요.' });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setState({ token, status: 'loading', results: [] });
    try {
      const response = await fetch(`/api/search?${new URLSearchParams({ q })}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        signal: controller.signal
      });
      if (response.status === 401) throw new Error('검색하려면 로그인하세요.');
      if (!response.ok) throw new Error('검색하지 못했습니다. 다시 시도하세요.');
      const results: SearchResult[] = await response.json();
      if (!controller.signal.aborted && request.current === controller) {
        setState({ token, status: 'done', results });
      }
    } catch (error) {
      if (!controller.signal.aborted && request.current === controller) {
        setState({ token, status: 'error', results: [], error: error instanceof Error ? error.message : '검색하지 못했습니다. 다시 시도하세요.' });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  return <section aria-label="Workspace search">
    <button type="button" onClick={open} aria-keyshortcuts="Meta+K Control+K" aria-label="검색 (Cmd/Ctrl+K)"
      className="btn btn-ghost h-8 gap-2 border-line bg-surface px-2.5 text-faint shadow-card sm:w-56 sm:justify-start">
      <Search /><span className="hidden flex-1 text-left font-normal sm:inline">검색</span>
      <kbd className="hidden rounded border border-line px-1 font-sans text-2xs text-faint sm:inline">⌘K</kbd>
    </button>
    <dialog ref={dialog} aria-labelledby="search-title" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); close(); } }} onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-lg border border-line bg-surface p-0 text-ink shadow-pop">
      <h2 id="search-title" className="sr-only">워크스페이스 검색</h2>
      <form onSubmit={search} className="flex items-center gap-2 border-b border-line px-3">
        <Search className="size-4 shrink-0 text-faint" />
        <label htmlFor="search-query" className="sr-only">검색어</label>
        <input ref={input} id="search-query" type="search" value={query} maxLength={200} placeholder="문서, 목표, 에픽, 이슈, 캡처 검색"
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
          onChange={(event) => { reset(); setQuery(event.target.value); }} />
        <button type="submit" className="btn h-7 px-2 text-xs" disabled={!query.trim()}>검색</button>
        <button type="button" className="btn btn-ghost size-7 p-0" onClick={close} aria-label="검색 닫기"><X /></button>
      </form>
      <div className="max-h-[60vh] overflow-y-auto">
        <div role="status" aria-live="polite" className="px-4 py-2 text-xs text-faint">
          {(!current || current.status === 'idle') && <p>검색어를 입력하고 Enter를 누르세요.</p>}
          {current?.status === 'loading' && <p>검색 중…</p>}
          {current?.status === 'done' && <p>{current.results.length ? `결과 ${current.results.length}개` : '결과가 없습니다.'}</p>}
        </div>
        {current?.status === 'error' && <p role="alert" className="alert mx-3 mb-3">{current.error}</p>}
        {current?.status === 'done' && current.results.length > 0 && <ul className="px-2 pb-2">{current.results.map((result) => <li key={`${result.kind}:${result.id}`}>
          <a href={`#${result.kind}-${result.id}`} onClick={close} className="block rounded-md px-2 py-2 hover:bg-sunken focus-visible:bg-sunken">
            <span className="flex items-center gap-2"><small className="badge">{kindLabels[result.kind]}</small><h3 className="min-w-0 truncate text-sm font-medium">{result.title}</h3></span>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{result.preview}</p>
          </a>
        </li>)}</ul>}
      </div>
    </dialog>
  </section>;
}
