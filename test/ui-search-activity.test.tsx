// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SearchCommand } from '../src/client/SearchCommand';
import { ActivityTimeline } from '../src/client/ActivityTimeline';
import { EvidenceList } from '../src/client/EvidenceList';
import { todo } from './ui-fixtures';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.open = true; }; HTMLDialogElement.prototype.close = function () { this.open = false; }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('opens search with shortcut, trims and encodes query and restores focus after choosing a result', async () => {
  const fetcher = vi.fn().mockResolvedValue(json([{ kind: 'document', id: 'd', title: 'Found', preview: '<script>text only</script>' }])); vi.stubGlobal('fetch', fetcher);
  render(<SearchCommand token="owner" />);
  const trigger = screen.getByLabelText('검색 (Cmd/Ctrl+K)'); trigger.focus();
  fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
  fireEvent.change(screen.getByLabelText('검색어'), { target: { value: ' hello & world ' } });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByText('결과 1개');
  expect(fetcher.mock.calls[0][0]).toBe('/api/search?q=hello+%26+world');
  expect(screen.getByText('<script>text only</script>')).toBeTruthy();
  fireEvent.click(screen.getByText('Found')); expect(document.activeElement).toBe(trigger);
});
it.each([200, 401, 500])('shows empty result or error for search HTTP %i', async status => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(json([], status))));
  const { container } = render(<SearchCommand token="" />); fireEvent.click(screen.getByLabelText('검색 (Cmd/Ctrl+K)'));
  fireEvent.change(screen.getByLabelText('검색어'), { target: { value: 'test' } }); fireEvent.submit(container.querySelector('form')!);
  if (status === 200) await screen.findByText('결과가 없습니다.'); else expect((await screen.findByRole('alert')).textContent).toContain(status === 401 ? '로그인' : '검색하지');
  fireEvent.keyDown(screen.getByLabelText('검색어'), { key: 'Escape' }); expect(container.querySelector('dialog')!.open).toBe(false);
});
it('aborts stale searches and resets results when owner changes', async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue(json([])); vi.stubGlobal('fetch', fetcher);
  const { container, rerender } = render(<SearchCommand token="first" />); fireEvent.click(screen.getByLabelText('검색 (Cmd/Ctrl+K)'));
  fireEvent.change(screen.getByLabelText('검색어'), { target: { value: 'old' } }); fireEvent.submit(container.querySelector('form')!);
  await screen.findByText('검색 중…');
  rerender(<SearchCommand token="second" />);
  resolve(json([{ kind: 'issue', id: 'old', title: 'Private old result', preview: '' }]));
  await waitFor(() => expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true));
  expect(screen.queryByText('Private old result')).toBeNull();
  fireEvent.submit(container.querySelector('form')!); expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('검색어'), { target: { value: 'x'.repeat(201) } }); fireEvent.submit(container.querySelector('form')!);
  await screen.findByText('200자 이하로 입력하세요.');
  fireEvent.click(screen.getByLabelText('검색 닫기'));
});
it.each([200, 401, 500])('loads/refreshes timeline and displays HTTP %i state', async status => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(json([], status))));
  render(<ActivityTimeline token="owner" revision={0} />);
  if (status === 200) await screen.findByText('아직 활동이 없습니다.'); else expect((await screen.findByRole('alert')).textContent).toContain(status === 401 ? '로그인' : '불러오지');
  fireEvent.click(screen.getByText('새로고침'));
  if (status === 200) await screen.findByText('아직 활동이 없습니다.'); else await screen.findByRole('alert');
});
it('renders activity changes, evidence and capture origin without interpreting payload as HTML', async () => {
  const base = { ownerId: 'o', actorId: 'o', subjectType: 'issue', subjectId: '123456789', createdAt: '2026-10-01Z' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([
    { ...base, id: 'a', kind: 'issue.updated', payload: { via: 'mcp', changes: { title: { from: 'Old', to: 'New' } } } },
    { ...base, id: 'b', kind: 'evidence.added', payload: { kind: 'github_pr', url: 'https://example.test', captureId: 'c' } },
    { ...base, id: 'c', kind: 'issue.completed', payload: {} }
  ])));
  render(<ActivityTimeline token="" revision={1} />);
  expect((await screen.findByText('원본 캡처 보기')).getAttribute('href')).toBe('#capture-c');
  expect(screen.getByText('github_pr: https://example.test')).toBeTruthy();
});
it('adds and removes evidence and notifies activity only after a successful write', async () => {
  let evidence: unknown[] = [];
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/issues') return json([todo(), todo({ id: 'other', title: 'Other' })]);
    if (init?.method === 'POST') evidence = [{ id: 'v', kind: 'github_pr', url: 'https://github.com/me/repo/pull/1' }];
    if (init?.method === 'DELETE') evidence = [];
    return json(evidence);
  }); vi.stubGlobal('fetch', fetcher); const activity = vi.fn();
  render(<EvidenceList token="owner" onActivity={activity} />);
  await screen.findByLabelText('GitHub PR, 커밋 또는 배포 URL');
  fireEvent.change(screen.getByLabelText('이슈'), { target: { value: 'other' } });
  fireEvent.change(screen.getByLabelText('GitHub PR, 커밋 또는 배포 URL'), { target: { value: 'https://github.com/me/repo/pull/1' } });
  fireEvent.click(screen.getByText('근거 추가')); fireEvent.click(await screen.findByText('삭제'));
  await waitFor(() => expect(screen.queryByText('삭제')).toBeNull()); expect(activity).toHaveBeenCalledTimes(1);
});
it.each(['issues', 'evidence', 'add', 'delete'])('reports evidence %s failure', async phase => {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    const fail = phase === 'issues' ? path === '/api/issues' : phase === 'evidence' ? path !== '/api/issues' : init?.method === (phase === 'add' ? 'POST' : 'DELETE');
    return json(fail ? { error: 'denied' } : path === '/api/issues' ? [todo()] : [{ id: 'v', kind: 'deployment', url: 'https://example.test' }], fail ? 403 : 200);
  }); vi.stubGlobal('fetch', fetcher); render(<EvidenceList token="" />);
  if (phase === 'add') { await screen.findByText('삭제'); fireEvent.change(screen.getByLabelText('GitHub PR, 커밋 또는 배포 URL'), { target: { value: 'https://example.test' } }); fireEvent.click(screen.getByText('근거 추가')); }
  if (phase === 'delete') fireEvent.click(await screen.findByText('삭제'));
  expect((await screen.findByRole('alert')).textContent).toBe('denied');
});
it('shows an empty issue list', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([]))); render(<EvidenceList token="" />); await screen.findByText('근거를 추가하려면 먼저 이슈를 만드세요.');
});
