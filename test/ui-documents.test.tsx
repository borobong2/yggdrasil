// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DocumentsWorkspace } from '../src/client/DocumentsWorkspace';
import { todo } from './ui-fixtures';
import type { Document } from '../src/contracts/items';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const id = '00000000-0000-4000-8000-000000000001';
const doc = (changes: Partial<Document> = {}): Document => ({ id, title: 'Parent', body: 'Original body', format: 'markdown', parentId: null, position: 0, archivedAt: null, icon: null, createdAt: '2026-10-01Z', updatedAt: '2026-10-01Z', ...changes });
beforeEach(() => { history.replaceState(null, '', '/'); localStorage.clear(); HTMLElement.prototype.hidePopover = () => {}; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function server(options: { fail?: string; html?: boolean } = {}) {
  let documents = [doc({ format: options.html ? 'html' : 'markdown' }), doc({ id: 'child', title: 'Child', parentId: id, icon: '📄' }), doc({ id: 'second', title: 'Second', position: 1 }), doc({ id: 'third', title: 'Third', position: 2 })];
  let trash: Document[] = [];
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (options.fail === 'load' || options.fail === 'save' && init?.method === 'PATCH' || options.fail === 'create' && path === '/api/documents' && init?.method === 'POST' || options.fail && path.endsWith(`/${options.fail}`)) return json({}, 500);
    if (path === '/api/issues') return json([todo({ status: 'done' })]);
    if (path.endsWith('/issue-links')) return json(init?.method ? {} : [{ issueId: 't' }]);
    if (path.endsWith('?archived=true')) return json(trash);
    if (path.endsWith('/archive')) { const target = path.split('/')[3]; trash = documents.filter(d => d.id === target); documents = documents.filter(d => d.id !== target && d.parentId !== target); return json({}); }
    if (path.endsWith('/restore')) { documents.push(...trash); trash = []; return json({}); }
    if (path.endsWith('/move')) return json({});
    if (init?.method === 'PATCH') { const target = path.split('/')[3]; documents = documents.map(d => d.id === target ? { ...d, ...body } : d); return json(documents.find(d => d.id === target)); }
    if (init?.method === 'POST') { const created = doc({ id: 'new', ...body }); documents.push(created); return json(created); }
    return json(documents);
  });
  return fetcher;
}
it('opens nested pages, follows breadcrumbs, edits title/icon and persists width', async () => {
  const fetcher = server(); vi.stubGlobal('fetch', fetcher); render(<DocumentsWorkspace token="owner" />);
  const tree = await screen.findByLabelText('페이지 트리'); fireEvent.click(within(tree).getAllByLabelText('하위 페이지 펼치기')[0]); fireEvent.click(within(tree).getByText('Child'));
  await screen.findByLabelText('제목'); expect((screen.getByLabelText('제목') as HTMLInputElement).value).toBe('Child');
  fireEvent.click(within(screen.getByLabelText('경로')).getByText('Parent')); await waitFor(() => expect((screen.getByLabelText('제목') as HTMLInputElement).value).toBe('Parent'));
  fireEvent.click(screen.getByText('전체 폭')); expect(localStorage.getItem('yggdrasil-docs-wide')).toBe('1'); fireEvent.click(screen.getByText('전체 폭'));
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: '' } }); expect(screen.queryByText('저장 대기…')).toBeNull();
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: 'Renamed' } }); fireEvent.click(screen.getByLabelText('아이콘 📚'));
  await screen.findByText('저장됨'); expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH' && JSON.parse(String(init.body)).icon === '📚')).toBe(true);
  fireEvent.click(screen.getByText('아이콘 제거')); await screen.findByText('저장됨');
  fireEvent.keyDown(screen.getByLabelText('제목'), { key: 'Enter' }); expect(screen.getByRole('textbox', { name: 'p 블록' })).toBeTruthy();
});
it('creates a child page, archives and restores it', async () => {
  const fetcher = server(); vi.stubGlobal('fetch', fetcher); render(<DocumentsWorkspace token="" />);
  fireEvent.click(await screen.findByLabelText('Parent 하위 페이지 추가')); await screen.findByLabelText('제목');
  expect((screen.getByLabelText('제목') as HTMLInputElement).value).toBe('제목 없음');
  fireEvent.click(screen.getByLabelText('제목 없음 휴지통으로 이동')); await waitFor(() => expect(screen.queryByLabelText('제목 없음 휴지통으로 이동')).toBeNull());
  fireEvent.click(screen.getByText('휴지통')); fireEvent.click(await screen.findByLabelText('제목 없음 복원')); await screen.findByText('휴지통이 비어 있습니다.');
  fireEvent.click(screen.getByText('휴지통'));
});
it('creates HTML pages, edits source and flushes when changing selection', async () => {
  const fetcher = server(); vi.stubGlobal('fetch', fetcher); render(<DocumentsWorkspace token="" />);
  await screen.findByLabelText('페이지 트리'); fireEvent.change(screen.getByLabelText('새 페이지 형식'), { target: { value: 'html' } }); fireEvent.click(screen.getByText('새 페이지'));
  fireEvent.click(await screen.findByLabelText('HTML 소스 편집')); fireEvent.change(screen.getByLabelText('HTML 소스'), { target: { value: '<h1>Updated</h1>' } });
  fireEvent.click(screen.getByRole('button', { name: '페이지' })); await waitFor(() => expect(screen.queryByLabelText('HTML 소스')).toBeNull());
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH' && JSON.parse(String(init.body)).body === '<h1>Updated</h1>')).toBe(true);
});
it('keeps unsaved content and selection on save failure and retries', async () => {
  const fetcher = server({ fail: 'save' }); vi.stubGlobal('fetch', fetcher); render(<DocumentsWorkspace token="" />);
  const tree = await screen.findByLabelText('페이지 트리'); fireEvent.click(within(tree).getByText('Parent')); await screen.findByLabelText('제목');
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: 'Local edit' } });
  fireEvent.click(within(tree).getByText('Second')); await screen.findByText('저장 실패 · 다시 시도');
  expect((screen.getByLabelText('제목') as HTMLInputElement).value).toBe('Local edit');
  const succeeding = server(); fetcher.mockImplementation(succeeding); fireEvent.click(screen.getByText('저장 실패 · 다시 시도')); await screen.findByText('저장됨');
});
it.each(['load', 'create', 'archive'])('reports document %s failure', async fail => {
  vi.stubGlobal('fetch', server({ fail })); render(<DocumentsWorkspace token="" />);
  if (fail !== 'load') { await screen.findByLabelText('페이지 트리'); fireEvent.click(fail === 'create' ? screen.getByText('새 페이지') : screen.getByLabelText('Parent 휴지통으로 이동')); }
  await screen.findByRole('alert');
});
it('shows missing pages and handles corrupt stored expansion state', async () => {
  localStorage.setItem('yggdrasil-docs-expanded', '{'); history.replaceState(null, '', `#document-${id}`);
  vi.stubGlobal('fetch', vi.fn(async path => json(path === '/api/issues' ? [] : [])));
  render(<DocumentsWorkspace token="" />); await screen.findByText('페이지를 찾을 수 없습니다. 휴지통에 있는지 확인하세요.');
});
it('moves a page using native drag and refuses a move into its own descendant', async () => {
  const fetcher = server(); vi.stubGlobal('fetch', fetcher); const { container } = render(<DocumentsWorkspace token="" />);
  await screen.findByLabelText('페이지 트리');
  fireEvent.click(screen.getAllByLabelText('하위 페이지 펼치기')[0]);
  const transfer = { effectAllowed: '', setData: vi.fn() };
  const parent = container.querySelector(`[data-doc="${id}"]`)!;
  const child = container.querySelector('[data-doc="child"]')!;
  fireEvent.dragStart(parent, { dataTransfer: transfer }); fireEvent.drop(child); fireEvent.dragEnd(parent);
  await waitFor(() => expect(fetcher.mock.calls.filter(([path]) => path.endsWith('/move'))).toHaveLength(0));
  const second = container.querySelector('[data-doc="second"]')!;
  fireEvent.dragStart(second, { dataTransfer: transfer });
  vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 100 } as DOMRect);
  const event = new Event('dragover', { bubbles: true, cancelable: true }); Object.assign(event, { clientY: 50 }); fireEvent(parent, event); fireEvent.drop(parent);
  await waitFor(() => expect(fetcher.mock.calls.filter(([path]) => path.endsWith('/move'))).toHaveLength(1));
  const call = fetcher.mock.calls.find(([path]) => path.endsWith('/move'))!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({ parentId: id, index: 1 });
  expect(transfer.setData).toHaveBeenCalledWith('application/x-yggdrasil-page', 'second');
});
