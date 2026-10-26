import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { app } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import { bulkInput, bulkUpdateTodos } from '../src/server/todo-bulk.js';
import { calendarView, createTodo, getTodo, setArchived, todayView, updateTodo } from '../src/server/todos.js';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());
const owner = () => { const id=crypto.randomUUID();const token=`yg64-${id}`;installTestOwner(token,{id});return {id,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'}}; };

it('snoozes only scheduledAt and undo cannot overwrite subsequently edited real dates', async () => {
 const me=owner();
 const todo=await createTodo(me.id,{area:'개인',title:'실제 마감',dueAt:'2026-10-31T23:59:00+09:00',targetAt:'2026-10-27'});
 const result=await bulkUpdateTodos(me.id,{action:'snooze',ids:[todo.id],until:'2026-10-28'});
 expect(result.todos[0]).toMatchObject({dueAt:todo.dueAt,targetAt:todo.targetAt,scheduledAt:'2026-10-27T15:00:00.000Z',scheduledAllDay:true});
 expect(result.previous).toEqual([{id:todo.id,scheduledAt:null}]);
 const edited=await updateTodo(me.id,todo.id,{dueAt:'2026-11-02',targetAt:'2026-10-29'});
 const restored=await bulkUpdateTodos(me.id,bulkInput.parse({action:'restore',items:result.previous}));
 expect(restored.todos[0]).toMatchObject({scheduledAt:null,scheduledAllDay:false,dueAt:edited.dueAt,targetAt:edited.targetAt});
 expect((await pool.query(`SELECT payload FROM activities WHERE subject_id=$1 AND payload->>'bulk'='snooze'`,[todo.id])).rows[0].payload.changes).toEqual(['scheduledAt']);
});

it('preserves precise KST scheduled time across midnight while moving date and keeping holds unchanged', async () => {
 const me=owner();
 const todo=await createTodo(me.id,{area:'개인',title:'자정 계획',scheduledAt:'2026-10-26T15:00:12.345Z',dueAt:'2026-10-31',hold:'scheduled'});
 const result=await bulkUpdateTodos(me.id,{action:'snooze',ids:[todo.id],until:'2026-10-29'});
 expect(result.todos[0]).toMatchObject({scheduledAt:'2026-10-28T15:00:12.345Z',scheduledAllDay:false,dueAt:todo.dueAt,hold:'scheduled'});
 await bulkUpdateTodos(me.id,bulkInput.parse({action:'restore',items:result.previous}));
 expect(await getTodo(me.id,todo.id)).toMatchObject({scheduledAt:todo.scheduledAt,scheduledAllDay:false});
});

it('validates partial restores and owner isolation without accepting id-only or unknown fields', async () => {
 const me=owner(),other=owner();
 const todo=await createTodo(me.id,{area:'個人',title:'격리',dueAt:'2026-10-31'});
 for(const items of [[{id:todo.id}],[{id:todo.id,other:1}],[{id:todo.id,targetAt:null}]]) expect(bulkInput.safeParse({action:'restore',items}).success).toBe(false);
 const response=await app.request('/api/todos/bulk',{method:'POST',headers:other.headers,body:JSON.stringify({action:'restore',items:[{id:todo.id,scheduledAt:'2026-10-27'}]})});
 expect(response.status).toBe(404);
 expect(await getTodo(me.id,todo.id)).toMatchObject({dueAt:todo.dueAt,scheduledAt:null});
});

it('places schedules before deadlines and lists every unscheduled open todo with real-date visibility', async () => {
 const me=owner();
 const both=await createTodo(me.id,{area:'個人',title:'예정 우선',scheduledAt:'2026-10-26',dueAt:'2026-10-31'});
 const due=await createTodo(me.id,{area:'個人',title:'마감만',dueAt:'2026-10-26'});
 const target=await createTodo(me.id,{area:'個人',title:'목표만',targetAt:'2026-10-26'});
 const blank=await createTodo(me.id,{area:'個人',title:'빈 날짜'});
 const done=await createTodo(me.id,{area:'個人',title:'완료',status:'done',dueAt:'2026-10-26'});
 const archived=await createTodo(me.id,{area:'個人',title:'보관',dueAt:'2026-10-26'});await setArchived(me.id,archived.id,true);
 await createTodo(crypto.randomUUID(),{area:'個人',title:'타인',dueAt:'2026-10-26'});
 const view=await calendarView(me.id,'2026-10-26','2026-10-26');
 expect(new Set(view.todos.map(t=>t.id))).toEqual(new Set([both.id,due.id]));
 expect(new Set(view.undated.map(t=>t.id))).toEqual(new Set([due.id,target.id,blank.id]));
 expect((await calendarView(me.id,'2026-10-26','2026-10-26',false,undefined,'due')).todos.map(t=>t.id)).toEqual([due.id]);
 expect((await calendarView(me.id,'2026-10-26','2026-10-26',false,undefined,'scheduled')).todos.map(t=>t.id)).toEqual([both.id]);
 expect(view.undated.some(t=>t.id===done.id)).toBe(false);
});

it('uses a timed schedule for today timeline even when the real deadline is a later all-day date', async () => {
 const me=owner();
 const todo=await createTodo(me.id,{area:'개인',title:'준비 시각',scheduledAt:'2026-10-26T09:30:00+09:00',dueAt:'2026-10-31'});
 expect((await todayView(me.id,new Date('2026-10-26T08:00:00+09:00'))).timeline.todos.map(t=>t.id)).toContain(todo.id);
});
