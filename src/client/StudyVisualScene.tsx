import { interpolate, useCurrentFrame } from 'remotion';
import type { StudyVisual } from './study-visuals.js';
import { FRAMES_PER_STEP, stepAtFrame } from './study-visuals.js';
const ink='#20382f',green='#28785b',blue='#32658d',line='#bdcec3',paper='#f4f7f1';

export function VisualDiagram({id,step,progress=1}:{id:StudyVisual['id'];step:number;progress?:number}) {
 const markerId=`arrow-${id}`;
 return <svg viewBox="0 0 640 480" role="img" aria-label={id==='rag'?'질문에서 검색·근거를 거쳐 답변으로 이어지는 RAG':id==='word2vec'?'CBOW와 Skip-gram의 예측 방향 비교':'두 벡터의 방향과 코사인 유사도'} style={{width:'100%',height:'100%',display:'block',fontFamily:'inherit'}}>
  <rect width="640" height="480" rx="20" fill={paper}/>
  <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill={green}/></marker><marker id={`${markerId}-blue`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill={blue}/></marker></defs>
  {id==='rag' ? <Rag step={step} progress={progress} marker={markerId}/> : id==='word2vec' ? <Words step={step} progress={progress} marker={markerId}/> : <Cosine step={step} progress={progress} marker={markerId}/>}
 </svg>;
}
function Box({x,y,label,active}:{x:number;y:number;label:string;active:boolean}){return <g><rect x={x} y={y} width="220" height="106" rx="14" fill={active?'#e1eee5':'white'} stroke={active?green:line} strokeWidth={active?3:2}/><text x={x+110} y={y+65} textAnchor="middle" fontSize="40" fontWeight="650" fill={active?green:ink}>{label}</text></g>;}
function Rag({step,progress,marker}:{step:number;progress:number;marker:string}){
 const points=[[160,115],[480,115],[480,355],[160,355]];const current=points[step],previous=points[Math.max(0,step-1)];const x=previous[0]+(current[0]-previous[0])*progress,y=previous[1]+(current[1]-previous[1])*progress;
 return <>
  {['M275 115 H355','M480 175 V288','M365 355 H285'].map(d=><path key={d} d={d} stroke={line} strokeWidth="5" fill="none" markerEnd={`url(#${marker})`}/>)}
  <Box x={50} y={62} label="질문" active={step>=0}/><Box x={370} y={62} label="검색" active={step>=1}/><Box x={370} y={302} label="근거 첨부" active={step>=2}/><Box x={50} y={302} label="답변" active={step>=3}/>
  <circle cx={x} cy={y-66} r="11" fill={green}/>
  <text x="320" y="236" textAnchor="middle" fill={blue} fontSize="32" fontWeight="600">{['무엇이 궁금한가요?','관련 문서 조각 찾기','질문 + 찾은 자료','근거를 참고해 생성'][step]}</text>
 </>;
}
function Words({step,progress,marker}:{step:number;progress:number;marker:string}){
 const skip=step===1;
 return <>
  <text x="320" y="64" textAnchor="middle" fontSize="42" fontWeight="700" fill={green}>{step===2?'단어 벡터 학습':skip?'Skip-gram':'CBOW'}</text>
  {step<2?<>
   <rect x="36" y="128" width="220" height="98" rx="14" fill="white" stroke={line} strokeWidth="2"/><text x="146" y="188" textAnchor="middle" fontSize="36" fill={ink}>나는</text>
   <rect x="36" y="276" width="220" height="98" rx="14" fill="white" stroke={line} strokeWidth="2"/><text x="146" y="336" textAnchor="middle" fontSize="36" fill={ink}>먹는다</text>
   <Box x={384} y={202} label="사과를" active/>
   <path d={skip?'M380 240 L264 178 M380 270 L264 325':'M260 178 L380 240 M260 325 L380 270'} stroke={green} strokeWidth="5" markerEnd={`url(#${marker})`} fill="none" opacity={0.55+progress*0.45}/>
   <text x="146" y="426" textAnchor="middle" fontSize="30" fill={blue}>주변 단어</text><text x="494" y="426" textAnchor="middle" fontSize="30" fill={blue}>중심 단어</text>
  </>:<>
   <text x="320" y="170" textAnchor="middle" fontSize="38" fill={ink}>주변 문맥을 예측하며</text><text x="320" y="230" textAnchor="middle" fontSize="38" fill={ink}>단어의 표현을 학습합니다.</text>
   <rect x="80" y="294" width="480" height="106" rx="14" fill="#e1eee5"/><text x="320" y="360" textAnchor="middle" fontSize="38" fill={green}>사과를 → [숫자 벡터]</text>
  </>}
 </>;
}
function Cosine({step,progress,marker}:{step:number;progress:number;marker:string}){
 const angle=(Math.max(0,step-1)+(step>0?progress:0))*Math.PI/2;const origin=[320,255],r=154;const end=[origin[0]+r*Math.cos(angle),origin[1]-r*Math.sin(angle)];
 const value=Math.cos(angle);const display=Math.abs(value)<0.005?'0':Math.abs(value-1)<0.005?'1':Math.abs(value+1)<0.005?'−1':value.toFixed(2).replace('-','−');
 return <>
  <path d="M95 255 H545 M320 65 V360" stroke={line} strokeWidth="2"/>
  <line x1="320" y1="255" x2="490" y2="255" stroke={blue} strokeWidth="6" markerEnd={`url(#${marker}-blue)`}/>
  <line x1="320" y1="255" x2={end[0]} y2={end[1]} stroke={green} strokeWidth="6" markerEnd={`url(#${marker})`}/>
  <circle cx="320" cy="255" r="6" fill={ink}/><text x="506" y="295" fontSize="32" fill={blue}>A</text><text x={end[0]+12} y={end[1]-14} fontSize="32" fill={green}>B</text>
  <text x="320" y="416" textAnchor="middle" fontSize="44" fontWeight="700" fill={green}>cos θ = {display}</text>
 </>;
}
export function StudyVisualScene({visual}:{visual:StudyVisual}){
 const frame=useCurrentFrame();const step=stepAtFrame(frame,visual);const progress=interpolate(frame%FRAMES_PER_STEP,[0,38],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 return <VisualDiagram id={visual.id} step={step} progress={progress}/>;
}
