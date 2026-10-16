import { expect, it } from 'vitest';
import { app } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import { createTodo, updateTodo } from '../src/server/todos.js';
import { calendarDateInput } from '../src/client/calendar-dates.js';

it('creates calendar todos through authenticated UI with the same date semantics', async () => {
 const id = crypto.randomUUID(); installTestOwner(`create-${id}`, {id});
 const post = (body: unknown, token = `create-${id}`) => app.request('/api/todos', {method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
 expect((await post({area:'개인',title:'종일',dueAt:'2026-10-18'})).status).toBe(200);
 const timed = await (await post({area:'개인',title:'자정',scheduledAt:'2026-10-18T00:00:00+09:00'})).json();
 expect(timed).toMatchObject({scheduledAllDay:false, scheduledAt:'2026-10-17T15:00:00.000Z'});
 expect((await post({area:'개인',title:'',dueAt:'2026-10-18'})).status).toBe(400);
 expect((await post({area:'개인',title:'x'},'invalid')).status).toBe(401);
});
it('serializes undo dates using the original all-day flag and preserves null', async () => {
 const id=crypto.randomUUID();
 const todo=await createTodo(id,{area:'개인',title:'둘',dueAt:'2026-10-18',scheduledAt:'2026-10-18T00:00:00+09:00'});
 expect(calendarDateInput(todo.dueAt,todo.dueAllDay)).toBe('2026-10-18');
 expect(calendarDateInput(null,false)).toBe(null);
 await updateTodo(id,todo.id,{dueAt:null,scheduledAt:null});
 const restored=await updateTodo(id,todo.id,{dueAt:calendarDateInput(todo.dueAt,todo.dueAllDay),scheduledAt:calendarDateInput(todo.scheduledAt,todo.scheduledAllDay)});
 expect(restored).toMatchObject({dueAt:todo.dueAt,dueAllDay:true,scheduledAt:todo.scheduledAt,scheduledAllDay:false});
});
