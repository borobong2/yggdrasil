# YG-52: 캘린더 연·월 직접 선택과 최신 범위 로딩

사용자 A 확정 및 구현 승인(2026-10-17). 담당 Codex /root. 선행 YG-51 완료 커밋을 포함한 뒤 직렬 구현.

목표: 연·월 직접 선택으로 빠르게 이동. FE: 최소 month 입력, 보기 유지/선택 월 1일 이동. BE: 기존 API. 수용: 12월↔1월/윤년/URL 복원. fetch 역전 버그 포함: 이전 응답 성공·실패 무시, 로딩·실패·제목·내용 범위 일치, 완료 토글/token/refetch 회귀. 의존성: 두 번째 위 직렬.

공통: 기존 5개 보기 유지, Asia/Seoul/date-only=종일/ISO=timed/null=clear 계약, owner 격리·활동 로그·캡처 보존. DB migration 없음. 사용자 2026-10-17 A 범위 및 구현 승인. 티켓별 feat/yg-<n>-slug/worktree, 직렬 구현, main 변경·배포·병합 금지. 검증: 전용 yggdrasil_yg<n> DB에서 red 회귀/API/DB, npm run typecheck, npm run build, Playwright desktop/mobile acceptance. docs/yg-<n>-*.md 선작성.

정확한 파일: src/client/CalendarView.tsx, src/client/calendar-dates.ts, test/calendar.test.ts, test/yg30-browser.mjs. YG-53은 src/server/todos.ts, src/server/routes/todos.ts, src/contracts/items.ts 추가 검토. 전용 browser fixture와 regression 스크립트는 test/ 아래에 둔다.

비범위: 보기 삭제, 전역 빠른 추가, ICS, 새 의존성, 배포/병합. 별도 migration 없음.

검증: 전용 로컬 yggdrasil_yg52 DB로 db:migrate 및 npx vitest run --dir test, npm run typecheck, npm run build, Playwright desktop/mobile. 운영 DB 금지. red 재현을 먼저 수행하고 결과 및 PR을 dispatch에 기록.
