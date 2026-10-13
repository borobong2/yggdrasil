import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Todo } from '../contracts/items.js';
import type { WeekReview } from '../contracts/review.js';
import { formatDay } from '../contracts/dates.js';
import { weekReview } from './review.js';

// YG-43: read-only markdown summary of this week's review (same data as GET /api/review/week).
export function registerReviewResources(server: McpServer, ownerId: string): void {
  server.registerResource('todo-review-week', 'todo://review/week', { title: '이번 주 회고', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: reviewMarkdown(await weekReview(ownerId)) }] }));
}

const minutes = (value: number | null) => value ? `${value}분` : '—';
const name = (todo: Todo) => `${todo.key ? `${todo.key}: ` : ''}${todo.title}`;
const items = (todos: Todo[], line: (todo: Todo) => string) => todos.length ? todos.map(line).join('\n') : '_없음_';

export function reviewMarkdown(review: WeekReview): string {
  const { minutes: m, activity: a } = review;
  return [
    `# 주간 회고 ${review.week} (${review.start} ~ ${review.end})`,
    `## 이번 주 완료 ${review.completed.length}건`,
    review.byArea.length ? review.byArea.map((row) => `${row.area} ${row.count}`).join(' · ') : '',
    items(review.completed, (todo) => `- ${name(todo)} — ${todo.area}/${todo.epic} · 예상 ${minutes(todo.estimateMinutes)} · 실제 ${minutes(todo.actualMinutes)} (id: ${todo.id})`),
    '## 예상 vs 실제',
    m.compared ? `${m.compared}건 비교: 예상 ${m.estimated}분 → 실제 ${m.actual}분 (${m.ratio}배)` : '_예상·실제 시간이 모두 있는 완료 항목이 없음_',
    `## 못 끝낸 것 ${review.unfinished.length}건`,
    items(review.unfinished, (todo) => `- ${name(todo)} — 마감 ${formatDay(todo.dueAt!, todo.dueAllDay)} · ${todo.status} (id: ${todo.id})`),
    `## 새로 기한 지남 ${review.overdue.length}건`,
    items(review.overdue, (todo) => `- ${name(todo)} — 마감 ${formatDay(todo.dueAt!, todo.dueAllDay)} (id: ${todo.id})`),
    `## 방치 ${review.stale}건 (현재 기준, todo://stale)`,
    '## 활동',
    `생성 ${a.created} · 완료 ${a.completed} · 이동 ${a.moved} — ui ${a.via.ui} · mcp ${a.via.mcp} · github ${a.via.github} · import ${a.via.import}`,
    review.documentId ? `회고 메모 문서: ${review.documentId}` : ''
  ].filter(Boolean).join('\n\n') + '\n';
}
