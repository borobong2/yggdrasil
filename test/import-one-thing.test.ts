import { describe, expect, it } from 'vitest';
import { parseEstimate, parseOneThing } from '../scripts/one-thing/parse.js';

const blocks = `# 커리어 할일

### 🔴 [P1] Block next
- **마감**: 2026-10-16
- **예상시간**: 1h 30m
- **상태**: next
- **생성일**: 2026-10-11
- **메모**: see \`docs/a.md\`

---

### 🟡 [P2] Block blocked
- **예상시간**: 범위 선정 30m
- **상태**: blocked
- **마감**: 2026-10-25 (기초), 이후 실전

### ⚪ [P4] Block inbox
- **상태**: inbox

### 🔴 [P1] Block done
- **상태**: completed

---

## 현재 우선 작업

- [ ] Plain item without metadata (1.5h).
- [x] Finished plain item
`;

const lines = `# 개인 할일

- [ ] 🟡 P2 · \`next\` · **Bold title** (마감 2026-10-16 23:59, 생성 2026-10-10). free text → \`~/path\`
- [ ] 🟢 P3 · \`waiting\` · Unbolded title (생성 2026-10-10, 기한 미정; 대기: 사용자 음성 제공). more
- [ ] 🟡 P2 · \`scheduled\` · **미용실** (예정 2026-10-11 일, 생성 2026-10-10)
- [ ] 🟡 P2 · \`scheduled\` · 투표 (① a / ② b) (2026-10-17)
- [ ] 🟡 P2 · \`scheduled\` · **스터디** — 매주 월 10시 (생성 2026-10-10)
- [ ] 🟡 P2 · \`next\` · 사본 저장 (예상 10m, 생성 2026-10-10)
- [ ] 🟡 P2 · \`waiting\` · **과제** (대기: 공지) (마감 2026-10월 말 · 생성 2026-10-10)
- [ ] ⚪ P4 · \`done\` · **Done via status**
- [x] 🟢 P3 · \`next\` · **Checked**
`;

describe('one-thing parser', () => {
  it('parses ### blocks, keeps unconsumed fields in notes and skips done', () => {
    const { todos, skipped, warnings } = parseOneThing(blocks, 'one-thing/todos/career.md');
    expect(todos.map((t) => t.title)).toEqual(['Block next', 'Block blocked', 'Block inbox', 'Plain item without metadata']);
    expect(todos[0]).toMatchObject({ area: '커리어', epic: '일반', status: 'todo', hold: null, priority: 'p1', dueAt: '2026-10-16', estimateMinutes: 90, source: 'one-thing/todos/career.md', notes: '생성일: 2026-10-11\n메모: see `docs/a.md`' });
    expect(todos[1]).toMatchObject({ status: 'todo', hold: 'blocked', priority: 'p2', dueAt: '2026-10-25', estimateMinutes: null });
    expect(todos[1]!.notes).toContain('예상시간: 범위 선정 30m');
    expect(todos[1]!.notes).toContain('마감: 2026-10-25 (기초), 이후 실전');
    expect(todos[2]).toMatchObject({ status: 'backlog', priority: 'p4' });
    expect(todos[3]).toMatchObject({ status: 'todo', hold: null, priority: 'p3', notes: '(1.5h).' });
    expect(skipped.map((s) => s.reason)).toEqual(['status completed', 'done [x]']);
    expect(warnings).toHaveLength(1);
  });

  it('parses checkbox lines with bold and unbolded titles, holds, dates and estimates', () => {
    const { todos, skipped, warnings } = parseOneThing(lines, 'one-thing/todos/personal.md');
    expect(todos.map((t) => [t.title, t.hold, t.dueAt, t.scheduledAt])).toEqual([
      ['Bold title', null, '2026-10-16', null],
      ['Unbolded title', 'waiting', null, null],
      ['미용실', 'scheduled', null, '2026-10-11'],
      ['투표', 'scheduled', null, '2026-10-17'],
      ['스터디', 'scheduled', null, null],
      ['사본 저장', null, null, null],
      ['과제', 'waiting', null, null]
    ]);
    expect(todos[0]).toMatchObject({ area: '개인', priority: 'p2', status: 'todo' });
    expect(todos[0]!.notes).toContain('free text → `~/path`');
    expect(todos[1]).toMatchObject({ holdReason: '사용자 음성 제공', priority: 'p3' });
    expect(todos[5]!.estimateMinutes).toBe(10);
    expect(todos[6]!.holdReason).toBe('공지');
    expect(skipped).toHaveLength(2);
    expect(warnings.map((w) => w.reason)).toEqual(['scheduled without date (recurring?)', '마감 without full date']);
  });

  it('parses estimates conservatively and rejects unknown files', () => {
    expect([parseEstimate('1h'), parseEstimate('45m'), parseEstimate('4h 30m'), parseEstimate('1.5h'), parseEstimate('-'), parseEstimate('약 12h')]).toEqual([60, 45, 270, 90, null, null]);
    expect(parseOneThing('- [ ] x', 'one-thing/todos/unknown.md')).toMatchObject({ todos: [], warnings: [{ reason: 'unknown area file' }] });
  });
});
