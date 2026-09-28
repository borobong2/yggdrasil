import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { SearchResult } from '../contracts/search.js';

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
      setState({ token, status: 'error', results: [], error: 'Use 200 characters or fewer.' });
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
      if (response.status === 401) throw new Error('Sign in to search your workspace.');
      if (!response.ok) throw new Error('Could not search. Please try again.');
      const results: SearchResult[] = await response.json();
      if (!controller.signal.aborted && request.current === controller) {
        setState({ token, status: 'done', results });
      }
    } catch (error) {
      if (!controller.signal.aborted && request.current === controller) {
        setState({ token, status: 'error', results: [], error: error instanceof Error ? error.message : 'Could not search. Please try again.' });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  return <section aria-label="Workspace search">
    <button type="button" onClick={open} aria-keyshortcuts="Meta+K Control+K">Search (Cmd/Ctrl+K)</button>
    <dialog ref={dialog} aria-labelledby="search-title" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); close(); } }} onCancel={(event) => { event.preventDefault(); close(); }}>
      <h2 id="search-title">Search workspace</h2>
      <button type="button" onClick={close}>Close search</button>
      <form onSubmit={search}>
        <label htmlFor="search-query">Search query</label>
        <input ref={input} id="search-query" type="search" value={query} maxLength={200}
          onChange={(event) => { reset(); setQuery(event.target.value); }} />
        <button type="submit" disabled={!query.trim()}>Search</button>
      </form>
      <div role="status" aria-live="polite">
        {(!current || current.status === 'idle') && <p>Enter a query to search documents, goals, epics, issues, and captures.</p>}
        {current?.status === 'loading' && <p>Searching…</p>}
        {current?.status === 'done' && <p>{current.results.length ? `${current.results.length} results.` : 'No results found.'}</p>}
      </div>
      {current?.status === 'error' && <p role="alert">{current.error}</p>}
      {current?.status === 'done' && <ul>{current.results.map((result) => <li key={`${result.kind}:${result.id}`}>
        <small>{result.kind}</small>
        <h3>{result.title}</h3>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{result.preview}</p>
      </li>)}</ul>}
    </dialog>
  </section>;
}
