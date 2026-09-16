import { useEffect, useState } from 'react';
import type { DeliveryPlanProposal } from '../contracts/items.js';

export function CaptureDeliveryPlan({ captureId, token }: { captureId: string; token: string }) {
  const [plans, setPlans] = useState<DeliveryPlanProposal[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const path = `/api/captures/${captureId}/delivery-plan`;
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    const controller = new AbortController();
    fetch(path, { signal: controller.signal, headers }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load delivery plans.');
      setPlans(await response.json());
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
      const response = await fetch(path, { method: 'POST', headers });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not generate a delivery plan.');
      setPlans((previous) => [result, ...previous]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not generate a delivery plan.');
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="AI delivery plans">
    <button type="button" onClick={generate} disabled={busy || loading}>{busy ? 'Generating…' : 'Generate delivery plan'}</button>
    {error && <p role="alert">{error}</p>}
    {plans.map((plan) => <article key={plan.id}>
      <h3>{plan.design.title}</h3>
      <p>{plan.design.body}</p>
      {(['fe', 'be', 'docs'] as const).map((lane) => <section key={lane} aria-label={`${lane.toUpperCase()} lane`}>
        <h4>{lane.toUpperCase()}</h4>
        <ul>{plan.lanes[lane].map((item) => <li key={item}>{item}</li>)}</ul>
      </section>)}
      <p>Pending review — no documents or work items have been created.</p>
      <small>{plan.model.provider} · {plan.model.name}</small>
    </article>)}
  </section>;
}
