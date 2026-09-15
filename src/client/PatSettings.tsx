import { FormEvent, useEffect, useState } from 'react';
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
      if (!response.ok) throw new Error((await response.json()).error || 'Could not load tokens.');
      setTokens(await response.json());
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not load tokens.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [token]);

  async function issue(event: FormEvent) {
    event.preventDefault(); setError(''); setIssued(null);
    try {
      const response = await fetch('/api/pats', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ label }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not issue token.');
      setIssued(result); setTokens((current) => [result, ...current]);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not issue token.'); }
  }

  async function revoke(id: string) {
    setError('');
    try {
      const response = await fetch(`/api/pats/${id}/revoke`, { method: 'POST', headers });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not revoke token.');
      setTokens((current) => current.map((item) => item.id === id ? result : item));
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not revoke token.'); }
  }

  return <section aria-label="Personal access tokens">
    <h2>Personal access tokens</h2>
    <form onSubmit={issue}>
      <label htmlFor="pat-label">Label</label>
      <input id="pat-label" value={label} onChange={(event) => setLabel(event.target.value)} required maxLength={100} />
      <button>Issue token</button>
    </form>
    {issued && <p role="status">Copy this token now. It will not be shown again: <code>{issued.token}</code></p>}
    {error && <p role="alert">{error}</p>}
    {loading ? <p>Loading tokens…</p> : tokens.length === 0 ? <p>No personal access tokens.</p> : <ul>{tokens.map((item) => <li key={item.id}>{item.label} — {item.revokedAt ? `Revoked ${item.revokedAt}` : <button type="button" onClick={() => void revoke(item.id)}>Revoke</button>}</li>)}</ul>}
  </section>;
}
