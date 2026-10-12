import { FormEvent, useEffect, useState } from 'react';
import type { Capture } from '../contracts/items.js';
import { CaptureSuggestions } from './CaptureSuggestions.js';
import { CaptureDeliveryPlan } from './CaptureDeliveryPlan.js';
import { formatDateTime } from './format.js';

export function InboxView({ token, onActivity }: { token: string; onActivity: () => void }) {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [text, setText] = useState('');
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  async function load() {
    const response = await fetch('/api/captures', { headers });
    if (response.ok) setCaptures(await response.json());
  }

  useEffect(() => void load(), [token]);

  async function capture(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/captures', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!response.ok) return;
    setText('');
    await load();
  }

  return <div className="mx-auto max-w-3xl space-y-5">
    <form onSubmit={capture} className="card p-3">
      <label htmlFor="capture" className="sr-only">생각 캡처</label>
      <textarea id="capture" className="field min-h-20 border-0 px-1 shadow-none focus:shadow-none" placeholder="떠오른 생각, 요구사항, 메모를 적어 두세요"
        value={text} onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit(); }} required />
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="text-xs text-faint">모든 캡처는 원문 그대로 보존됩니다 · ⌘↵</span>
        <button className="btn btn-primary">캡처</button>
      </div>
    </form>

    <section aria-label="캡처 목록" className="space-y-3">
      <h2 className="eyebrow">캡처 {captures.length}</h2>
      {captures.length === 0 ? <p className="card empty">아직 캡처가 없습니다.</p> : <ul className="space-y-3">
        {captures.map((capture) => <li id={`capture-${capture.id}`} key={capture.id} className="card scroll-mt-16 p-4">
          <p className="whitespace-pre-wrap break-words text-base">{capture.text}</p>
          <time dateTime={capture.createdAt} className="mt-1 block text-xs text-faint">{formatDateTime(capture.createdAt)}</time>
          <div className="mt-3 space-y-3 border-t border-line pt-3">
            <CaptureSuggestions captureId={capture.id} token={token} />
            <CaptureDeliveryPlan captureId={capture.id} token={token} onActivity={onActivity} />
          </div>
        </li>)}
      </ul>}
    </section>
  </div>;
}
