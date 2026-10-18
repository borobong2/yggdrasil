# YG-57 — 작은 학습 시각화와 모아보기

## 승인된 범위

사용자는 Remotion 기반의 단계별 학습/전체 재생 제안에 이어 “빠르게 시각화 하는거 작게 그리고 이걸 모아서 볼 수 있게” 구현을 요청했다. 기존 문서 화면에 작은 갤러리를 추가하는 bounded 확장으로 실행한다. 네이티브 직접 구현, Remotion Player 기반 RAG/Word2Vec/코사인 유사도 3개부터 시작한다.

## 사용자 결과

문서의 ‘시각화 모음’에서 세 개념을 한곳에 보고, 하나를 선택하여 단계별 그림과 설명을 읽거나 전체 애니메이션을 재생한다. 휴대폰에서도 그림과 컨트롤을 한 열로 볼 수 있다. 직접 링크 `#/documents/visuals/rag`도 제공한다.

## 계약·파일

- DB/BE/MCP/문서 format 변경 없음. 기존 인증 경계 뒤의 문서 UI에만 표시한다.
- `src/client/study-visuals.ts`: 세 개념의 학습 단계, 시간 상수, 프레임→단계 변환. 일반적인 개념 설명만 포함하고 개인 교안·시험 자료는 공개 저장소에 넣지 않는다.
- `src/client/StudyVisuals.tsx`: 갤러리, 선택 상태/hash, Remotion Player, 이전/다음 단계·전체 재생/정지, 설명과 확인 질문. 브라우저 동영상 export/음성/진도 저장은 첫 범위 밖이다.
- `src/client/StudyVisualScene.tsx`: RAG 흐름, CBOW/Skip-gram 비교, 코사인 벡터 회전. React/SVG로 직접 작성한 안전한 코드만 렌더링한다.
- `src/client/DocumentsWorkspace.tsx`: 기존 문서 경로에 갤러리 진입과 lazy import 연결. 기존 HTML sandbox는 그대로 유지한다.
- `package.json`, `package-lock.json`: `remotion` 및 `@remotion/player` 4.0.536, 동일 버전 고정. 개인용 React 화면에서 재생하며 렌더링 서버·외부 영상 호스팅은 추가하지 않는다.

## 검증

전용 로컬 DB `yggdrasil_yg57`에서 전체 테스트. 단위 테스트는 단계 경계와 재생 프레임 계산을 검증한다. 브라우저 테스트는 갤러리 진입, 직접 링크/뒤로 가기, 세 개념 전환, 다음/이전 단계, 재생/정지, 확인 답, 360/390/768 너비와 가로 overflow, 문서 원문 무변경을 확인한다. reduced-motion은 자동 재생하지 않고 단계 이동은 즉시 정지 상태로 표시한다. `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`. 마지막 독립 코드 리뷰 후 기존 세션의 승인된 PR·충돌 없는 병합·배포 흐름을 따른다.

## 실행 기록

- 기준: origin/main 209c2f5. Worktree `.worktrees/yg-57`, branch `feat/yg-57-small-study-visuals`.
- 사용자 승인과 목적을 먼저 기록하고, 실패 테스트부터 구현한다.

- 기준 테스트: 42 files / 204 tests 통과. 단계/직접 링크 단위 테스트는 모듈 부재로 RED 확인 후 2개 GREEN.
- Remotion 갤러리/수동 단계/재생·정지/문답/직접 링크/모바일/원문 무변경 브라우저 검증 통과.
- 독립 리뷰에서 hash 이동 시 저장 중인 편집을 서버 재조회가 덮는 경우를 재현했다. 지연된 PATCH 실패 회귀 테스트 RED 확인 후, 저장 성공을 기다린 다음 화면 상태를 바꾸도록 수정한다.
- 새 시각화 3개는 갤러리 진입 시에만 lazy load된다. 모바일 390px 화면에서 세 항목을 함께 확인했고, 360/390/768px 가로 overflow가 없다.
- 문서 hash 이동 회귀: 저장 중 갤러리 왕복 + 지연 PATCH 실패에서 편집 제목이 사라지는 RED를 확인했다. 화면 전환은 flush 성공 후에만 하며, superseded hash는 무시하도록 수정 후 GREEN.
- 독립 리뷰 재확인 및 브라우저 회귀 테스트 통과. 남은 Important/Critical 없음.
- 최종 검증: 전용 yggdrasil_yg57에서 43 files / 206 tests 통과, typecheck/build 및 diff 검사 통과. 기존 HTML 읽기/소스 편집 브라우저 회귀도 통과.
- 빌드에서 StudyVisuals가 별도 청크로 분리되어 일반 문서 진입 시 Remotion을 받지 않는 것을 확인했다.
