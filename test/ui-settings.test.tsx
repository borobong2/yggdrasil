// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PatSettings } from '../src/client/PatSettings';
import { BriefingSettings } from '../src/client/BriefingSettings';
import { GitHubSettings, TicketPrefixSettings } from '../src/client/GitHubSettings';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('issues a PAT once, displays usage and revokes without exposing plaintext in the list', async () => {
  const pat = { id: 'p', label: 'Editor', createdAt: '2026-01-01Z', lastUsedAt: '2026-02-01Z', revokedAt: null };
  const fetcher = vi.fn().mockResolvedValueOnce(json([])).mockResolvedValueOnce(json({ ...pat, token: 'pat-once' })).mockResolvedValueOnce(json({ ...pat, revokedAt: '2026-03-01Z' }));
  vi.stubGlobal('fetch', fetcher);
  render(<PatSettings token="owner" />);
  await screen.findByText('발급된 토큰이 없습니다.');
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: 'Editor' } });
  fireEvent.click(screen.getByText('토큰 발급'));
  await screen.findByText('pat-once');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ label: 'Editor' });
  expect(fetcher.mock.calls[1][1].headers.authorization).toBe('Bearer owner');
  fireEvent.click(screen.getByText('폐기'));
  await screen.findByText(/폐기됨/);
  expect(screen.queryByRole('button', { name: '폐기' })).toBeNull();
});

it.each(['load', 'issue', 'revoke'])('reports PAT %s failure and keeps existing state', async phase => {
  const pat = { id: 'p', label: 'Existing', createdAt: '2026-01-01Z', revokedAt: null };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(phase === 'load' ? { error: 'denied' } : [pat], phase === 'load' ? 403 : 200)).mockResolvedValue(json({ error: 'denied' }, 403)));
  render(<PatSettings token="" />);
  if (phase === 'issue') { await screen.findByText('Existing'); fireEvent.click(screen.getByText('토큰 발급')); }
  if (phase === 'revoke') { await screen.findByText('Existing'); fireEvent.click(screen.getByText('폐기')); }
  expect((await screen.findByRole('alert')).textContent).toBe('denied');
});

const settings = { enabled: true, sendTime: '07:00', missing: [], isOwner: true, lastSentDate: null };
it('saves briefing time and sends a test only when configured and owned', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json(settings)).mockResolvedValueOnce(json({ ...settings, sendTime: '08:30', enabled: false })).mockResolvedValueOnce(json({ ok: true }));
  vi.stubGlobal('fetch', fetcher);
  render(<BriefingSettings token="owner" />);
  await waitFor(() => expect((screen.getByText('저장') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByLabelText('매일 보내기'));
  fireEvent.change(screen.getByLabelText('보낼 시각'), { target: { value: '08:30' } });
  fireEvent.click(screen.getByText('저장'));
  await screen.findByText('저장했습니다.');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ enabled: false, sendTime: '08:30' });
  fireEvent.click(screen.getByText('지금 테스트 보내기'));
  await screen.findByText('텔레그램으로 보냈습니다.');
});
it.each([400, 500])('reports briefing save status %i', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(settings)).mockResolvedValue(json({}, status)));
  render(<BriefingSettings token="" />);
  await waitFor(() => expect((screen.getByText('저장') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('저장'));
  expect((await screen.findByRole('alert')).textContent).toContain(status === 400 ? 'HH:mm' : '저장하지');
});
it.each([403, 500])('reports briefing send status %i', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(settings)).mockResolvedValue(json({ error: 'send failed' }, status)));
  render(<BriefingSettings token="" />);
  await waitFor(() => expect((screen.getByText('지금 테스트 보내기') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('지금 테스트 보내기'));
  expect((await screen.findByRole('alert')).textContent).toContain(status === 403 ? '소유자' : 'send failed');
});
it.each([true, false])('disables briefing send without setup/ownership (%s)', async missing => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ...settings, missing: missing ? ['TELEGRAM_TOKEN'] : [], isOwner: false, lastSentDate: '2026-10-25' })));
  render(<BriefingSettings token="" />);
  await screen.findByText(/2026-10-25/);
  expect((screen.getByText('지금 테스트 보내기') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(missing ? /텔레그램이 아직/ : /소유자가 아닙니다/)).toBeTruthy();
});
it('reports briefing load errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  render(<BriefingSettings token="" />);
  expect((await screen.findByRole('alert')).textContent).toContain('불러오지');
});

