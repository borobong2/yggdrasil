// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TodayView } from '../src/client/TodayView';
import { todo, lateTodo } from './ui-fixtures';
import type { TodayView as Today } from '../src/contracts/items';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const empty: Today = { date: '2026-10-26', today: [], overdue: [], waiting: [], week: [], late: [], timeline: { todos: [], ghosts: [] } };
beforeEach(() => { history.replaceState(null, '', '/'); HTMLDialogElement.prototype.showModal = function () { this.open = true; }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const view: Today = { ...empty, today: [todo({ key: 'YG-71', dueAt: '2026-10-26T12:00:00Z', recurrence: { id: 'r', freq: 'daily', time: null, monthDay: null, weekdays: null, paused: false } })], waiting: [todo({ id: 'w', title: 'Waiting', hold: 'waiting', holdReason: 'Review' })], week: [todo({ id: 'week', title: 'This week', hold: 'scheduled' })], late: Array.from({ length: 4 }, (_, i) => lateTodo({ id: `late${i}`, title: `Late ${i}`, bucket: 'older', lateDays: i ? null : 5 })), timeline: { todos: [todo({ id: 'time', title: 'Meeting', scheduledAt: '2026-10-26T01:00:00Z' })], ghosts: [{ recurrenceId: 'r', todoId: 't', title: 'Tomorrow repeat', at: '2026-10-26T03:00:00Z', priority: 'p2', allDay: false }] } };
it('renders today, waiting, late and timeline; expands late groups and opens details', async () => {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => json(path.startsWith('/api/documents') ? [] : view)));
  render(<TodayView token="owner" />);
  await screen.findByText('Write tests');
  expect(screen.getByText(/Tomorrow repeat/)).toBeTruthy();
  fireEvent.click(screen.getByText('+ 1개')); expect(screen.getByText('Late 3')).toBeTruthy(); fireEvent.click(screen.getByText('접기')); expect(screen.queryByText('Late 3')).toBeNull();
  for (const name of [/예정/, /밀린 일/, /^오늘/]) fireEvent.click(screen.getByRole('tab', { name }));
  fireEvent.click(screen.getByText('Meeting')); expect(screen.getByRole('dialog')).toBeTruthy(); fireEvent.click(screen.getByLabelText('상세 닫기'));
  fireEvent.click(screen.getByText('Waiting')); fireEvent.click(screen.getByText('취소'));
  fireEvent.click(screen.getByText('Late 0')); fireEvent.click(screen.getByLabelText('상세 닫기'));
});
it('adds an undated task and updates it through its detail panel', async () => {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => json(path.startsWith('/api/documents') ? [] : path === '/api/todos/today' ? empty : todo({ title: init?.method === 'PATCH' ? 'Edited' : 'New task' })));
  vi.stubGlobal('fetch', fetcher); const activity = vi.fn(); render(<TodayView token="" onActivity={activity} />);
  await screen.findByText(/오늘 챙길 일이 없습니다/);
  fireEvent.change(screen.getByLabelText('새 할 일 제목'), { target: { value: ' New task ' } }); fireEvent.click(screen.getByLabelText('할 일 추가'));
  fireEvent.click(await screen.findByText('날짜/상세 설정'));
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: 'Edited' } }); fireEvent.click(screen.getByText('저장'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByText(/추가됨.*Edited/)).toBeTruthy(); expect(activity).toHaveBeenCalledTimes(2);
});
it.each([200, 500])('completes optimistically with HTTP %i', async status => {
  vi.stubGlobal('fetch', vi.fn(async (_path, init) => json(init?.method ? {} : view, init?.method ? status : 200)));
  render(<TodayView token="" />); fireEvent.click(await screen.findByLabelText('Write tests 완료'));
  if (status === 500) { await screen.findByText(/완료하지 못했습니다/); expect(screen.getByText('Write tests')).toBeTruthy(); fireEvent.click(screen.getByLabelText('알림 닫기')); }
  else await waitFor(() => expect(screen.queryByText('Write tests')).toBeNull());
});
it.each(['tomorrow', 'backlog'])('applies quick %s action and undoes it', async action => {
  const fetcher = vi.fn(async (_path, init) => json(init?.method ? { todos: [todo()], previous: [{ id: 't', scheduledAt: null }], skipped: [] } : view)); vi.stubGlobal('fetch', fetcher);
  render(<TodayView token="owner" />); await screen.findByText('Write tests');
  fireEvent.click(screen.getByText(action === 'tomorrow' ? '내일' : '전부 백로그로'));
  fireEvent.click(await screen.findByText('되돌리기'));
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.body && JSON.parse(String(init.body)).action === 'restore')).toBe(true));
});
it('reports load, add and quick action failures', async () => {
  const fetcher = vi.fn(async (_path, init) => json(init?.method ? {} : view, init?.method ? 500 : 200)); vi.stubGlobal('fetch', fetcher);
  render(<TodayView token="" />); await screen.findByText('Write tests');
  fireEvent.change(screen.getByLabelText('새 할 일 제목'), { target: { value: 'Keep input' } }); fireEvent.click(screen.getByLabelText('할 일 추가')); await screen.findByRole('alert');
  expect((screen.getByLabelText('새 할 일 제목') as HTMLInputElement).value).toBe('Keep input');
  fireEvent.click(screen.getByText('내일')); await screen.findByText('변경하지 못했습니다. 다시 시도하세요.');
});
it('reports a failed initial load', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 500))); render(<TodayView token="" />); await screen.findByRole('alert'); });
it('selects rows, toggles mode and launches triage from the stale link', async () => {
  location.hash = '#/today/stale'; vi.stubGlobal('fetch', vi.fn(async () => json(view)));
  render(<TodayView token="" />); await screen.findByRole('dialog'); fireEvent.click(screen.getByLabelText('정리 모드 닫기'));
  fireEvent.click(screen.getByText('선택')); fireEvent.click(screen.getByLabelText('Write tests 선택')); expect(screen.getByRole('toolbar')).toBeTruthy(); fireEvent.click(screen.getByText('선택 끝내기'));
  fireEvent.click(screen.getByText('하나씩 정리')); await screen.findByRole('dialog');
});

