export const VISUAL_FPS = 30;
export const FRAMES_PER_STEP = 90;
export type StudyVisual = { id: 'rag' | 'word2vec' | 'cosine'; title: string; description: string; steps: { title: string; explanation: string }[]; question: string; answer: string };
export const studyVisuals: StudyVisual[] = [
 {id:'rag',title:'RAG',description:'질문에 필요한 근거가 답변에 들어가는 과정',steps:[
  {title:'질문을 받습니다.',explanation:'예: “우리 회사 휴가 규정은?” 모델에 없는 사내 정보가 필요한 질문입니다.'},
  {title:'관련 자료를 찾습니다.',explanation:'준비된 문서에서 질문과 관련 있는 규정 조각을 검색합니다.'},
  {title:'질문과 근거를 함께 건넵니다.',explanation:'찾은 문서 조각을 질문과 함께 모델 입력에 넣습니다.'},
  {title:'근거를 참고해 답변합니다.',explanation:'모델이 제공된 자료를 참고해 답합니다. 검색이나 근거 해석이 틀리면 오답이 생길 수 있습니다.'}],
  question:'RAG는 질문할 때마다 모델 가중치를 다시 학습할까요?',answer:'아니요. RAG는 검색 근거를 입력에 추가합니다. 모델 가중치를 추가 학습하는 파인튜닝과 구분합니다.'},
 {id:'word2vec',title:'Word2Vec',description:'CBOW와 Skip-gram, 예측 방향으로 구분하기',steps:[
  {title:'CBOW는 주변에서 중심으로.',explanation:'주변 단어 “나는”, “먹는다”를 입력으로 중심 단어 “사과를”을 예측하는 예입니다.'},
  {title:'Skip-gram은 중심에서 주변으로.',explanation:'중심 단어를 입력으로 주변에 올 단어를 예측합니다. CBOW와 입력·출력 방향이 반대입니다.'},
  {title:'예측 학습에서 단어 벡터를 얻습니다.',explanation:'학습 과정에서 얻은 임베딩은 문맥적 관계를 반영합니다. 정적 Word2Vec은 보통 단어마다 하나의 벡터를 사용합니다.'}],
  question:'“주변 단어 → 중심 단어”는 어느 방식일까요?',answer:'CBOW입니다. Skip-gram은 중심 단어 → 주변 단어입니다.'},
 {id:'cosine',title:'코사인 유사도',description:'같은 방향·직교·반대 방향을 회전으로 보기',steps:[
  {title:'같은 방향이면 1.',explanation:'길이가 달라도 양의 배수이면 방향이 같아서 코사인 유사도는 1입니다.'},
  {title:'직교하면 0.',explanation:'두 벡터가 90도를 이루면 내적이 0이므로 코사인 유사도도 0입니다.'},
  {title:'반대 방향이면 −1.',explanation:'두 벡터가 180도를 이루면 코사인 유사도는 −1입니다. 영벡터에는 공식이 정의되지 않습니다.'}],
  question:'A=(1,0), B=(2,0)의 코사인 유사도는?',answer:'1입니다. 코사인 유사도는 내적을 두 벡터 크기의 곱으로 나눈 값이며, 이 경우 방향이 같습니다.'}
];
export function visualForHash(hash: string): StudyVisual | undefined { return studyVisuals.find(v => hash === `#/documents/visuals/${v.id}`); }
export function stepAtFrame(frame: number, visual: StudyVisual): number { return Math.max(0, Math.min(visual.steps.length - 1, Math.floor(frame / FRAMES_PER_STEP))); }
export function frameForStep(step: number, visual: StudyVisual): number { return Math.max(0, Math.min(visual.steps.length - 1, Math.trunc(step))) * FRAMES_PER_STEP + 60; }
