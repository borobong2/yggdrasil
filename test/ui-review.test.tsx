// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ReviewView } from '../src/client/ReviewView';
import { todo } from './ui-fixtures';
import type { WeekReview } from '../src/contracts/review';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const empty: WeekReview = { start: '2026-10-19', end: '2026-10-25', week: '2026-W43', completed: [], unfinished: [], overdue: [], byArea: [], minutes: { compared: 0, estimated: 0, actual: 0, ratio: null }, stale: 0, activity: { created: 0, completed: 0, moved: 0, via: { ui: 0, mcp: 0, github: 0, import: 0 } }, documentId: null };
beforeEach(() => { history.replaceState(null, '', '#/review/2026-10-19'); HTMLDialogElement.prototype.showModal = function () { this.open = true; }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('shows completion, duration differences and deduplicates newly overdue work', async () => {
  const completed = [-10, 0, 10].map((diff, i) => todo({ id: `done${i}`, title: `Completed ${i}`, key: i ? null : 'YG-71', status: 'done', completedAt: '2026-10-20Z', estimateMinutes: 20, actualMinutes: 20 + diff }));
  const review = { ...empty, completed: [...completed, todo({ id: 'no-time', title: 'No time', status: 'done', completedAt: '2026-10-20Z' })], byArea: [{ area: 'Work', count: 4 }], minutes: { compared: 3, estimated: 60, actual: 60, ratio: 1 }, unfinished: [todo({ id: 'late', title: 'Unfinished', dueAt: '2026-10-23Z' }), todo({ id: 'later', title: 'Finished later', status: 'done' })], overdue: [todo({ id: 'late', title: 'Unfinished' }), todo({ id: 'over', title: 'Newly overdue', dueAt: '2026-10-23Z' })], activity: { ...empty.activity, via: { ...empty.activity.via, import: 1 } } };
  const fetcher = vi.fn(async (path: string) => json(path.startsWith('/api/documents') ? [] : review)); vi.stubGlobal('fetch', fetcher); render(<ReviewView token="owner" />);
  await screen.findByText('+10분 초과'); expect(screen.getByText('-10분 단축')).toBeTruthy(); expect(screen.getByText('예상대로')).toBeTruthy(); expect(screen.getAllByText('Unfinished')).toHaveLength(1);
  fireEvent.click(within(screen.getByRole('region', { name: '이번 주 완료' })).getAllByRole('button')[0]); fireEvent.change(screen.getByLabelText('메모'), { target: { value: 'Review note' } }); fireEvent.click(screen.getByText('저장')); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it.each([true, false])('opens an existing review document or creates a new one (%s)', async existing => {
  const fetcher = vi.fn(async (_path, init) => json(init?.method ? { id: 'new-doc' } : { ...empty, documentId: existing ? 'existing-doc' : null })); vi.stubGlobal('fetch', fetcher); render(<ReviewView token="" />);
  fireEvent.click(await screen.findByText(existing ? '회고 문서 열기' : '회고 문서 만들기'));
  await waitFor(() => expect(location.hash).toBe(existing ? '#document-existing-doc' : '#document-new-doc'));
  if (!existing) expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ title: '주간 회고 2026-W43', body: expect.stringContaining('다음 주에 바꿀 것') });
});
it('navigates weeks through hash and displays empty sections', async () => {
  const fetcher = vi.fn(async (_path: string) => json(empty)); vi.stubGlobal('fetch', fetcher); render(<ReviewView token="" />); await screen.findByText('이번 주에 완료한 일이 없습니다.');
  fireEvent.click(screen.getByLabelText('이전 주')); await waitFor(() => expect(fetcher.mock.calls.some(([path]) => path.endsWith('2026-10-12'))).toBe(true));
  fireEvent.click(screen.getByLabelText('다음 주')); await waitFor(() => expect(location.hash).toBe('#/review/2026-10-19'));
  expect(screen.getByText(/예상·실제 시간이 모두/)).toBeTruthy();
});
it.each(['load', 'create'])('reports review %s failure', async phase => {
  vi.stubGlobal('fetch', vi.fn(async (_path, init) => json(phase === 'load' || init?.method ? {} : empty, phase === 'load' || init?.method ? 500 : 200))); render(<ReviewView token="" />);
  if (phase === 'create') { await screen.findByText('이번 주에 완료한 일이 없습니다.'); fireEvent.click(screen.getByText('회고 문서 만들기')); }
  await screen.findByRole('alert');
});
