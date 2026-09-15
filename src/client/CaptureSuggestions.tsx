import { useEffect, useState } from 'react';
import type { Suggestion } from '../contracts/items.js';

export function CaptureSuggestions({ captureId, token }: { captureId: string; token: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const path = `/api/captures/${captureId}/suggestions`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(path, { signal: controller.signal, headers: token ? { authorization: `Bearer ${token}` } : {} }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load suggestions.');
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
      if (!response.ok) throw new Error(result.error || 'Could not generate a suggestion.');
      setSuggestions((previous) => [result, ...previous]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not generate a suggestion.');
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="AI suggestions">
    <button type="button" onClick={generate} disabled={busy || loading}>{busy ? 'Generating…' : 'Suggest organization'}</button>
    {error && <p role="alert">{error}</p>}
    <ul aria-live="polite">{suggestions.map((suggestion) => <li key={suggestion.id}>
      <strong>{suggestion.title}</strong> — {suggestion.type}
      {suggestion.targetId && <span> · Target: {suggestion.targetId}</span>}
      <p>Pending — unaccepted. No items have been changed.</p>
      <small>{suggestion.model.provider} · {suggestion.model.name}</small>
    </li>)}</ul>
  </section>;
}
