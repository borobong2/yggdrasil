// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

it('mounts the real app and routes desktop/mobile navigation and record anchors', async () => {
  window.scrollTo = () => {};
  HTMLElement.prototype.hidePopover = () => {};
  let resized: (() => void) | undefined;
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true, addEventListener: (_: string, fn: () => void) => { resized = fn; }, removeEventListener() {} }));
  const emptyToday = { date: '2026-10-26', today: [], late: [], waiting: [], week: [], overdue: [], timeline: { todos: [], ghosts: [] } };
  const review = { start: '2026-10-26', week: '2026-W44', completed: [], unfinished: [], overdue: [], byArea: [], minutes: { compared: 0, estimated: 0, actual: 0, ratio: null }, stale: 0, activity: { created: 0, completed: 0, moved: 0, via: { ui: 0, mcp: 0, github: 0, import: 0 } }, documentId: null };
  vi.stubGlobal('fetch', vi.fn(async (path: string) => new Response(JSON.stringify(path === '/api/config' ? { supabaseUrl: '', supabaseAnonKey: '' } : path === '/api/todos/today' ? emptyToday : path.startsWith('/api/calendar') ? { from: '2026-10-25', to: '2026-10-31', todos: [], undated: [], ghosts: [] } : path.startsWith('/api/review') ? review : path.startsWith('/api/briefing') ? { enabled: true, sendTime: '07:00', missing: ['TELEGRAM_TOKEN'], isOwner: false, lastSentDate: null } : []))));
  history.replaceState(null, '', '/'); localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  await act(async () => { await import('../src/client/main'); });
  await screen.findByText(/오늘 챙길 일이 없습니다/);
  const nav = screen.getByLabelText('주 메뉴');
  for (const label of ['캘린더', '인박스', '문서', '기획', '보드', '활동', '회고', '설정', '오늘']) {
    const link = within(nav).getByRole('link', { name: label });
    await act(async () => { location.hash = link.getAttribute('href')!; });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(label));
  }
  for (const [hash, label] of [['#document-00000000-0000-4000-8000-000000000001', '문서'], ['#issue-t', '기획'], ['#capture-c', '인박스'], ['#unknown', '인박스']]) {
    await act(async () => { location.hash = hash; }); await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(label));
  }
  fireEvent.click(within(screen.getByLabelText('더보기 메뉴')).getByRole('link', { name: '활동' }));
  act(() => resized?.());
  expect(screen.getByLabelText(/더보기, 현재/)).toBeTruthy();
});
