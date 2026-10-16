# YG-49 — 선택·완료 체크 개선

사용자 요청: 오늘 티켓 생성 후 바로 구현. 이 문서는 해당 요청 범위의 작업지시서다.

## 결과
오늘·대기·보드의 선택 체크를 Radix 기반 shadcn 패턴으로 교체. 오늘·대기 완료 체크는 같은 primitive의 동그란 형태로 구분한다. 모양 변경 외 선택/범위 선택/완료 동작을 유지한다.

## 범위
- src/client/ui/Checkbox.tsx: shadcn의 Radix Root/Indicator 구성, 현재 테마 토큰과 lucide Check/Minus 재사용.
- src/client/BulkActions.tsx: SelectBox 내부 교체, Shift 클릭 유지.
- src/client/TodayView.tsx: 완료 체크 교체, 선택과 완료 이름 구분.
- package.json/package-lock.json: 접근성·상태·키보드 처리를 위한 @radix-ui/react-checkbox 의존성.
- test/checkbox-harness.html, test/checkbox-harness.tsx, scripts/check-checkbox.mjs: DB 없이 선택·완료·Shift·Space·disabled·indeterminate 확인.

## 계약과 비범위
DB/migration/API/권한/사용자 데이터 변경 없음. 문서 todo·설정창의 체크는 이번 범위 아님. 기존 AI 승인·원본 보존 규칙 유지. 브라우저 fixture는 테스트 전용이며 운영 작업에 쓰지 않는다.

## 순서와 검증
브라우저 check 작성 → 기존 primitive 없는 상태의 실패 확인 → 구현 → 타입 검사·빌드 → Chrome 키보드/마우스/모바일 확인. 운영 DB를 사용하는 전체 테스트는 실행하지 않는다. 브랜치 feat/yg-49-checkbox, 작업 공간 .worktrees/yg-49. 이번 구현은 한 커밋 단위. 공개 배포는 별도.

## 검증 결과
- RED: Checkbox 모듈 추가 전 브라우저 fixture import 실패와 체크 요소 대기 timeout 확인.
- GREEN: node scripts/check-checkbox.mjs — 선택/Shift 범위/Space/완료 독립/부분선택/disabled/390px 화면 통과.
- npm run typecheck 및 npm run build 통과. git diff --check 통과.
- 화면 확인 후 선택된 완료 체크의 hover 배경이 흐려지는 것을 수정하고 재검증.
- 운영 DB 테스트·공개 배포는 하지 않음. 테스트 화면은 http://127.0.0.1:3149/test/checkbox-harness.html.

## 사용자 승인 UX 수정 — 한 행에 한 체크

기본 모드는 완료 체크 하나, 선택 모드는 같은 자리에 선택 체크 하나만 표시한다. 선택 모드에서는 hover 개별 완료·내일 작업도 숨긴다. 보드는 기본 모드의 선택 체크와 여백을 없애고 명시적 선택 모드에서만 체크를 표시한다. 기존 모바일 길게 누르기와 Shift 범위 선택 유지.

변경: TodayView.tsx, BoardView.tsx, 실화면 브라우저 테스트 scripts/check-single-control.mjs. DB·API 변경 없음. 실제 TodayView를 샘플 API 데이터로 검증하며 운영 할 일을 변경하지 않는다.

완료 체크도 네모 형태로 통일해 라디오로 오인하지 않도록 한다. 기존 기본 모드의 hover 선택 체크는 제거한다.

후속 검증: scripts/check-single-control.mjs가 기존 화면에서 `2 !== 1`로 실패(RED). 수정 후 실제 TodayView/BoardView에 샘플 API를 연결해 기본·hover·선택 모드·Shift·Space·모드 종료·완료·모바일을 확인했다. 보드 기본 모드 0개/선택 모드 1개 확인. 모든 쓰기는 브라우저에서 mock하여 운영 데이터를 변경하지 않았다. 타입 검사·빌드·공백 검사 통과.
