import type { Issue, IssueStatus, PlanningEpic, PlanningGoal } from '../contracts/items.js';

type PlanningItem = PlanningGoal | PlanningEpic | Issue;

export function PlanningTree({ goals, onSelect, onStatusChange }: { goals: PlanningGoal[]; onSelect: (item: PlanningItem) => void; onStatusChange: (id: string, status: IssueStatus) => void }) {
  return <ul>{goals.map((goal) => <li key={goal.id}>
    <button type="button" onClick={() => onSelect(goal)}>{goal.title} — {label(goal.progress)}</button>
    <ul>{goal.epics.map((epic) => <li key={epic.id}>
      <button type="button" onClick={() => onSelect(epic)}>{epic.title} — {label(epic.progress)}</button>
      <ul>{epic.issues.map((issue) => <li key={issue.id}><button type="button" onClick={() => onSelect(issue)}>{issue.title}</button> <select aria-label={`${issue.title} status`} value={issue.status} onChange={(event) => onStatusChange(issue.id, event.target.value as IssueStatus)}><option value="backlog">backlog</option><option value="todo">todo</option><option value="doing">doing</option><option value="done">done</option></select></li>)}</ul>
    </li>)}</ul>
  </li>)}</ul>;
}

function label({ done, total }: { done: number; total: number }) { return `${done}/${total}`; }
