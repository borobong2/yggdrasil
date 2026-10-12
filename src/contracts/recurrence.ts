import type { Recurrence, Weekday } from './items.js';

export const weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const weekdayLabels: Record<Weekday, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };

/** Short Korean rule label shared by cards, the detail panel and MCP resources, e.g. '매주 월·수 10:00'. */
export function recurrenceLabel(rule: Omit<Recurrence, 'id'>): string {
  const days = rule.freq === 'daily' ? '매일' : rule.freq === 'weekly' ? `매주 ${weekdays.filter((day) => rule.weekdays?.includes(day)).map((day) => weekdayLabels[day]).join('·')}` : `매월 ${rule.monthDay}일`;
  return [days, rule.time, rule.paused && '(일시정지)'].filter(Boolean).join(' ');
}
