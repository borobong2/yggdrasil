import { ChevronRight, Flag, Layers } from 'lucide-react';
import type { Issue, IssueStatus, PlanningEpic, PlanningGoal } from '../contracts/items.js';
import { DueBadge, HoldBadge, PriorityBadge, ProgressBar, statusLabels } from './format.js';

type PlanningItem = PlanningGoal | PlanningEpic | Issue;
type Props = { goals: PlanningGoal[]; selectedId?: string; onSelect: (item: PlanningItem) => void; onStatusChange: (id: string, status: IssueStatus) => void };
const row = 'flex w-full min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-sunken aria-[current=true]:bg-accent-soft';

export function PlanningTree({ goals, selectedId, onSelect, onStatusChange }: Props) {
  return <ul className="space-y-3">{goals.map((goal) => <li key={goal.id} id={`goal-${goal.id}`} className="card p-2">
    <div className="flex items-center gap-2">
      <button type="button" aria-current={goal.id === selectedId || undefined} className={`${row} h-9 font-semibold`} onClick={() => onSelect(goal)}>
        <Flag className="size-4 shrink-0 text-accent" /><span className="truncate">{goal.title}</span>
      </button>
      <span className="shrink-0 pr-2"><ProgressBar {...goal.progress} /></span>
    </div>
    {goal.epics.length > 0 && <ul className="ml-4 mt-1 space-y-1 border-l border-line pl-2">{goal.epics.map((epic) => <li key={epic.id} id={`epic-${epic.id}`}>
      <div className="flex items-center gap-2">
        <button type="button" aria-current={epic.id === selectedId || undefined} className={`${row} h-8 text-sm font-medium`} onClick={() => onSelect(epic)}>
          <Layers className="size-3.5 shrink-0 text-muted" /><span className="truncate">{epic.title}</span>
        </button>
        <span className="shrink-0 pr-2"><ProgressBar {...epic.progress} /></span>
      </div>
      {epic.issues.length > 0 && <ul className="ml-4 border-l border-line pl-2">{epic.issues.map((issue) => <li key={issue.id} id={`issue-${issue.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 sm:flex-nowrap">
        <button type="button" aria-current={issue.id === selectedId || undefined} className={`${row} h-8 flex-1 basis-40 text-sm ${issue.status === 'done' ? 'text-faint line-through' : ''}`} onClick={() => onSelect(issue)}>
          <ChevronRight className="size-3 shrink-0 text-faint" /><span className="truncate">{issue.title}</span>
        </button>
        <span className="flex shrink-0 items-center gap-1 pl-7 sm:pl-0">
          <PriorityBadge priority={issue.priority} />
          {issue.hold && <HoldBadge hold={issue.hold} reason={issue.holdReason} />}
          <DueBadge issue={issue} />
          <select aria-label={`${issue.title} status`} className="field h-7 w-auto text-xs" value={issue.status} onChange={(event) => onStatusChange(issue.id, event.target.value as IssueStatus)}>
            {(Object.keys(statusLabels) as IssueStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </span>
      </li>)}</ul>}
    </li>)}</ul>}
  </li>)}</ul>;
}
