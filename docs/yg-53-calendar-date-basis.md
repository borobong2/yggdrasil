# YG-53: 캘린더 마감일·예정일 표시 기준 선택

사용자 A 확정 및 구현 승인(2026-10-17). 담당 Codex /root. 선행 YG-52 완료 커밋을 포함한 뒤 직렬 구현.

목표: 기본 마감 우선 및 마감일/예정일 기준 선택. 계약: effective/due/scheduled, pure 기준 필드 없는 항목 제외, undated는 두 날짜 없음. BE: calendar route query validation/service 필터/ghost anchor, 기존 호출 기본 보존. FE: dateOf/allDayOf/place/drag/undo 동일 기준, 해당 기준 신규 생성 날짜. 수용: 두 날짜 다른 월/하나/없음/완료/보관/타인/ghost API-FE 일치. timed 00:00 분류 버그 포함: 실제 allDay로 todo/ghost 행 구분, 5개 보기 보존. 의존성: 세 번째 위 직렬.

공통: 기존 5개 보기 유지, Asia/Seoul/date-only=종일/ISO=timed/null=clear 계약, owner 격리·활동 로그·캡처 보존. DB migration 없음. 사용자 2026-10-17 A 범위 및 구현 승인. 티켓별 feat/yg-<n>-slug/worktree, 직렬 구현, main 변경·배포·병합 금지. 검증: 전용 yggdrasil_yg<n> DB에서 red 회귀/API/DB, npm run typecheck, npm run build, Playwright desktop/mobile acceptance. docs/yg-<n>-*.md 선작성.

정확한 파일: src/client/CalendarView.tsx, src/client/calendar-dates.ts, test/calendar.test.ts, test/yg30-browser.mjs. YG-53은 src/server/todos.ts, src/server/routes/todos.ts, src/contracts/items.ts 추가 검토. 전용 browser fixture와 regression 스크립트는 test/ 아래에 둔다.

비범위: 보기 삭제, 전역 빠른 추가, ICS, 새 의존성, 배포/병합. 별도 migration 없음.

검증: 전용 로컬 yggdrasil_yg53 DB로 db:migrate 및 npx vitest run --dir test, npm run typecheck, npm run build, Playwright desktop/mobile. 운영 DB 금지. red 재현을 먼저 수행하고 결과 및 PR을 dispatch에 기록.

납품 검증: typecheck/build 및 전용 yggdrasil_yg53 전체 41 files/200 tests 통과. calendar-browser / calendar-navigation-browser / calendar-basis-browser Chrome 세 스크립트 모두 통과. 상세 범위·실패 원인·재현 명령·스크린샷은 docs/evidence/calendar-improvements/verification.md. 독립 read-only 리뷰에서 추가 actionable finding 없음. 모바일 제목은 새 컨트롤에 눌리지 않게 별도 줄로 배치했다. 표시 기준은 화면 세션 내 선택이며 저장/URL 확장은 범위 밖이다.
