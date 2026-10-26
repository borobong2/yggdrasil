import type { Todo, LateTodo } from '../src/contracts/items';
export const todo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 't', title: 'Write tests', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', epicId: 'e', status: 'todo', position: 0, priority: 'p2', dueAt: null, dueAllDay: false, scheduledAt: null, scheduledAllDay: false, targetAt: null, targetAllDay: false, hold: null, holdReason: null, notes: '', estimateMinutes: null, actualMinutes: null, source: null, key: null, completedAt: null, archivedAt: null, links: [], area: 'Work', epic: 'App', ...overrides
});
export const lateTodo = (overrides: Partial<LateTodo> = {}): LateTodo => ({ ...todo(), lateDays: 5, untouchedDays: 65, age: 5, bucket: 'month', dueAt: '2026-10-01T00:00:00Z', ...overrides });
