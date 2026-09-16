import { FormEvent, useEffect, useState } from 'react';
import type { Issue, PlanningEpic, PlanningGoal } from '../contracts/items.js';
import { PlanningTree } from './PlanningTree.js';

export function PlanningView({ token }: { token: string }) {
  const [goals, setGoals] = useState<PlanningGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PlanningGoal | PlanningEpic | Issue>();
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};

  async function load(current = () => true) {
    if (current()) { setLoading(true); setError(''); }
    try {
      const response = await fetch('/api/planning/tree', { headers });
      if (response.ok) { const tree = await response.json(); if (current()) setGoals(tree); }
      else if (current()) setError('Planning could not be loaded.');
    } catch { if (current()) setError('Planning could not be loaded.'); }
    if (current()) setLoading(false);
  }

  useEffect(() => { let current = true; void load(() => current); return () => { current = false; }; }, [token]);

  const [kind, setKind] = useState<'goal' | 'epic' | 'issue'>('goal');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title'));
    const parentId = String(form.get('parentId'));
    const path = kind === 'goal' ? '/api/goals' : kind === 'epic' ? '/api/epics' : '/api/issues';
    const body = kind === 'goal' ? { title } : kind === 'epic' ? { title, goalId: parentId } : { title, epicId: parentId };
    const response = await fetch(path, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) { setError('Planning item could not be created.'); return; }
    event.currentTarget.reset();
    await load();
  }

  async function updateStatus(id: string, status: 'backlog' | 'todo' | 'doing' | 'done') {
    try {
      const response = await fetch(`/api/issues/${id}`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!response.ok) { setError('Issue status could not be updated.'); return; }
      await load();
    } catch { setError('Issue status could not be updated.'); }
  }

  const epics = goals.flatMap((goal) => goal.epics);
  return <section>
    <h2>Planning</h2>
    <form onSubmit={create}>
      <label>Type <select name="kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="goal">Goal</option><option value="epic">Epic</option><option value="issue">Issue</option></select></label>
      <label>Title <input name="title" required maxLength={200} /></label>
      {kind !== 'goal' && <label>Parent <select name="parentId" required><option value="">Select parent</option>{kind === 'epic' ? goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>) : epics.map((epic) => <option key={epic.id} value={epic.id}>{epic.title}</option>)}</select></label>}
      <button>Create</button>
    </form>
    {loading ? <p>Loading planning…</p> : error ? <p role="alert">{error}</p> : goals.length ? <PlanningTree goals={goals} onSelect={setSelected} onStatusChange={updateStatus} /> : <p>No planning items yet.</p>}
    {selected && <p>Selected: {selected.title}{'progress' in selected && ` — ${selected.progress.done}/${selected.progress.total}`}{'status' in selected && ` — ${selected.status}, ${selected.priority}${selected.dueAt ? `, due ${selected.dueAt}` : ''}`}</p>}
  </section>;
}
