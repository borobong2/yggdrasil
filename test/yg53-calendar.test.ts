import {expect,it,vi,afterEach} from 'vitest';
import {app} from '../src/server/app.js';
import {installTestOwner} from '../src/server/auth.js';
import {createTodo,setArchived} from '../src/server/todos.js';
import type {CalendarView} from '../src/contracts/items.js';
afterEach(()=>vi.useRealTimers());
it('selects due or scheduled without fallback while default stays due first, and isolates owners/archive',async()=>{
 const id=crypto.randomUUID();installTestOwner(`basis-${id}`,{id});const headers={authorization:`Bearer basis-${id}`};
 const both=await createTodo(id,{area:'個人',title:'둘',dueAt:'2026-11-01',scheduledAt:'2026-10-18T00:00:00+09:00'});
 const due=await createTodo(id,{area:'個人',title:'마감',dueAt:'2026-10-18'});
 const scheduled=await createTodo(id,{area:'個人',title:'예정',scheduledAt:'2026-10-18'});
 const undated=await createTodo(id,{area:'個人',title:'없음'});
 const archived=await createTodo(id,{area:'個人',title:'보관',scheduledAt:'2026-10-18'});await setArchived(id,archived.id,true);
 await createTodo(crypto.randomUUID(),{area:'個人',title:'남',scheduledAt:'2026-10-18'});
 const get=async(basis='effective')=>{const r=await app.request(`/api/calendar?from=2026-10-18&to=2026-10-18&basis=${basis}`,{headers});expect(r.status).toBe(200);return await r.json() as CalendarView;};
 expect((await get()).todos.map(x=>x.id).sort()).toEqual([due.id,scheduled.id].sort());
 expect((await get('due')).todos.map(x=>x.id)).toEqual([due.id]);
 const view=await get('scheduled');expect(view.todos.map(x=>x.id).sort()).toEqual([both.id,scheduled.id].sort());expect(view.undated.map(x=>x.id)).toEqual([undated.id]);
 expect(view.todos.find(x=>x.id===both.id)).toMatchObject({scheduledAllDay:false,dueAllDay:true});
 expect((await app.request('/api/calendar?from=2026-10-18&to=2026-10-18&basis=unknown',{headers})).status).toBe(400);
});
it('uses the selected date as recurrence anchor and excludes missing selected fields',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-17T00:00:00+09:00'));
 const id=crypto.randomUUID();installTestOwner(`ghost-${id}`,{id});const headers={authorization:`Bearer ghost-${id}`};
 const both=await createTodo(id,{area:'개인',title:'두 반복',dueAt:'2026-10-25',scheduledAt:'2026-10-18T00:00:00+09:00',recurrence:{freq:'daily',time:'00:00'}});
 const due=await createTodo(id,{area:'개인',title:'종일 반복',dueAt:'2026-10-18',recurrence:{freq:'daily'}});
 const r=await app.request('/api/calendar?from=2026-10-18&to=2026-10-20&basis=scheduled',{headers});const view=await r.json() as CalendarView;
 expect(view.ghosts.map(x=>x.todoId)).toEqual([both.id,both.id]);expect(view.ghosts.every(x=>!x.allDay)).toBe(true);expect(view.ghosts.some(x=>x.todoId===due.id)).toBe(false);
});
