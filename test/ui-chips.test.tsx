// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LinkChips, TodoLinks } from '../src/client/LinkChips';
import { GitHubChips } from '../src/client/GitHubChips';
import { TodoDates } from '../src/client/TodoDates';
import { DueBadge, HoldBadge, PriorityBadge, ProgressBar, RecurrenceBadge } from '../src/client/format';
import { Checkbox } from '../src/client/ui/Checkbox';
import { todo } from './ui-fixtures';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('opens web/document links and copies local paths with an overflow count', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal('navigator', { clipboard: { writeText } });
  const links = [{ kind: 'web' as const, label: 'Web', url: 'https://example.test' }, { kind: 'doc' as const, label: 'Doc', path: '00000000-0000-4000-8000-000000000001' }, { kind: 'local' as const, label: 'Local', path: '/tmp/project' }, { kind: 'pr' as const, label: 'PR', url: 'https://example.test/pr' }];
  const { rerender } = render(<LinkChips links={links} max={3} />); expect(screen.getByText('+1')).toBeTruthy(); expect(screen.getByRole('link', { name: 'Doc' }).getAttribute('href')).toContain('#document-');
  fireEvent.click(screen.getByRole('button', { name: /Local 경로 복사/ })); await waitFor(() => expect(writeText).toHaveBeenCalledWith('/tmp/project'));
  rerender(<LinkChips links={links} />); expect(screen.getByRole('link', { name: 'PR' })).toBeTruthy();
});
it.each([true, false])('loads linked docs with icons or handles rejection (%s)', async success => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(success ? [{ id: 'a', title: 'Linked', icon: '📄' }, { id: 'b', title: 'No icon' }] : {}), { status: success ? 200 : 403 })));
  const { container } = render(<TodoLinks issue={todo({ links: [{ kind: 'local', label: 'Local', path: '/tmp' }] })} headers={{}} />);
  if (success) await screen.findByText('Linked'); else await waitFor(() => expect(container.querySelectorAll('a')).toHaveLength(0));
});
it.each(['open', 'merged', 'closed', 'unknown'])('renders GitHub %s state, CI and deployment', state => {
  render(<GitHubChips issue={{ key: 'YG-71', github: { pr: { number: 71, state, url: 'https://example.test/pr', ci: state === 'merged' ? 'success' : 'failure' }, deploy: { url: 'https://example.test', state: 'success' } } }} />);
  expect(screen.getByText('YG-71')).toBeTruthy(); expect(screen.getByText('CI').getAttribute('href')).toBe('https://example.test/pr/checks'); expect(screen.getByText('배포')).toBeTruthy();
});
it('renders empty chips and dates without empty placeholders', () => {
  const { container } = render(<><GitHubChips issue={{ key: null, github: null }} /><TodoDates todo={todo()} /><DueBadge issue={todo()} /></>); expect(container.textContent).toBe('');
});
it('distinguishes internal target from external deadline and all-day from timed dates', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T05:00:00Z'));
  const { container } = render(<TodoDates todo={todo({ scheduledAt: '2026-10-25T00:00:00Z', targetAt: '2026-10-25T00:00:00Z', dueAt: '2026-10-26T00:00:00+09:00', dueAllDay: true })} />);
  expect(screen.getByText(/목표 지남/)).toBeTruthy(); expect(container.querySelector('[data-overdue]')).toBeNull();
});
it('renders badges, zero progress and keyboard-accessible checkbox states', () => {
  const { rerender } = render(<><PriorityBadge priority="p1" /><HoldBadge hold="blocked" /><DueBadge issue={todo({ dueAt: '2020-01-01Z' })} /><ProgressBar done={0} total={0} /><RecurrenceBadge recurrence={{ id: 'r', freq: 'daily', paused: false, monthDay: null, weekdays: null, time: null }} /><Checkbox checked="indeterminate" aria-label="Mixed" /></>);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0'); expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('mixed');
  rerender(<><DueBadge issue={todo({ dueAt: '2099-01-01Z' })} /><Checkbox shape="circle" checked={true} aria-label="Checked" /><RecurrenceBadge recurrence={{ id: 'r', freq: 'daily', paused: true, monthDay: null, weekdays: null, time: null }} /></>);
  expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true'); expect(screen.getByText('반복 정지')).toBeTruthy();
});
