import { useEffect, useState } from 'react';
import type { Activity } from '../contracts/items.js';

const labels: Record<Activity['kind'], string> = {
  'issue.moved': 'Issue moved',
  'delivery-plan.created': 'Delivery plan created',
  'delivery-plan.accepted': 'Delivery plan accepted',
  'delivery-plan.dismissed': 'Delivery plan dismissed',
  'evidence.added': 'Evidence added',
};

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
        if (response.status === 401) throw new Error('Sign in to view activity.');
        if (!response.ok) throw new Error('Activity could not be loaded.');
        const items = await response.json() as Activity[];
        if (!controller.signal.aborted) setResult({ token, revision, refresh, items, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ token, revision, refresh, items: [], error: error instanceof Error ? error.message : 'Activity could not be loaded.' });
      }
    }
    void load();
    return () => controller.abort();
  }, [token, revision, refresh]);

  return <section aria-label="Activity timeline" aria-busy={!current}>
    <h2>Activity timeline</h2>
    <p>Latest 100 activities, newest first.</p>
    <button type="button" onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
    {!current ? <p role="status">Loading activity…</p> : current.error ? <p role="alert">{current.error}</p> : current.items.length === 0 ? <p>No activity yet.</p> : <ol>
      {current.items.map((activity) => <li key={activity.id}>
        <strong>{labels[activity.kind] ?? activity.kind}</strong> — <time dateTime={activity.createdAt}>{new Date(activity.createdAt).toLocaleString()}</time>
        <p>{activity.subjectType}: {activity.subjectId}</p>
        {activity.kind === 'issue.moved' && <p>{String(activity.payload.from ?? '')} → {String(activity.payload.to ?? '')}</p>}
        {activity.kind === 'evidence.added' && <p>{String(activity.payload.kind ?? '')}: {String(activity.payload.url ?? '')}</p>}
        {typeof activity.payload.captureId === 'string' && <p>Source capture: {activity.payload.captureId}</p>}
      </li>)}
    </ol>}
  </section>;
}
