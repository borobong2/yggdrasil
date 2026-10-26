// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BoardView } from '../src/client/BoardView';
import { CalendarView } from '../src/client/CalendarView';
import { todo } from './ui-fixtures';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.open = true; }; history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const issues = [todo({ key: 'YG-71', hold: 'waiting', holdReason: 'Review', dueAt: '2026-10-20Z', links: [{ kind: 'web', label: 'Spec', url: 'https://example.test' }] }), ...Array.from({ length: 6 }, (_, i) => todo({ id: `done${i}`, title: `Done ${i}`, status: 'done', position: i }))];
function boardFetch(status = 200) { return vi.fn(async (path: string, init?: RequestInit) => json(path === '/api/goals' ? [{ id: 'g', title: 'Work' }] : path === '/api/epics' ? [{ id: 'e', goalId: 'g' }] : path.startsWith('/api/documents') ? [] : init?.method ? todo({ status: 'doing' }) : issues, init?.method ? status : 200)); }
it('filters board, expands done cards and selects a range', async () => {
  vi.stubGlobal('fetch', boardFetch()); render(<BoardView token="owner" />); await screen.findByText('Write tests');
  expect(screen.queryByText('Done 5')).toBeNull(); fireEvent.click(screen.getByText('더보기 (1개)')); expect(screen.getByText('Done 5')).toBeTruthy(); fireEvent.click(screen.getByText('최근 것만 보기'));
  fireEvent.change(screen.getByLabelText('영역 필터'), { target: { value: 'Work' } });
  fireEvent.change(screen.getByLabelText('우선순위 필터'), { target: { value: 'p1' } }); expect(screen.queryByText('Write tests')).toBeNull();
  fireEvent.click(screen.getByText('필터 해제')); fireEvent.change(screen.getByLabelText('보류 필터'), { target: { value: 'none' } }); expect(screen.queryByText('Write tests')).toBeNull();
  fireEvent.change(screen.getByLabelText('보류 필터'), { target: { value: 'waiting' } }); expect(screen.getByText('Write tests')).toBeTruthy(); fireEvent.click(screen.getByText('필터 해제'));
  fireEvent.click(screen.getByText('선택')); fireEvent.click(screen.getByLabelText('Write tests 선택')); fireEvent.click(screen.getByText('Done 0'), { shiftKey: true }); expect(screen.getByRole('toolbar')).toBeTruthy(); fireEvent.click(screen.getByText('선택 끝내기'));
});
it.each([200, 500])('moves board card through accessible menu with HTTP %i', async status => {
  const fetcher = boardFetch(status); vi.stubGlobal('fetch', fetcher); const activity = vi.fn(); render(<BoardView token="" onActivity={activity} />);
  fireEvent.click(await screen.findByLabelText('Write tests 메뉴'));
  fireEvent.click(within(screen.getByLabelText('상태 이동')).getByText('진행 중'));
  if (status === 200) { await waitFor(() => expect(activity).toHaveBeenCalledTimes(1)); expect(within(screen.getByRole('region', { name: '진행 중' })).getByText('Write tests')).toBeTruthy(); }
  else { await screen.findByRole('alert'); expect(within(screen.getByRole('region', { name: '할 일' })).getByText('Write tests')).toBeTruthy(); fireEvent.click(screen.getByLabelText('오류 닫기')); }
});
it('opens board detail and merges edited state', async () => {
  vi.stubGlobal('fetch', boardFetch()); render(<BoardView token="" />);
  fireEvent.click(await screen.findByText('Write tests')); fireEvent.change(screen.getByLabelText('제목'), { target: { value: 'Changed' } }); fireEvent.click(screen.getByText('저장'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(within(screen.getByRole('region', { name: '진행 중' })).getByText('Write tests')).toBeTruthy();
});
it.each([true, false])('shows board empty/error state (%s)', async failure => {
  vi.stubGlobal('fetch', vi.fn(async () => json([], failure ? 500 : 200))); render(<BoardView token="" />);
  if (failure) await screen.findByRole('alert'); else await screen.findByText('백로그나 보드에 이슈가 없습니다.');
});
const day = '2026-10-26';
const calendarTodos = [todo({ id: 'timed', title: 'Meeting', scheduledAt: `${day}T01:00:00Z`, dueAt: `${day}T03:00:00Z`, targetAt: `${day}T02:00:00Z`, estimateMinutes: 90, hold: 'blocked' }), ...Array.from({ length: 4 }, (_, i) => todo({ id: `all${i}`, title: `All day ${i}`, scheduledAt: `${day}T00:00:00+09:00`, scheduledAllDay: true, status: i ? 'todo' : 'done' }))];
const ghosts = [{ recurrenceId: 'r', todoId: 't', title: 'Repeat', at: `${day}T01:30:00Z`, allDay: false, priority: 'p1' }, { recurrenceId: 'r2', todoId: 't2', title: 'All day repeat', at: `${day}T00:00:00+09:00`, allDay: true, priority: 'p2' }];
function calendarFetch(empty = false) { return vi.fn(async (path: string, init?: RequestInit) => {
  if (path.startsWith('/api/documents')) return json([]);
  if (path.startsWith('/api/todos')) return json(todo());
  const query = new URL(path, 'http://localhost').searchParams;
  return json({ from: query.get('from'), to: query.get('to'), todos: empty ? [] : calendarTodos, undated: empty ? [] : [todo({ title: 'Unscheduled' })], ghosts: empty ? [] : ghosts });
}); }
it.each(['month', 'week', '3day', 'day', 'list'])('renders calendar %s including all-day, timed and repeating entries', async mode => {
  history.replaceState(null, '', `#/calendar/${mode}/${day}`); vi.stubGlobal('fetch', calendarFetch()); render(<CalendarView token="owner" />);
  await screen.findAllByText('Meeting'); expect(screen.getAllByText('All day 0').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: /작업 예정 없음/ })); fireEvent.click(screen.getByText('Unscheduled')); expect(screen.getByRole('dialog')).toBeTruthy(); fireEvent.click(screen.getByLabelText('상세 닫기'));
  fireEvent.click(screen.getAllByText('Meeting')[0]); fireEvent.click(screen.getByText('취소'));
});
it('creates a calendar item from a timed slot and reloads', async () => {
  history.replaceState(null, '', `#/calendar/day/${day}`); const fetcher = calendarFetch(); vi.stubGlobal('fetch', fetcher); const activity = vi.fn(); render(<CalendarView token="" onActivity={activity} />);
  await screen.findByText('Meeting'); fireEvent.click(screen.getByRole('button', { name: '10월 26일 (월) 9시 할 일 추가' }));
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: 'New' } }); fireEvent.click(screen.getByText('추가'));
  await waitFor(() => expect(activity).toHaveBeenCalledTimes(1)); expect(screen.queryByRole('dialog')).toBeNull();
});
it('changes calendar range, date basis and done visibility', async () => {
  history.replaceState(null, '', `#/calendar/month/${day}`); const fetcher = calendarFetch(true); vi.stubGlobal('fetch', fetcher); render(<CalendarView token="" />);
  await waitFor(() => expect(screen.queryByText('캘린더를 불러오는 중…')).toBeNull());
  fireEvent.change(screen.getByLabelText('표시 기준'), { target: { value: 'due' } }); fireEvent.click(screen.getByLabelText('완료 표시'));
  await waitFor(() => expect(fetcher.mock.calls.some(([path]) => path.includes('done=1') && path.includes('basis=due'))).toBe(true));
  fireEvent.click(screen.getByLabelText('다음')); await waitFor(() => expect(location.hash).toContain('2026-11-01'));
  fireEvent.click(screen.getByLabelText('이전')); await waitFor(() => expect(location.hash).toContain('2026-10-01'));
  fireEvent.change(screen.getByLabelText('연·월 선택'), { target: { value: '2027-02' } }); await waitFor(() => expect(location.hash).toContain('2027-02-01'));
  fireEvent.click(within(screen.getByLabelText('보기')).getByText('목록')); await screen.findByText('이 기간에는 일정이 없습니다.');
  fireEvent.click(screen.getByRole('button', { name: /작업 예정 없음/ })); await screen.findByText(/여기로 끌어 놓으면/);
  fireEvent.click(screen.getByText('오늘'));
});
it('retries a calendar load failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({}, 500)).mockImplementation(calendarFetch(true)));
  render(<CalendarView token="" />); await screen.findByRole('alert'); fireEvent.click(screen.getByText('다시 시도')); await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});
it('supports keyboard pick-up and cancellation without persisting a board move', async () => {
  const fetcher = boardFetch(); vi.stubGlobal('fetch', fetcher); render(<BoardView token="" />);
  const title = await screen.findByText('Write tests'); const card = title.closest('button')!; card.focus();
  fireEvent.keyDown(card, { code: 'Space', key: ' ' });
  await waitFor(() => expect(screen.getAllByText('Write tests').length).toBeGreaterThan(1));
  fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });
  await waitFor(() => expect(screen.getAllByText('Write tests')).toHaveLength(1));
  expect(fetcher.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
});
it('supports keyboard calendar drag cancellation without changing any date', async () => {
  history.replaceState(null, '', `#/calendar/day/${day}`); const fetcher = calendarFetch(); vi.stubGlobal('fetch', fetcher); render(<CalendarView token="" />);
  const title = await screen.findByText('Meeting'); const card = title.closest('button')!; card.focus();
  fireEvent.keyDown(card, { code: 'Space', key: ' ' });
  await waitFor(() => expect(screen.getAllByText('Meeting').length).toBeGreaterThan(1));
  fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });
  await waitFor(() => expect(screen.getAllByText('Meeting')).toHaveLength(1));
  expect(fetcher.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
});
