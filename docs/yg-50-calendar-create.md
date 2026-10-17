# YG-50: 캘린더 빈 날짜·시간에서 할 일 추가

사용자 A 확정 및 구현 승인(2026-10-17). 담당 Codex /root. 첫 티켓.

목표: 빈 월 날짜/종일/시간 칸 클릭으로 날짜를 채운 할 일 생성. 범위: 최소 생성 폼, 취소/오류 입력 보존, 카드/드래그와 분리. BE: 기존 생성 API와 검증 재사용. FE: CalendarView 생성 UI/리프레시. 수용: 종일 date-only 및 timed 시간 저장, 취소 무변경, 실패 재시도. 종일 undo 버그 포함: due/scheduled/null/두 날짜 clear 복구와 낙관적 allDay, 같은 instant 종일↔자정 이동 검증. 의존성: 첫 번째.

공통: 기존 5개 보기 유지, Asia/Seoul/date-only=종일/ISO=timed/null=clear 계약, owner 격리·활동 로그·캡처 보존. DB migration 없음. 사용자 2026-10-17 A 범위 및 구현 승인. 티켓별 feat/yg-<n>-slug/worktree, 직렬 구현, main 변경·배포·병합 금지. 검증: 전용 yggdrasil_yg<n> DB에서 red 회귀/API/DB, npm run typecheck, npm run build, Playwright desktop/mobile acceptance. docs/yg-<n>-*.md 선작성.

정확한 파일: src/client/CalendarView.tsx, src/client/calendar-dates.ts, test/calendar.test.ts, test/yg30-browser.mjs. YG-53은 src/server/todos.ts, src/server/routes/todos.ts, src/contracts/items.ts 추가 검토. 전용 browser fixture와 regression 스크립트는 test/ 아래에 둔다.

비범위: 보기 삭제, 전역 빠른 추가, ICS, 새 의존성, 배포/병합. 별도 migration 없음.

검증: 전용 로컬 yggdrasil_yg50 DB로 db:migrate 및 npx vitest run --dir test, npm run typecheck, npm run build, Playwright desktop/mobile. 운영 DB 금지. red 재현을 먼저 수행하고 결과 및 PR을 dispatch에 기록.

실제 BE 변경: 기존 /api/issues는 epicId 필수이며 scheduledAt 및 종일 생성 계약을 지원하지 않아 POST /api/todos를 추가했다. createTodo와 공유 Zod 날짜 검증/ownerAuth/via=ui를 재사용한다.

검증 2026-10-17: 신규 API red 404 확인 후 green, typecheck/build 통과, 전용 yggdrasil_yg50 전체 39 files/197 tests 통과. 기존 의도적 transaction rollback 테스트의 forced document failure stderr는 예상 출력이며 테스트 통과. test/calendar-browser-server.ts + node test/calendar-browser.mjs 통과(Chrome, desktop/mobile, 생성·종일 undo·scheduled null·두 날짜 복원·같은 instant 종일→timed 전환). test fixture의 숨은 overflow chip 선택 실패는 visible locator와 분산 seed로 수정 후 통과.
