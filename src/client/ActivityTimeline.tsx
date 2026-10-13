import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Activity } from '../contracts/items.js';
import { activityChanges, activityWhat, activityWho } from '../contracts/activity.js';
import { formatDateTime } from './format.js';

const subjects: Record<Activity['subjectType'], string> = { issue: '이슈', 'delivery-plan-proposal': '납품 계획', document: '문서' };
const tones: Partial<Record<Activity['kind'], string>> = { 'issue.completed': 'bg-accent', 'delivery-plan.accepted': 'bg-accent', 'delivery-plan.dismissed': 'bg-faint', 'evidence.added': 'bg-info' };

export function ActivityTimeline({ token, revision }: { token: string; revision: number }) {
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{
    token: string; revision: number; refresh: number; items: Activity[]; error: string;
  } | null>(null);
  const current = result?.token === token && result.revision === revision && result.refresh === refresh ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/activities', {
          headers: token ? { authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (response.status === 401) throw new Error('활동을 보려면 로그인하세요.');
        if (!response.ok) throw new Error('활동을 불러오지 못했습니다.');
        const items = await response.json() as Activity[];
        if (!controller.signal.aborted) setResult({ token, revision, refresh, items, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ token, revision, refresh, items: [], error: error instanceof Error ? error.message : '활동을 불러오지 못했습니다.' });
      }
    }
    void load();
    return () => controller.abort();
  }, [token, revision, refresh]);

  return <section aria-label="Activity timeline" aria-busy={!current} className="mx-auto max-w-3xl">
    <div className="mb-4 flex items-center justify-between gap-3">
      <p className="text-sm text-muted">최근 100개 활동, 최신순</p>
      <button type="button" className="btn" onClick={() => setRefresh((value) => value + 1)}><RefreshCw />새로고침</button>
    </div>
    {!current ? <p role="status" className="empty">활동을 불러오는 중…</p> : current.error ? <p role="alert" className="alert">{current.error}</p> : current.items.length === 0 ? <p className="card empty">아직 활동이 없습니다.</p> : <ol className="card divide-y divide-line">
      {current.items.map((activity) => <li key={activity.id} className="flex gap-3 px-4 py-3">
        <span className={`mt-2 size-2 shrink-0 rounded-full ${tones[activity.kind] ?? 'bg-line-strong'}`} />
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <strong className="font-medium">{activityWhat(activity)}</strong>
            <time dateTime={activity.createdAt} className="text-xs tabular-nums text-faint">{formatDateTime(activity.createdAt)}</time>
          </div>
          <p className="truncate text-xs text-faint">{subjects[activity.subjectType] ?? activity.subjectType} · <span className="font-mono">{activity.subjectId.slice(0, 8)}</span>
            {activityWho(activity) && <> · {activityWho(activity)}</>}</p>
          {activityChanges(activity).length > 0 && <p className="mt-1 text-muted">{activityChanges(activity).join(' · ')}</p>}
          {activity.kind === 'evidence.added' && <p className="mt-1 truncate text-muted">{String(activity.payload.kind ?? '')}: {String(activity.payload.url ?? '')}</p>}
          {typeof activity.payload.captureId === 'string' && <a href={`#capture-${activity.payload.captureId}`} className="mt-1 inline-block text-xs text-accent-ink hover:underline">원본 캡처 보기</a>}
        </div>
      </li>)}
    </ol>}
  </section>;
}