it('connects a GitHub repo, reloads status and removes it', async () => {
  const repo = { id: 'r', fullName: 'me/repo', prefix: 'YG', lastEventAt: '2026-10-01Z', lastStatus: 'merged' };
  const fetcher = vi.fn().mockResolvedValueOnce(json([])).mockResolvedValueOnce(json(repo)).mockResolvedValueOnce(json([repo])).mockResolvedValueOnce(json({}));
  vi.stubGlobal('fetch', fetcher);
  render(<GitHubSettings token="owner" />);
  await screen.findByText('연결된 저장소가 없습니다.');
  fireEvent.change(screen.getByLabelText('저장소'), { target: { value: 'me/repo' } });
  fireEvent.change(screen.getByLabelText('키 접두어'), { target: { value: 'XX' } });
  fireEvent.click(screen.getByText('연결'));
  await screen.findByText('me/repo');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ fullName: 'me/repo', prefix: 'XX' });
  fireEvent.click(screen.getByText('해제'));
  await screen.findByText('연결된 저장소가 없습니다.');
});
it.each([403, 400])('displays repo connection rejection %s', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json([])).mockResolvedValue(json({ error: 'bad repo' }, status)));
  render(<GitHubSettings token="" />);
  await screen.findByText('연결된 저장소가 없습니다.');
  fireEvent.change(screen.getByLabelText('저장소'), { target: { value: 'me/repo' } });
  fireEvent.click(screen.getByText('연결'));
  expect((await screen.findByRole('alert')).textContent).toContain(status === 403 ? '회사' : 'bad repo');
});
it('keeps a repo visible when removal fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json([{ id: 'r', fullName: 'me/repo', prefix: 'YG' }])).mockResolvedValue(json({}, 500)));
  render(<GitHubSettings token="" />);
  fireEvent.click(await screen.findByText('해제'));
  await screen.findByRole('alert');
  expect(screen.getByText('me/repo')).toBeTruthy();
});
it('reports repo load failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'denied' }, 401)));
  render(<GitHubSettings token="" />);
  expect((await screen.findByRole('alert')).textContent).toBe('denied');
});

const epic = { epicId: 'e', area: 'Work', epic: 'App', keyPrefix: 'YG', nextNumber: 71 };
it('edits ticket prefix/counter and can remove the default', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json([epic])).mockResolvedValueOnce(json({ ...epic, keyPrefix: 'XX', nextNumber: 100 })).mockResolvedValueOnce(json({ ...epic, keyPrefix: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<TicketPrefixSettings token="owner" />);
  fireEvent.click(await screen.findByText('수정'));
  fireEvent.change(screen.getByLabelText('접두사'), { target: { value: 'XX' } });
  fireEvent.change(screen.getByLabelText('시작 번호'), { target: { value: '100' } });
  fireEvent.click(screen.getByText('저장'));
  await screen.findByText(/다음 키 XX-100/);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ prefix: 'XX', start: 100 });
  fireEvent.change(screen.getByLabelText('에픽'), { target: { value: 'e' } });
  fireEvent.change(screen.getByLabelText('접두사'), { target: { value: '' } });
  fireEvent.click(screen.getByText('저장'));
  await screen.findByText(/기본 접두사를 지웠습니다/);
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ prefix: null });
});
it.each([400, 500])('preserves prefix edit on server failure %i', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json([epic])).mockResolvedValue(json({}, status)));
  render(<TicketPrefixSettings token="" />);
  fireEvent.click(await screen.findByText('수정'));
  fireEvent.click(screen.getByText('저장'));
  expect((await screen.findByRole('alert')).textContent).toContain(status === 400 ? '1~10' : '저장하지');
});
it('reports prefix load error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 500)));
  render(<TicketPrefixSettings token="" />);
  await screen.findByRole('alert');
});
