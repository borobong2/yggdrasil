import { useEffect, useState } from 'react';
import { Check, Route } from 'lucide-react';
import type { DeliveryPlanProposal } from '../contracts/items.js';

const laneLabels = { fe: 'FE', be: 'BE', docs: '문서' } as const;

export function CaptureDeliveryPlan({ captureId, token, onActivity }: { captureId: string; token: string; onActivity?: () => void }) {
  const [plans, setPlans] = useState<DeliveryPlanProposal[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const path = `/api/captures/${captureId}/delivery-plan`;
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    const controller = new AbortController();
    fetch(path, { signal: controller.signal, headers }).then(async (response) => {
      if (!response.ok) throw new Error('납품 계획을 불러오지 못했습니다.');
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
      if (response.ok) onActivity?.();
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '납품 계획을 생성하지 못했습니다.');
      setPlans((previous) => [result, ...previous]);
    } catch (error) {
      setError(error instanceof Error ? error.message : '납품 계획을 생성하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function decide(plan: DeliveryPlanProposal, action: 'accept' | 'dismiss') {
    setActionId(plan.id);
    setError('');
    try {
      const response = await fetch(`/api/delivery-plan-proposals/${plan.id}/${action}`, { method: 'POST', headers });
      if (response.ok) onActivity?.();
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || action === 'accept' ? '계획을 승인하지 못했습니다.' : '계획을 거절하지 못했습니다.');
      setPlans((previous) => previous.map((item) => item.id === plan.id ? action === 'accept' ? { ...item, status: 'accepted', acceptance: result } : result : item));
    } catch (error) {
      setError(error instanceof Error ? error.message : action === 'accept' ? '계획을 승인하지 못했습니다.' : '계획을 거절하지 못했습니다.');
    } finally {
      setActionId(null);
    }
  }

  const statusBadge = { pending: ['검토 대기', 'bg-warn-soft text-warn'], accepted: ['승인됨', 'bg-accent-soft text-accent-ink'], dismissed: ['거절됨', ''] } as const;
  return <section aria-label="AI delivery plans" className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="eyebrow">납품 계획</h3>
      <button type="button" className="btn" onClick={generate} disabled={busy || loading}><Route />{busy ? '생성 중…' : '납품 계획 생성'}</button>
    </div>
    {error && <p role="alert" className="alert">{error}</p>}
    {plans.map((plan) => <article key={plan.id} className="rounded-md border border-line bg-sunken/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="min-w-0 break-words font-semibold">{plan.design.title}</h4>
        <span className={`badge ${statusBadge[plan.status][1]}`}>{statusBadge[plan.status][0]}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted">{plan.design.body}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(['fe', 'be', 'docs'] as const).map((lane) => <section key={lane} aria-label={`${lane.toUpperCase()} lane`} className="rounded-md border border-line bg-surface p-2">
          <h5 className="eyebrow">{laneLabels[lane]}</h5>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">{plan.lanes[lane].map((item) => <li key={item} className="break-words">{item}</li>)}</ul>
        </section>)}
      </div>
      {plan.status === 'pending' && <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-muted">검토 대기 — 아직 문서나 작업이 만들어지지 않았습니다.</p>
        <button type="button" className="btn btn-ghost" onClick={() => decide(plan, 'dismiss')} disabled={actionId !== null}>거절</button>
        <button type="button" className="btn btn-primary" onClick={() => decide(plan, 'accept')} disabled={actionId !== null}><Check />{actionId === plan.id ? '승인 중…' : '계획 승인'}</button>
      </div>}
      {plan.status === 'dismissed' && <p className="mt-3 text-xs text-muted">거절됨 — 문서나 작업이 만들어지지 않았습니다.</p>}
      {plan.status === 'accepted' && <div className="mt-3 text-xs text-muted">
        <p>승인됨 — 생성된 작업이 아래에 연결되어 있습니다.</p>
        {plan.acceptance && <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-medium text-accent-ink [&_a]:underline-offset-2 [&_a:hover]:underline">
          <a href={`#document-${plan.acceptance.documentId}`}>설계 문서</a><a href={`#goal-${plan.acceptance.goalId}`}>목표</a><a href={`#epic-${plan.acceptance.epicId}`}>에픽</a>
          {plan.acceptance.issueIds.map((id, index) => <a key={id} href={`#issue-${id}`}>이슈 {index + 1}</a>)}
        </p>}
      </div>}
      <p className="mt-2 flex items-center gap-2 text-2xs text-faint"><a href={`#capture-${captureId}`} className="hover:text-ink">원본 캡처</a> · <small>{plan.model.provider} · {plan.model.name}</small></p>
    </article>)}
  </section>;
}
