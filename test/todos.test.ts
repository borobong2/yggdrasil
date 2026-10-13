import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { completeTodo, createTodo, todayView, updateTodo, type TodoInput } from '../src/server/todos.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());

const fresh = () => crypto.randomUUID();
async function activitiesOf(subjectId: string) {
  return (await pool.query('SELECT owner_id, actor_id, kind, payload FROM activities WHERE subject_id = $1 ORDER BY created_at, id', [subjectId])).rows;
}

it('migrates priorities to p1..p4 and constrains new todo fields', async () => {
  const { rows } = await pool.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'issues'::regclass AND contype = 'c'");
  const defs = rows.map((row) => row.def).join('\n');
  expect(defs).toContain("'p1'");
  expect(defs).not.toContain("'medium'");
  expect(defs).toContain("'waiting'");
  expect((await pool.query("SELECT column_default FROM information_schema.columns WHERE table_name = 'issues' AND column_name = 'priority'")).rows[0].column_default).toContain('p3');
});

it('creates a todo under an auto-created area Goal and default 일반 Epic, reusing them on the next create', async () => {
  const owner = fresh();
  const first = await createTodo(owner, { area: '잡일', title: '  가계부 정리  ', priority: 'p1', dueAt: '2026-10-12', notes: '영수증 포함', estimateMinutes: 30, source: 'one-thing/todos/chores.md' });
  expect(first).toMatchObject({
    title: '가계부 정리', area: '잡일', epic: '일반', status: 'todo', priority: 'p1', hold: null, holdReason: null, scheduledAt: null,
    notes: '영수증 포함', estimateMinutes: 30, source: 'one-thing/todos/chores.md', dueAt: '2026-10-11T15:00:00.000Z'
  });
  const second = await createTodo(owner, { area: '잡일', title: '세탁', hold: 'waiting', holdReason: '세제 배송' }, 'mcp');
  expect(second).toMatchObject({ epicId: first.epicId, priority: 'p3', notes: '', hold: 'waiting', holdReason: '세제 배송' });
  const third = await createTodo(owner, { area: '잡일', epic: '이사', title: '박스 구하기', status: 'backlog' });
  expect(third.epicId).not.toBe(first.epicId);
  expect((await pool.query('SELECT count(*)::int AS n FROM goals WHERE owner_id = $1', [owner])).rows[0].n).toBe(1);
  expect(await activitiesOf(first.id)).toEqual([{ owner_id: owner, actor_id: owner, kind: 'issue.created', payload: { via: 'ui', area: '잡일', epic: '일반' } }]);
  expect((await activitiesOf(second.id))[0]).toMatchObject({ kind: 'issue.created', payload: { via: 'mcp' } });
});

it('updates and completes only the owner’s todo, logging one activity per change', async () => {
  const owner = fresh();
  const todo = await createTodo(owner, { area: '커리어', title: '이력서' });
  const updated = await updateTodo(owner, todo.id, { priority: 'p2', hold: 'blocked', holdReason: '추천인 답장', notes: 'v2', area: '개인' }, 'mcp');
  expect(updated).toMatchObject({ priority: 'p2', hold: 'blocked', holdReason: '추천인 답장', notes: 'v2', area: '개인', epic: '일반' });
  const done = await completeTodo(owner, todo.id, 'mcp');
  expect(done.status).toBe('done');
  await completeTodo(owner, todo.id, 'mcp');
  expect((await activitiesOf(todo.id)).map((row) => [row.kind, row.payload.via])).toEqual([['issue.created', 'ui'], ['issue.updated', 'mcp'], ['issue.completed', 'mcp']]);
  expect((await activitiesOf(todo.id))[1].payload.changes).toEqual(['priority', 'hold', 'holdReason', 'notes', 'area']);

  const intruder = fresh();
  await expect(updateTodo(intruder, todo.id, { title: 'stolen' })).rejects.toThrow();
  await expect(completeTodo(intruder, todo.id)).rejects.toThrow();
  expect((await pool.query('SELECT title FROM issues WHERE id = $1', [todo.id])).rows[0].title).toBe('이력서');
  expect(await activitiesOf(todo.id)).toHaveLength(3);
});

it('rolls back the todo and area when activity logging fails', async () => {
  const owner = fresh();
  await pool.query(`CREATE OR REPLACE FUNCTION yg13_fail() RETURNS trigger AS $$ BEGIN IF NEW.owner_id = '${owner}' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await pool.query('CREATE TRIGGER yg13_fail BEFORE INSERT ON activities FOR EACH ROW EXECUTE FUNCTION yg13_fail()');
  try {
    await expect(createTodo(owner, { area: '롤백', title: 'x' })).rejects.toThrow();
  } finally {
    await pool.query('DROP TRIGGER yg13_fail ON activities; DROP FUNCTION yg13_fail()');
  }
  expect((await pool.query('SELECT count(*)::int AS n FROM goals WHERE owner_id = $1', [owner])).rows[0].n).toBe(0);
});

it('builds today/overdue/waiting with Asia/Seoul date boundaries and owner isolation', async () => {
  const owner = fresh();
  const now = new Date('2026-10-11T15:30:00Z'); // 2026-10-12 00:30 KST
  const make = (title: string, extra: Partial<TodoInput>) => createTodo(owner, { area: '개인', title, ...extra });
  const dueToday = await make('due today', { dueAt: '2026-10-12' });
  const overdue = await make('overdue', { dueAt: new Date('2026-10-11T14:59:00Z') }); // 10-11 23:59 KST
  const p1 = await make('p1 no date', { priority: 'p1' });
  const scheduled = await make('scheduled today', { hold: 'scheduled', scheduledAt: '2026-10-12' });
  const later = await make('scheduled later', { hold: 'scheduled', scheduledAt: '2026-10-13', priority: 'p1' });
  const waiting = await make('waiting due today', { dueAt: '2026-10-12', hold: 'waiting' });
  const blocked = await make('blocked p1', { priority: 'p1', hold: 'blocked' });
  const tomorrow = await make('due tomorrow', { dueAt: '2026-10-13' });
  const finished = await make('done overdue', { dueAt: '2026-10-01', priority: 'p1' });
  await completeTodo(owner, finished.id);
  await createTodo(fresh(), { area: '개인', title: 'foreign', priority: 'p1', dueAt: '2026-10-12' });

  const view = await todayView(owner, now);
  expect(view.date).toBe('2026-10-12');
  expect(view.today.map((t) => t.id).sort()).toEqual([dueToday.id, overdue.id, p1.id, scheduled.id].sort());
  expect(view.overdue.map((t) => t.id)).toEqual([overdue.id]);
  expect(view.waiting.map((t) => t.id).sort()).toEqual([waiting.id, blocked.id].sort());
  for (const id of [later.id, tomorrow.id, finished.id]) expect(JSON.stringify({ ...view, week: [] })).not.toContain(id);
  expect(view.week.map((t) => t.id).sort()).toEqual([later.id, tomorrow.id].sort()); // YG-25 이번 주 예정
  expect(view.today[0]!.priority).toBe('p1');

  expect(await todayView(fresh(), now)).toEqual({ date: '2026-10-12', today: [], overdue: [], waiting: [], week: [], late: [], timeline: { todos: [], ghosts: [] } });
});
