import { useEffect, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import type { CallbackListener, PlayerRef } from '@remotion/player';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import { studyVisuals, visualForHash, stepAtFrame, frameForStep, FRAMES_PER_STEP, VISUAL_FPS } from './study-visuals.js';
import type { StudyVisual } from './study-visuals.js';
import { StudyVisualScene, VisualDiagram } from './StudyVisualScene.js';

export default function StudyVisuals() {
 const [hash,setHash]=useState(()=>location.hash);
 useEffect(()=>{const update=()=>setHash(location.hash);window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
 const visual=visualForHash(hash);
 if(visual) return <VisualLesson key={visual.id} visual={visual}/>;
 return <section aria-label="시각화 모음" className="mx-auto max-w-5xl">
  <button type="button" className="btn btn-ghost mb-5 min-h-11" onClick={()=>{location.hash='#/documents';}}><ArrowLeft/>문서로</button>
  <h2 className="text-[28px] font-semibold tracking-tight">작게 보는 개념</h2>
  <p className="mt-2 max-w-xl text-base leading-7 text-muted">한 개념씩 그림을 움직여 보세요. 직접 단계를 넘기거나 짧게 전체 재생할 수 있습니다.</p>
  {hash!=='#/documents/visuals'&&<p role="status" className="mt-3 text-sm text-muted">이 항목은 없습니다. 아래 모음에서 골라주세요.</p>}
  <ul className="mt-7 grid gap-4 lg:grid-cols-3">{studyVisuals.map(v=><li key={v.id} data-visual-item>
   <a href={`#/documents/visuals/${v.id}`} className="flex items-center overflow-hidden rounded-xl border border-line bg-surface lg:block transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
    <div className="aspect-[4/3] w-28 shrink-0 p-2 lg:mx-auto lg:w-full lg:max-w-sm lg:p-3"><VisualDiagram id={v.id} step={v.steps.length-1}/></div>
    <div className="min-w-0 flex-1 p-4 lg:border-t lg:border-line lg:p-5"><h3 className="text-xl font-semibold">{v.title}</h3><p className="mt-2 text-sm leading-6 text-muted">{v.description}</p><p className="mt-4 flex items-center gap-2 text-sm font-medium text-accent-ink">{v.steps.length}단계 · {v.steps.length*FRAMES_PER_STEP/VISUAL_FPS}초 <ArrowRight className="size-4"/></p></div>
   </a>
  </li>)}</ul>
 </section>;
}
function VisualLesson({visual}:{visual:StudyVisual}) {
 const player=useRef<PlayerRef>(null);const [step,setStep]=useState(0);const [playing,setPlaying]=useState(false);
 useEffect(()=>{
  const current=player.current;if(!current)return;
  const frame:CallbackListener<'frameupdate'>=event=>setStep(stepAtFrame(event.detail.frame,visual));
  const play=()=>setPlaying(true),pause=()=>setPlaying(false);
  current.addEventListener('frameupdate',frame);current.addEventListener('play',play);current.addEventListener('pause',pause);current.addEventListener('ended',pause);
  return()=>{current.removeEventListener('frameupdate',frame);current.removeEventListener('play',play);current.removeEventListener('pause',pause);current.removeEventListener('ended',pause);};
 },[visual]);
 function go(next:number){player.current?.pause();player.current?.seekTo(frameForStep(next,visual));setStep(Math.max(0,Math.min(visual.steps.length-1,next)));}
 return <section aria-label={`${visual.title} 학습`} className="mx-auto max-w-3xl">
  <div className="mb-5 flex items-center justify-between gap-3"><button type="button" className="btn btn-ghost min-h-11" onClick={()=>{location.hash='#/documents/visuals';}}><ArrowLeft/>모음으로</button><span className="text-sm tabular-nums text-muted" aria-live="polite">{step+1} / {visual.steps.length}단계</span></div>
  <h2 className="text-[28px] font-semibold tracking-tight">{visual.title}</h2>
  <p className="mb-5 mt-1 text-sm leading-6 text-muted">{visual.description}</p>
  <div className="overflow-hidden rounded-xl border border-line bg-surface" data-visual-player>
   <Player ref={player} component={StudyVisualScene} inputProps={{visual}} durationInFrames={visual.steps.length*FRAMES_PER_STEP} compositionWidth={640} compositionHeight={480} fps={VISUAL_FPS} initialFrame={frameForStep(0,visual)} controls={false} autoPlay={false} style={{width:'100%'}}
    errorFallback={()=> <div role="alert" style={{padding:24}}>시각화를 표시하지 못했습니다. 페이지를 새로고침해주세요.</div>}/>
  </div>
  <div className="mt-5 min-h-28" aria-live="polite"><h3 className="text-xl font-semibold leading-8">{visual.steps[step].title}</h3><p className="mt-2 text-[17px] leading-8 text-muted">{visual.steps[step].explanation}</p></div>
  <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
   <button type="button" aria-label="이전 단계" className="btn min-h-12 px-2" disabled={step===0} onClick={()=>go(step-1)}><ArrowLeft/>이전</button>
   <button type="button" aria-label={playing?'멈춤':'전체 재생'} className="btn btn-primary min-h-12 px-3" onClick={event=>{if(playing)player.current?.pause();else{player.current?.seekTo(0);player.current?.play(event);}}}>{playing?<Pause/>:<Play/>}{playing?'멈춤':'전체 재생'}</button>
   <button type="button" aria-label="다음 단계" className="btn min-h-12 px-2" disabled={step===visual.steps.length-1} onClick={()=>go(step+1)}>다음<ArrowRight/></button>
  </div>
  <section className="mt-8 border-t border-line pt-4"><h3 className="text-sm font-medium text-muted">스스로 확인하기</h3><p className="mt-2 text-base font-medium leading-7">{visual.question}</p><details><summary className="cursor-pointer py-3 text-base font-medium">정답 보기</summary><p className="pb-4 text-base leading-8 text-muted">{visual.answer}</p></details></section>
  <p className="mt-4 text-xs leading-6 text-faint">개념 이해용 예시입니다. 출제 문제나 점수를 예측한 자료가 아닙니다.</p>
 </section>;
}
