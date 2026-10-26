// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PlanningView } from '../src/client/PlanningView';
import { PlanningTree } from '../src/client/PlanningTree';
import { todo } from './ui-fixtures';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const progress = { done: 0, total: 1, ratio: 0 };
const tree = [{ id: 'g', title: 'Goal', createdAt: '', updatedAt: '', progress, epics: [{ id: 'e', title: 'Epic', goalId: 'g', createdAt: '', updatedAt: '', keyPrefix: 'YG', progress, issues: [todo({ key: 'YG-71', hold: 'scheduled', holdReason: 'After launch', scheduledAt: '2026-10-26Z', dueAt: '2026-10-27Z', estimateMinutes: 30, notes: 'Important note', github: { pr: { number: 1, url: 'https://example.test/pr/1', state: 'merged', ci: 'success' }, deploy: null } })] }] }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('selects goal, epic and issue details and updates status', async () => {
  const fetcher = vi.fn(async (_path, init) => json(init?.method ? {} : tree)); vi.stubGlobal('fetch', fetcher);
  render(<PlanningView token="owner" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Goal' })); expect(within(screen.getByLabelText('선택 항목')).getByText('목표')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Epic' })); expect(within(screen.getByLabelText('선택 항목')).getByText('에픽')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Write tests' })); expect(screen.getByText('Important note')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Write tests status'), { target: { value: 'doing' } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ status: 'doing' });
});
it.each(['goal', 'epic', 'issue'])('creates planning %s with correct parent and ticket policy', async kind => {
  const fetcher = vi.fn(async (_path, init) => json(init?.method ? {} : tree)); vi.stubGlobal('fetch', fetcher);
  render(<PlanningView token="" />); await screen.findByRole('button', { name: 'Goal' });
  fireEvent.change(screen.getByLabelText('유형'), { target: { value: kind } });
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: 'New item' } });
  if (kind !== 'goal') fireEvent.change(screen.getByLabelText('상위 항목'), { target: { value: kind === 'epic' ? 'g' : 'e' } });
  if (kind === 'issue') { expect((screen.getByLabelText('키 접두어') as HTMLInputElement).value).toBe('YG'); fireEvent.click(screen.getByLabelText('티켓 키')); fireEvent.click(screen.getByLabelText('티켓 키')); fireEvent.change(screen.getByLabelText('키 접두어'), { target: { value: 'XX' } }); }
  fireEvent.click(screen.getByText('만들기'));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(fetcher.mock.calls[1][0]).toBe(`/api/${kind === 'goal' ? 'goals' : kind === 'epic' ? 'epics' : 'issues'}`);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ title: 'New item', ...(kind === 'epic' ? { goalId: 'g' } : kind === 'issue' ? { epicId: 'e', prefix: 'XX' } : {}) });
});
it.each(['load', 'create', 'status'])('reports planning %s failure', async phase => {
  vi.stubGlobal('fetch', vi.fn(async (_path, init) => json(phase === 'load' || init?.method ? {} : tree, phase === 'load' || init?.method ? 500 : 200)));
  render(<PlanningView token="" />);
  if (phase !== 'load') { await screen.findByRole('button', { name: 'Goal' }); if (phase === 'create') { fireEvent.change(screen.getByLabelText('제목'), { target: { value: 'New' } }); fireEvent.click(screen.getByText('만들기')); } else fireEvent.change(screen.getByLabelText('Write tests status'), { target: { value: 'done' } }); }
  await screen.findByRole('alert');
});
it('shows an empty planning tree', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([]))); render(<PlanningView token="" />); await screen.findByText(/아직 기획 항목이 없습니다/); });
it('supports done issues, no epics and empty epic groups', () => {
  const select = vi.fn(), status = vi.fn();
  render(<PlanningTree goals={[{ ...tree[0], epics: [] }, { ...tree[0], id: 'g2', title: 'Second', epics: [{ ...tree[0].epics[0], issues: [todo({ status: 'done' })] }, { ...tree[0].epics[0], id: 'empty', title: 'Empty', issues: [] }] }]} selectedId="t" onSelect={select} onStatusChange={status} />);
  fireEvent.click(screen.getByRole('button', { name: 'Write tests' })); expect(select).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }));
});
