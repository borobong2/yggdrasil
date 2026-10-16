import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {Checkbox} from '../src/client/ui/Checkbox.js';
import {SelectBox,useSelection} from '../src/client/BulkActions.js';
import '../src/client/styles.css';
function Harness(){const selection=useSelection();const [completed,setCompleted]=useState(false);return <main className="mx-auto max-w-xl space-y-6 p-8"><h1 className="text-xl font-semibold">선택과 완료</h1><p>네모는 여러 항목 선택, 동그라미는 완료입니다.</p><section className="card divide-y divide-line">{['A','B','C'].map(id=><div className="flex items-center gap-4 p-4" key={id}><SelectBox label={id} checked={selection.selected.has(id)} onToggle={range=>selection.toggle(id,range,['A','B','C'])}/><span className="flex-1">할 일 {id}</span><Checkbox shape="circle" aria-label={`${id} 완료`} checked={id==='A'&&completed} onCheckedChange={checked=>{if(id==='A')setCompleted(checked===true);}}/></div>)}</section><output aria-label="선택 결과">{[...selection.selected].sort().join(',')||'없음'}</output><output aria-label="완료 결과">{completed?'완료':'미완료'}</output><div className="flex items-center gap-4"><Checkbox aria-label="부분 선택" checked="indeterminate"/><Checkbox aria-label="사용 불가" disabled/></div></main>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
