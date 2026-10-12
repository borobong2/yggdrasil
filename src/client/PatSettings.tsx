import { FormEvent, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { formatDateTime } from './format.js';
import type { IssuedPersonalAccessToken, PersonalAccessToken } from '../contracts/items.js';

export function PatSettings({ token }: { token: string }) {
  const [tokens, setTokens] = useState<PersonalAccessToken[]>([]);
  const [label, setLabel] = useState('MCP');
  const [issued, setIssued] = useState<IssuedPersonalAccessToken | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/pats', { headers });
      if (!response.ok) throw new Error((await response.json()).error || '토큰을 불러오지 못했습니다.');
      setTokens(await response.json());
    } catch (error) { setError(error instanceof Error ? error.message : '토큰을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [token]);

  async function issue(event: FormEvent) {
    event.preventDefault(); setError(''); setIssued(null);
    try {
      const response = await fetch('/api/pats', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ label }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '토큰을 발급하지 못했습니다.');
      const { token: plaintext, ...pat } = result as IssuedPersonalAccessToken;
      setIssued({ ...pat, token: plaintext }); setTokens((current) => [pat, ...current]);
    } catch (error) { setError(error instanceof Error ? error.message : '토큰을 발급하지 못했습니다.'); }
  }

  async function revoke(id: string) {
    setError('');
    try {
      const response = await fetch(`/api/pats/${id}/revoke`, { method: 'POST', headers });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '토큰을 폐기하지 못했습니다.');
      setTokens((current) => current.map((item) => item.id === id ? result : item));
    } catch (error) { setError(error instanceof Error ? error.message : '토큰을 폐기하지 못했습니다.'); }
  }

  return <section aria-label="Personal access tokens" className="card p-4">
    <h2 className="text-lg font-semibold">개인 액세스 토큰</h2>
    <p className="text-sm text-muted">MCP 클라이언트가 이 워크스페이스에 접근할 때 사용합니다.</p>
    <form onSubmit={issue} className="mt-3 flex items-end gap-2">
      <div className="min-w-0 flex-1"><label htmlFor="pat-label" className="label">이름</label>
        <input id="pat-label" className="field" value={label} onChange={(event) => setLabel(event.target.value)} required maxLength={100} /></div>
      <button className="btn btn-primary h-8"><KeyRound />토큰 발급</button>
    </form>
    {issued && <div role="status" className="mt-3 rounded-md border border-accent/30 bg-accent-soft p-3 text-sm text-accent-ink">
      지금 복사하세요. 이 토큰은 다시 표시되지 않습니다.
      <code className="mt-2 block break-all rounded bg-surface px-2 py-1.5 font-mono text-xs text-ink">{issued.token}</code>
    </div>}
    {error && <p role="alert" className="alert mt-3">{error}</p>}
    {loading ? <p role="status" className="mt-3 text-sm text-faint">토큰을 불러오는 중…</p> : tokens.length === 0 ? <p className="mt-3 text-sm text-faint">발급된 토큰이 없습니다.</p>
      : <ul className="mt-3 divide-y divide-line rounded-md border border-line">{tokens.map((item) => <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
        <span className={`min-w-0 flex-1 truncate font-medium ${item.revokedAt ? 'text-faint line-through' : ''}`}>{item.label}</span>
        <span className="hidden text-xs text-faint sm:inline">{formatDateTime(item.createdAt)} 발급{item.lastUsedAt && ` · ${formatDateTime(item.lastUsedAt)} 사용`}</span>
        {item.revokedAt ? <span className="badge">폐기됨 {formatDateTime(item.revokedAt)}</span> : <button type="button" className="btn btn-ghost btn-danger h-7 px-2" onClick={() => void revoke(item.id)}>폐기</button>}
      </li>)}</ul>}
  </section>;
}
