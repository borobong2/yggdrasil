import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { CoreType, Suggestion } from '../contracts/items.js';

const typeLabels: Record<CoreType, string> = { inbox: '인박스', document: '문서', project: '프로젝트', issue: '이슈' };

export function CaptureSuggestions({ captureId, token }: { captureId: string; token: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const path = `/api/captures/${captureId}/suggestions`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(path, { signal: controller.signal, headers: token ? { authorization: `Bearer ${token}` } : {} }).then(async (response) => {
      if (!response.ok) throw new Error('제안을 불러오지 못했습니다.');
      setSuggestions(await response.json());
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setError(error.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [path, token]);

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(path, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '제안을 생성하지 못했습니다.');
      setSuggestions((previous) => [result, ...previous]);
    } catch (error) {
      setError(error instanceof Error ? error.message : '제안을 생성하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="AI suggestions" className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="eyebrow">AI 정리 제안</h3>
      <button type="button" className="btn" onClick={generate} disabled={busy || loading}><Sparkles />{busy ? '생성 중…' : '정리 제안 받기'}</button>
    </div>
    {error && <p role="alert" className="alert">{error}</p>}
    <ul aria-live="polite" className="space-y-2">{suggestions.map((suggestion) => <li key={suggestion.id} className="rounded-md border border-dashed border-line-strong bg-sunken/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="min-w-0 break-words font-medium">{suggestion.title}</strong>
        <span className="badge">{typeLabels[suggestion.type]}</span>
        {suggestion.targetId && <span className="text-xs text-faint">대상 {suggestion.targetId.slice(0, 8)}</span>}
      </div>
      <p className="mt-1 text-xs text-muted">대기 중 — 아직 승인되지 않았습니다. 변경된 항목이 없습니다.</p>
      <small className="text-2xs text-faint">{suggestion.model.provider} · {suggestion.model.name}</small>
    </li>)}</ul>
  </section>;
}
