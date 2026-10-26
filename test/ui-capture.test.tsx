// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CaptureSuggestions } from '../src/client/CaptureSuggestions';
import { CaptureDeliveryPlan } from '../src/client/CaptureDeliveryPlan';
import { InboxView } from '../src/client/InboxView';
import { CalendarCreate } from '../src/client/CalendarCreate';
import { HtmlDocument } from '../src/client/HtmlDocument';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const plan = { id: 'p', status: 'pending', design: { title: 'Build search', body: 'Search all documents' }, lanes: { fe: ['UI'], be: ['API'], docs: ['Guide'] }, model: { provider: 'openai', name: 'test' } };
it('preserves capture text, then displays generated suggestions and plan', async () => {
  let captured = '';
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/suggestions')) return json([]);
    if (path.endsWith('/delivery-plan')) return json([]);
    if (init?.method === 'POST') { captured = JSON.parse(String(init.body)).text; return json({ id: 'c' }); }
    return json(captured ? [{ id: 'c', text: captured, createdAt: '2026-10-01Z' }] : []);
  });
  vi.stubGlobal('fetch', fetcher);
  render(<InboxView token="owner" onActivity={vi.fn()} />);
  await screen.findByText('아직 캡처가 없습니다.');
  fireEvent.change(screen.getByLabelText('생각 캡처'), { target: { value: '  Original idea\nexact text  ' } });
  fireEvent.keyDown(screen.getByLabelText('생각 캡처'), { key: 'Enter', ctrlKey: true });
  await screen.findByText('Original idea exact text');
  expect(captured).toBe('  Original idea\nexact text  ');
  expect((screen.getByLabelText('생각 캡처') as HTMLTextAreaElement).value).toBe('');
});
it('keeps capture input after a rejected write', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_path, init) => json(init?.method ? {} : [], init?.method ? 400 : 200)));
  render(<InboxView token="" onActivity={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('생각 캡처'), { target: { value: 'Keep me' } });
  fireEvent.click(screen.getByText('캡처'));
  await waitFor(() => expect((screen.getByLabelText('생각 캡처') as HTMLTextAreaElement).value).toBe('Keep me'));
});
it('generates suggestions without applying them', async () => {
  const suggestion = { id: 's', title: 'Suggested task', type: 'issue', targetId: 'target-123', model: plan.model };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json([])).mockResolvedValueOnce(json(suggestion)));
  render(<CaptureSuggestions captureId="c" token="owner" />);
  await waitFor(() => expect((screen.getByText('정리 제안 받기') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('정리 제안 받기'));
  await screen.findByText('Suggested task');
  expect(screen.getByText(/아직 승인되지/)).toBeTruthy();
});
it.each(['load', 'generate'])('reports suggestion %s errors', async phase => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(phase === 'load' ? {} : [], phase === 'load' ? 500 : 200)).mockResolvedValue(json({ error: 'AI unavailable' }, 503)));
  render(<CaptureSuggestions captureId="c" token="" />);
  if (phase === 'generate') { await waitFor(() => expect((screen.getByText('정리 제안 받기') as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(screen.getByText('정리 제안 받기')); }
  await screen.findByRole('alert');
});
it.each(['accept', 'dismiss'])('generates and %s a delivery plan', async action => {
  const acceptance = { documentId: 'd', goalId: 'g', epicId: 'e', issueIds: ['i'] };
  const onActivity = vi.fn();
  const fetcher = vi.fn().mockResolvedValueOnce(json([])).mockResolvedValueOnce(json(plan)).mockResolvedValueOnce(json(action === 'accept' ? acceptance : { ...plan, status: 'dismissed' }));
  vi.stubGlobal('fetch', fetcher);
  render(<CaptureDeliveryPlan captureId="c" token="owner" onActivity={onActivity} />);
  await waitFor(() => expect((screen.getByText('납품 계획 생성') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('납품 계획 생성'));
  await screen.findByText('Build search');
  expect(screen.getByText('검토 대기')).toBeTruthy();
  fireEvent.click(screen.getByText(action === 'accept' ? '계획 승인' : '거절'));
  await screen.findByText(action === 'accept' ? '승인됨' : '거절됨');
  expect(fetcher.mock.calls[2][0]).toBe(`/api/delivery-plan-proposals/p/${action}`);
  expect(onActivity).toHaveBeenCalledTimes(2);
  if (action === 'accept') expect(screen.getByText('설계 문서').getAttribute('href')).toBe('#document-d');
});
it.each(['load', 'generate', 'accept', 'dismiss'])('reports plan %s failure', async phase => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(phase === 'load' ? {} : phase === 'generate' ? [] : [plan], phase === 'load' ? 500 : 200)).mockResolvedValue(json({}, 500)));
  render(<CaptureDeliveryPlan captureId="c" token="" />);
  if (phase !== 'load') {
    const label = phase === 'generate' ? '납품 계획 생성' : phase === 'accept' ? '계획 승인' : '거절';
    await waitFor(() => expect((screen.getByText(label) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText(label));
  }
  await screen.findByRole('alert');
});
it.each(['scheduledAt', 'dueAt'] as const)('creates a calendar task using %s and trimmed fields', async field => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  const fetcher = vi.fn().mockResolvedValue(json({})); const saved = vi.fn(), closed = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const { container } = render(<CalendarCreate at={field === 'dueAt' ? '2026-10-26' : '2026-10-26T10:00:00+09:00'} field={field} headers={{}} onSaved={saved} onClose={closed} />);
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: ' Task ' } });
  fireEvent.change(screen.getByLabelText('영역'), { target: { value: ' Work ' } });
  if (field === 'dueAt') fireEvent.change(screen.getByLabelText('묶음 (선택)'), { target: { value: ' Epic ' } });
  fireEvent.click(screen.getByText('추가'));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ title: 'Task', area: 'Work', ...(field === 'dueAt' ? { epic: 'Epic' } : {}), [field]: field === 'dueAt' ? '2026-10-26' : '2026-10-26T10:00:00+09:00' });
  fireEvent(container.querySelector('dialog')!, new Event('cancel', { cancelable: true }));
  fireEvent.click(screen.getByText('취소'));
  expect(closed).toHaveBeenCalledTimes(2);
});
it('retains calendar form input after save failure', async () => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 500)));
  render(<CalendarCreate at="2026-10-26" headers={{}} onSaved={vi.fn()} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: 'Task' } });
  fireEvent.click(screen.getByText('추가'));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('제목') as HTMLInputElement).value).toBe('Task');
});
it('edits HTML and previews it inside a scriptless sandbox', () => {
  const change = vi.fn(); const { rerender } = render(<HtmlDocument body="" onChange={change} />);
  fireEvent.click(screen.getByText('HTML 작성하기'));
  fireEvent.change(screen.getByLabelText('HTML 소스'), { target: { value: '<h1>Hello</h1><script>alert(1)</script>' } });
  expect(change).toHaveBeenCalledWith('<h1>Hello</h1><script>alert(1)</script>');
  rerender(<HtmlDocument body="<h1>Hello</h1>" onChange={change} />);
  fireEvent.click(screen.getByText('읽기'));
  const frame = screen.getByTitle('HTML 문서 읽기');
  expect(frame.getAttribute('sandbox')).toBe('');
  expect(frame.getAttribute('srcdoc')).toContain('<h1>Hello</h1>');
  fireEvent.click(screen.getByLabelText('HTML 소스 편집'));
  expect(screen.getByLabelText('HTML 소스')).toBeTruthy();
});
