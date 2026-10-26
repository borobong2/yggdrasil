import type { Issue } from '../contracts/items.js';
import { formatDue, seoulDay } from '../contracts/dates.js';

type Dates = Pick<Issue, 'scheduledAt' | 'scheduledAllDay' | 'targetAt' | 'targetAllDay' | 'dueAt' | 'dueAllDay'>;

/** Show every supplied date role; an internal target is never an external overdue deadline. */
export function TodoDates({ todo }: { todo: Dates }) {
  const dates = [
    { role: '시작/예정', at: todo.scheduledAt, allDay: todo.scheduledAllDay },
    { role: '내부 완료 목표', at: todo.targetAt, allDay: todo.targetAllDay },
    { role: '실제 마감', at: todo.dueAt, allDay: todo.dueAllDay }
  ].filter(date => date.at);
  if (!dates.length) return null;
  const now = new Date();
  return <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs font-normal tabular-nums" aria-label="일정 날짜">
    {dates.map(({ role, at, allDay }) => {
      const past = allDay ? seoulDay(at!) < seoulDay(now) : Date.parse(at!) < now.getTime();
      const overdue = role === '실제 마감' && past;
      return <span key={role} data-overdue={overdue || undefined} className={overdue ? 'text-danger' : 'text-muted'}>
        {role} {formatDue(at!, allDay)}{past && role === '내부 완료 목표' ? ' · 목표 지남' : ''}
      </span>;
    })}
  </span>;
}
