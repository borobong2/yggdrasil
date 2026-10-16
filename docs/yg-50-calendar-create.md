# YG-50: 캘린더 빈 날짜·시간에서 할 일 추가

사용자 A 확정 및 구현 승인(2026-10-17). 담당 Codex /root. 첫 티켓.

목표: 빈 월 날짜/종일/시간 칸 클릭으로 날짜를 채운 할 일 생성. 범위: 최소 생성 폼, 취소/오류 입력 보존, 카드/드래그와 분리. BE: 기존 생성 API와 검증 재사용. FE: CalendarView 생성 UI/리프레시. 수용: 종일 date-only 및 timed 시간 저장, 취소 무변경, 실패 재시도. 종일 undo 버그 포함: due/scheduled/null/두 날짜 clear 복구와 낙관적 allDay, 같은 instant 종일↔자정 이동 검증. 의존성: 첫 번째.

공통: 기존 5개 보기 유지, Asia/Seoul/date-only=종일/ISO=timed/null=clear 계약, owner 격리·활동 로그·캡처 보존. DB migration 없음. 사용자 2026-10-17 A 범위 및 구현 승인. 티켓별 feat/yg-<n>-slug/worktree, 직렬 구현, main 변경·배포·병합 금지. 검증: 전용 yggdrasil_yg<n> DB에서 red 회귀/API/DB, npm run typecheck, npm run build, Playwright desktop/mobile acceptance. docs/yg-<n>-*.md 선작성.

정확한 파일: src/client/CalendarView.tsx, src/client/calendar-dates.ts, test/calendar.test.ts, test/yg30-browser.mjs. YG-53은 src/server/todos.ts, src/server/routes/todos.ts, src/contracts/items.ts 추가 검토. 전용 browser fixture와 regression 스크립트는 test/ 아래에 둔다.

비범위: 보기 삭제, 전역 빠른 추가, ICS, 새 의존성, 배포/병합. 별도 migration 없음.

검증: 전용 로컬 yggdrasil_yg50 DB로 db:migrate 및 npx vitest run --dir test, npm run typecheck, npm run build, Playwright desktop/mobile. 운영 DB 금지. red 재현을 먼저 수행하고 결과 및 PR을 dispatch에 기록.