it('retries initial failure, prevents duplicate retries and clears the error on success', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(json({}, 500)).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetcher); render(<TodayView token="" />);
  const retry = await screen.findByRole('button', { name: '다시 시도' });
  fireEvent.click(retry); fireEvent.click(retry);
  expect((retry as HTMLButtonElement).disabled).toBe(true); expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => finish(json(view)));
  expect(screen.getByText('Write tests')).toBeTruthy(); expect(screen.queryByRole('alert')).toBeNull();
});
it('keeps data on refresh failure and recovers through retry', async () => {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => path === '/api/todos/today' ? json(view) : json(todo({ title: 'New' })));
  vi.stubGlobal('fetch', fetcher); render(<TodayView token="" />); await screen.findByText('Write tests');
  fetcher.mockImplementation(async (path: string) => path === '/api/todos/today' ? json({}, 500) : json(todo({ title: 'New' })));
  fireEvent.change(screen.getByLabelText('새 할 일 제목'), { target: { value: 'New' } }); fireEvent.click(screen.getByLabelText('할 일 추가'));
  const retry = await screen.findByRole('button', { name: '다시 시도' });
  expect(screen.getByText('Write tests')).toBeTruthy(); expect(screen.getByRole('alert').textContent).toContain('최신');
  fetcher.mockImplementation(async () => json({ ...view, today: [todo({ title: 'Fresh' })] }));
  fireEvent.click(retry); await screen.findByText('Fresh'); expect(screen.queryByRole('alert')).toBeNull();
});
it('ignores older token responses and a refresh predating optimistic completion', async () => {
  let old!: (response: Response) => void, refresh!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { old = resolve; })).mockResolvedValueOnce(json(view));
  vi.stubGlobal('fetch', fetcher); const { rerender } = render(<TodayView token="old" />);
  rerender(<TodayView token="new" />); await screen.findByText('Write tests');
  await act(async () => old(json({ ...view, today: [todo({ title: 'Old owner' })] })));
  expect(screen.queryByText('Old owner')).toBeNull();
  fetcher.mockImplementation((path: string) => path === '/api/todos/today' ? new Promise<Response>(resolve => { refresh = resolve; }) : Promise.resolve(json(todo({ title: 'New' }))));
  fireEvent.change(screen.getByLabelText('새 할 일 제목'), { target: { value: 'New' } }); fireEvent.click(screen.getByLabelText('할 일 추가'));
  await screen.findByText(/추가됨/); fireEvent.click(screen.getByLabelText('Write tests 완료'));
  await act(async () => refresh(json(view)));
  expect(screen.queryByText('Write tests')).toBeNull();
});

it('uses roving focus with arrows/Home/End and connects each tab to its panel', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(view))); render(<TodayView token="" />);
  const tabs = await screen.findAllByRole('tab');
  expect(tabs.map(tab => tab.tabIndex)).toEqual([0, -1, -1]);
  for (const [key, index] of [['ArrowRight', 1], ['ArrowRight', 2], ['ArrowRight', 0], ['ArrowLeft', 2], ['Home', 0], ['End', 2]] as const) {
    fireEvent.keyDown(tabs.find(tab => tab.tabIndex === 0)!, { key });
    expect(document.activeElement).toBe(tabs[index]);
    expect(tabs[index].getAttribute('aria-selected')).toBe('true');
    const panel = document.getElementById(tabs[index].getAttribute('aria-controls')!);
    expect(panel?.getAttribute('role')).toBe('tabpanel'); expect(panel?.getAttribute('aria-labelledby')).toBe(tabs[index].id);
  }
  fireEvent.click(tabs[1]); expect(tabs.map(tab => tab.tabIndex)).toEqual([-1, 0, -1]);
});
it('removes mobile tab semantics on wide screens and preserves selection on return', async () => {
  let matches = true;
  let change!: () => void;
  const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation((media) => ({ get matches() { return matches; }, media, onchange: null, addEventListener(_type: string, listener: EventListenerOrEventListenerObject) { change = listener as () => void; }, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return true; } }));
  vi.stubGlobal('fetch', vi.fn(async () => json(view)));
  const { container } = render(<TodayView token="" />); const tabs = await screen.findAllByRole('tab'); fireEvent.click(tabs[1]);
  act(() => { matches = false; change(); });
  expect(screen.queryByRole('tablist')).toBeNull(); expect(screen.queryByRole('tabpanel')).toBeNull();
  expect(container.querySelector('[aria-labelledby^="today-tab-"]')).toBeNull();
  act(() => { matches = true; change(); });
  expect(screen.getByRole('tab', { name: /밀린 일/ }).getAttribute('aria-selected')).toBe('true');
  matchMedia.mockRestore();
});
