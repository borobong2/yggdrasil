import { CalendarClock, CircleAlert, Hourglass, Repeat } from 'lucide-react';
import type { Hold, Issue, IssueStatus, Priority, Recurrence } from '../contracts/items.js';
import { recurrenceLabel } from '../contracts/recurrence.js';
import { formatDue, isOverdue } from '../contracts/dates.js';

export const statusLabels: Record<IssueStatus, string> = { backlog: '백로그', todo: '할 일', doing: '진행 중', done: '완료' };
const holdLabels: Record<Hold, string> = { waiting: '대기', blocked: '막힘', scheduled: '예정' };
const holdIcons = { waiting: Hourglass, blocked: CircleAlert, scheduled: CalendarClock };
const holdTones: Record<Hold, string> = { waiting: 'bg-warn-soft text-warn', blocked: 'bg-danger-soft text-danger', scheduled: 'bg-info-soft text-info' };
const priorityTones: Record<Priority, string> = { p1: 'bg-danger text-white', p2: 'bg-warn-soft text-warn', p3: 'bg-info-soft text-info', p4: '' };

export const formatDateTime = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export { formatDue, isOverdue };

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge ${priorityTones[priority]}`} title={`우선순위 ${priority.toUpperCase()}`}>{priority.toUpperCase()}</span>;
}

export function HoldBadge({ hold, reason }: { hold: Hold; reason?: string | null }) {
  const Icon = holdIcons[hold];
  return <span className={`badge ${holdTones[hold]}`} title={reason ?? undefined}><Icon />{holdLabels[hold]}</span>;
}

// YG-38: all-day shows '10/13' and is overdue from the next day; timed shows '10/13 21:00' and is overdue once past.
export function DueBadge({ issue }: { issue: Pick<Issue, 'dueAt' | 'dueAllDay' | 'status'> }) {
  if (!issue.dueAt) return null;
  const overdue = isOverdue(issue);
  return <span className={`badge ${overdue ? 'bg-danger-soft text-danger' : ''}`} data-overdue={overdue || undefined}>
    {overdue ? '기한 지남 · ' : '마감 '}{formatDue(issue.dueAt, issue.dueAllDay)}
  </span>;
}

export function RecurrenceBadge({ recurrence }: { recurrence: Recurrence }) {
  return <span className={`badge ${recurrence.paused ? '' : 'bg-accent-soft text-accent-ink'}`} title={recurrenceLabel(recurrence)}><Repeat />{recurrence.paused ? '반복 정지' : '반복'}</span>;
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return <span className="flex items-center gap-2 text-xs tabular-nums text-muted">
    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`진행률 ${done}/${total}`}>
      <span className="block h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
    </span>
    {done}/{total}
  </span>;
}
