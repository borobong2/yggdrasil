import { useEffect, useRef, useState, type FormEvent } from 'react';

export function CalendarCreate({ at, field = 'scheduledAt', headers, onClose, onSaved }: {
  at: string; field?: 'dueAt' | 'scheduledAt'; headers: Record<string, string>; onClose: () => void; onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [area, setArea] = useState('개인');
  const [epic, setEpic] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/todos', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ title: title.trim(), area: area.trim(), ...(epic.trim() ? { epic: epic.trim() } : {}), [field]: at }) });
      if (!response.ok) throw new Error();
      onSaved();
    } catch { setError('할 일을 추가하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby="calendar-create-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} className="card m-auto w-[calc(100%-2rem)] max-w-sm p-4 text-ink shadow-pop">
    <form onSubmit={save} className="space-y-3">
      <h2 id="calendar-create-title" className="font-semibold">할 일 추가</h2>
      <p className="text-sm text-muted">{at.slice(0, 10)} · {at.includes('T') ? at.slice(11, 16) : '종일'} · {field === 'dueAt' ? '실제 마감일' : '작업 예정일'}</p>
      <label className="block text-sm">제목<input autoFocus required maxLength={200} className="field mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="block text-sm">영역<input required maxLength={200} className="field mt-1 w-full" value={area} onChange={(e) => setArea(e.target.value)} /></label>
      <label className="block text-sm">묶음 (선택)<input maxLength={200} className="field mt-1 w-full" value={epic} onChange={(e) => setEpic(e.target.value)} placeholder="일반" /></label>
      {error && <p role="alert" className="alert">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="btn" disabled={busy} onClick={onClose}>취소</button><button className="btn btn-primary" disabled={busy || !title.trim() || !area.trim()}>{busy ? '추가 중…' : '추가'}</button></div>
    </form>
  </dialog>;
}
