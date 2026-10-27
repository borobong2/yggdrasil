// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { TodoDetail } from '../src/client/TodoDetail';
import { TriageDialog, ageLabel } from '../src/client/TriageDialog';
import { BulkActions, nextMonday, plusDays, SelectBox, useSelection } from '../src/client/BulkActions';
import { todo, lateTodo } from './ui-fixtures';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.open = true; }; HTMLDialogElement.prototype.close = function () { this.open = false; }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

it('saves only changed todo fields with Seoul times, recurrence and duration', async () => {
  let payload: Record<string, unknown> = {};
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith('/api/documents')) return json([]);
    payload = JSON.parse(String(init?.body)); return json(todo({ title: 'Changed' }));
  }));
  const saved = vi.fn(), closed = vi.fn();
  render(<TodoDetail issue={todo()} area="Work" headers={{}} onClose={closed} onSaved={saved} />);
  change('제목', 'Changed'); change('우선순위', 'p1'); change('보류', 'blocked'); change('보류 사유', 'Wait for review');
  for (const [day, time] of [['마감일', '마감 시각'], ['시작/예정일', '시작/예정 시각'], ['내부 완료 목표일', '내부 완료 목표 시각']]) { change(day, '2026-10-28'); change(time, '09:30'); }
  change('예상 시간 (분)', '45'); change('메모', 'A note'); change('반복 주기', 'weekly');
  change('반복 시각', '10:00'); fireEvent.click(screen.getByRole('button', { name: '화' })); fireEvent.click(screen.getByRole('button', { name: '화' }));
  fireEvent.click(screen.getByLabelText('일시정지')); fireEvent.click(screen.getByText('저장'));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(payload).toMatchObject({ title: 'Changed', priority: 'p1', hold: 'blocked', holdReason: 'Wait for review', dueAt: '2026-10-28T09:30:00+09:00', scheduledAt: '2026-10-28T09:30:00+09:00', targetAt: '2026-10-28T09:30:00+09:00', estimateMinutes: 45, notes: 'A note', recurrence: { freq: 'weekly', paused: true, time: '10:00' } });
  expect(closed).toHaveBeenCalledTimes(1);
});
it('clears dates, ends a repeat and corrects completion details', async () => {
  const item = todo({ status: 'done', key: 'YG-1', dueAt: '2026-10-02T00:00:00Z', scheduledAt: '2026-10-02T00:00:00Z', targetAt: '2026-10-02T00:00:00Z', actualMinutes: 10, estimateMinutes: 20, completedAt: '2026-10-03T00:00:00Z', recurrence: { id: 'r', freq: 'monthly', monthDay: 31, weekdays: null, time: null, paused: false } });
  const fetcher = vi.fn(async (path: string) => json(path.startsWith('/api/documents') ? [] : item)); vi.stubGlobal('fetch', fetcher);
  render(<TodoDetail issue={item} area="Work" headers={{}} onClose={vi.fn()} onSaved={vi.fn()} />);
  change('반복 날짜', '30'); change('반복 주기', ''); change('마감일', ''); change('시작/예정일', ''); change('내부 완료 목표일', ''); change('완료일', '2026-10-02'); change('실제 시간 (분)', '30'); change('예상 시간 (분)', '');
  fireEvent.click(screen.getByText('저장'));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  const init = fetcher.mock.calls[1] as unknown as [string, RequestInit];
  expect(JSON.parse(String(init[1].body))).toMatchObject({ dueAt: null, scheduledAt: null, targetAt: null, recurrence: null, actualMinutes: 30, estimateMinutes: null, completedAt: '2026-10-02' });
});
it('closes an unchanged draft without a write', () => {
  const fetcher = vi.fn().mockResolvedValue(json([])); vi.stubGlobal('fetch', fetcher); const closed = vi.fn();
  const { container } = render(<TodoDetail issue={todo()} area="Work" headers={{}} onClose={closed} onSaved={vi.fn()} />);
  fireEvent.click(screen.getByText('저장')); fireEvent.click(screen.getByLabelText('상세 닫기')); fireEvent.click(screen.getByText('취소')); fireEvent.click(container.querySelector('dialog')!);
  fireEvent(container.querySelector('dialog')!, new Event('cancel', { cancelable: true }));
  expect(closed).toHaveBeenCalledTimes(5); expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([200, 400, 500])('completes a todo and reports HTTP %i', async status => {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => json(path.startsWith('/api/documents') ? [] : todo({ status: 'done' }), path.startsWith('/api/documents') ? 200 : status)));
  const saved = vi.fn(); render(<TodoDetail issue={todo()} area="Work" headers={{}} onClose={vi.fn()} onSaved={saved} />);
  fireEvent.click(screen.getByText('완료 처리'));
  if (status === 200) await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  else expect((await screen.findByRole('alert')).textContent).toContain(status === 400 ? '입력값' : '저장하지');
});
it.each(['', 'XX'])('promotes a todo with prefix %s and handles invalid prefix', async prefix => {
  const fetcher = vi.fn(async (path: string) => json(path.startsWith('/api/documents') ? [] : {}, path.startsWith('/api/documents') ? 200 : 400)); vi.stubGlobal('fetch', fetcher);
  render(<TodoDetail issue={todo()} area="Work" headers={{}} onClose={vi.fn()} onSaved={vi.fn()} />);
  change('티켓 키', prefix); fireEvent.click(screen.getByText('티켓으로 승격'));
  expect((await screen.findByRole('alert')).textContent).toContain(prefix ? '1~10' : '기본 접두사');
});
it.each([200, 500])('handles promotion response %i', async status => {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => json(path.startsWith('/api/documents') ? [] : todo({ key: 'YG-71' }), path.startsWith('/api/documents') ? 200 : status)));
  const saved = vi.fn(); render(<TodoDetail issue={todo()} area="Work" headers={{}} onClose={vi.fn()} onSaved={saved} />);
  fireEvent.click(screen.getByText('티켓으로 승격'));
  if (status === 200) await waitFor(() => expect(saved).toHaveBeenCalledTimes(1)); else await screen.findByRole('alert');
});
it('selects a reverse shift range, toggles and clears the anchor', () => {
  const { result } = renderHook(useSelection);
  act(() => result.current.toggle('c', false, ['a', 'b', 'c']));
  act(() => result.current.toggle('a', true, ['a', 'b', 'c']));
  expect([...result.current.selected].sort()).toEqual(['a', 'b', 'c']);
  act(() => result.current.toggle('b', false, ['a', 'b', 'c']));
  expect(result.current.selected.has('b')).toBe(false);
  act(() => result.current.setMode(true)); act(() => result.current.clear());
  expect(result.current.active).toBe(false);
  act(() => result.current.toggle('x', true, [])); expect([...result.current.selected]).toEqual(['x']);
  expect(nextMonday('2026-10-26')).toBe('2026-11-02'); expect(nextMonday('2026-10-25')).toBe('2026-10-26'); expect(plusDays('2024-02-28', 1)).toBe('2024-02-29');
});
function BulkHarness() {
  const selection = useSelection();
  return <><button onClick={() => selection.toggle('t', false, ['t'])}>pick</button><BulkActions selection={selection} headers={{}} onApplied={() => {}} /></>;
}
it.each(['complete', 'backlog', 'tomorrow', 'week', 'date', 'hold'])('applies bulk %s and restores snapshots', async action => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({ todos: [todo()], previous: [{ id: 't', status: 'todo' }], skipped: [] })).mockResolvedValueOnce(json({ todos: [], previous: [], skipped: ['t'] })); vi.stubGlobal('fetch', fetcher);
  render(<BulkHarness />); fireEvent.click(screen.getByText('pick'));
  if (['tomorrow', 'week', 'date'].includes(action)) {
    fireEvent.click(screen.getByText('미루기'));
    if (action === 'date') { change('미룰 날짜', '2026-12-01'); fireEvent.click(screen.getByText('적용')); }
    else fireEvent.click(screen.getByText(action === 'week' ? '다음 주 월요일' : '내일'));
  } else if (action === 'hold') { fireEvent.click(screen.getByText('보류')); change('보류 종류', 'blocked'); change('보류 사유', 'Review'); fireEvent.click(screen.getByText('적용')); }
  else fireEvent.click(screen.getByText(action === 'complete' ? '완료' : '백로그로'));
  fireEvent.click(await screen.findByText('되돌리기'));
  await screen.findByText(/다음 회차가 이미/);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: 'restore', items: [{ id: 't', status: 'todo' }] });
  fireEvent.click(screen.getByLabelText('알림 닫기')); expect(screen.queryByRole('status')).toBeNull();
});
it('keeps bulk selection on failure and clears menus when cancelled', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 500)));
  render(<BulkHarness />); fireEvent.click(screen.getByText('pick')); fireEvent.click(screen.getByText('완료'));
  await screen.findByRole('alert'); fireEvent.click(screen.getByText('미루기')); fireEvent.click(screen.getByText('미루기')); fireEvent.click(screen.getByText('보류')); fireEvent.click(screen.getByText('보류'));
  fireEvent.click(screen.getByLabelText('선택 해제')); expect(screen.queryByRole('toolbar')).toBeNull();
});
it('passes shift selection through the shared checkbox', () => {
  const toggle = vi.fn(); render(<SelectBox label="Task" checked={false} onToggle={toggle} />);
  fireEvent.click(screen.getByRole('checkbox'), { shiftKey: true }); expect(toggle).toHaveBeenCalledWith(true);
});
it.each(['done', 'today', 'week', 'backlog', 'hold', 'archive'])('triages %s and undoes the change', async decision => {
  const fetcher = vi.fn().mockResolvedValue(json({ todos: [], previous: [{ id: 't' }], skipped: [] })); vi.stubGlobal('fetch', fetcher);
  const decided = vi.fn(), closed = vi.fn(); render(<TriageDialog items={[lateTodo({ key: 'YG-1', hold: 'waiting', holdReason: 'Wait', dueAllDay: true, scheduledAt: '2026-10-01Z', scheduledAllDay: true })]} date="2026-10-26" headers={{}} onDecided={decided} onClose={closed} />);
  if (decision === 'done') fireEvent.click(screen.getByLabelText('완료일: 마감일로'));
  if (decision === 'hold') { change('대기 사유', 'Wait'); fireEvent.keyDown(screen.getByLabelText('대기 사유'), { key: 'Enter' }); }
  else fireEvent.keyDown(document.body, { code: { done: 'KeyD', today: 'KeyT', week: 'KeyW', backlog: 'KeyB', archive: 'KeyA' }[decision] });
  await screen.findByText('밀린 일 0 🎉');
  await waitFor(() => expect((screen.getByText('되돌리기') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.keyDown(document.body, { code: 'KeyU' });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(decided).toHaveBeenNthCalledWith(1, 't', true); expect(decided).toHaveBeenNthCalledWith(2, 't', false);
  expect(screen.getByText('Write tests')).toBeTruthy();
});
it('rolls back failed triage and reports undo failures', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({}, 500)); vi.stubGlobal('fetch', fetcher);
  render(<TriageDialog items={[lateTodo({ lateDays: null, dueAt: null, untouchedDays: 40 })]} date="2026-10-26" headers={{}} onDecided={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('보관')); await screen.findByRole('alert');
  fireEvent.click(screen.getByText('보관')); await screen.findByText('밀린 일 0 🎉');
  await waitFor(() => expect((screen.getByText('되돌리기') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('되돌리기')); expect((await screen.findByRole('alert')).textContent).toContain('되돌리지');
  expect(ageLabel(40)).toBe('40일 동안 그대로'); expect(ageLabel(65)).toBe('2개월 동안 그대로');
});
it('does not triage while typing or holding a modifier; handles an empty queue', () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); const closed = vi.fn();
  const { unmount } = render(<TriageDialog items={[lateTodo()]} date="2026-10-26" headers={{}} onDecided={vi.fn()} onClose={closed} />);
  fireEvent.keyDown(screen.getByLabelText('대기 사유'), { code: 'KeyD' }); fireEvent.keyDown(document.body, { code: 'KeyD', ctrlKey: true }); expect(fetcher).not.toHaveBeenCalled(); unmount();
  render(<TriageDialog items={[]} date="2026-10-26" headers={{}} onDecided={vi.fn()} onClose={closed} />); fireEvent.click(screen.getByText('닫기')); expect(closed).toHaveBeenCalledTimes(1);
});

it.each(['close', 'cancel', 'backdrop', 'escape', 'complete'])('protects a changed draft on %s and preserves it when staying', async action => {
  vi.stubGlobal('fetch', vi.fn(async () => json([])));
  const confirm = vi.fn().mockReturnValue(false); vi.stubGlobal('confirm', confirm);
  const closed = vi.fn();
  const { container } = render(<TodoDetail issue={todo()} area="Work" headers={{}} onClose={closed} onSaved={vi.fn()} />);
  change('메모', 'draft');
  if (action === 'escape') fireEvent(container.querySelector('dialog')!, new Event('cancel', { cancelable: true }));
  else if (action === 'backdrop') fireEvent.click(container.querySelector('dialog')!);
  else fireEvent.click(screen.getByRole('button', { name: { close: '상세 닫기', cancel: '취소', complete: '완료 처리' }[action] }));
  expect(confirm).toHaveBeenCalledTimes(1); expect(closed).not.toHaveBeenCalled();
  expect((screen.getByLabelText('메모') as HTMLTextAreaElement).value).toBe('draft');
  confirm.mockReturnValue(true); fireEvent.click(screen.getByLabelText('상세 닫기'));
  expect(closed).toHaveBeenCalledTimes(1);
});
it('blocks closing, edits, promotion and duplicate submit during a delayed save; retains failed draft', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn((path: string) => path.startsWith('/api/documents') ? Promise.resolve(json([])) : new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetcher); const closed = vi.fn();
  const { container } = render(<TodoDetail issue={todo()} area="Work" headers={{}} onClose={closed} onSaved={vi.fn()} />);
  change('제목', 'draft');
  expect((screen.getByText('티켓으로 승격') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(container.querySelector('form')!); fireEvent.submit(container.querySelector('form')!);
  fireEvent.click(screen.getByLabelText('상세 닫기')); fireEvent.click(container.querySelector('dialog')!);
  fireEvent(container.querySelector('dialog')!, new Event('cancel', { cancelable: true }));
  expect(closed).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => finish(json({}, 500)));
  expect((screen.getByLabelText('제목') as HTMLInputElement).value).toBe('draft');
  expect(screen.getByRole('alert').textContent).toContain('저장하지');
});
