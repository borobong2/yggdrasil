# 캘린더 개선 dispatch

2026-10-17 사용자 A 범위·구현 승인. 담당: 현재 Codex `/root` 세션. Yggdrasil MCP create_todos(prefix YG) 실제 발행 완료. 프로젝트 전체 상태 목록 및 검색 중복 확인: YG-30 완료, YG-27 전역 한 줄 입력 보류와 별개인 캘린더 생성. GitHub issue 미생성.

직렬 의존성: YG-50 → YG-51 → YG-52 → YG-53. 각 후속 브랜치는 선행 구현 커밋을 포함하도록 갱신한다. main/다른 worktree 수정·병합·배포 금지.

## YG-50: 캘린더 빈 날짜·시간에서 할 일 추가

- issue id: `2eb715d9-7b1a-42ad-b267-06db50fc2005`
- branch: `feat/yg-50-calendar-create`
- worktree: `/Users/bong/github/workspaces/yggdrasil/calendar-improvements/.worktrees/yg-50`
- 담당 세션: Codex /root (직접 구현)
- 작업지시서: [yg-50-calendar-create.md](yg-50-calendar-create.md)
- 상태: 발행 완료, 구현 대기
- 수용 기준 및 계약/BE/FE: 목표: 빈 월 날짜/종일/시간 칸 클릭으로 날짜를 채운 할 일 생성. 범위: 최소 생성 폼, 취소/오류 입력 보존, 카드/드래그와 분리. BE: 기존 생성 API와 검증 재사용. FE: CalendarView 생성 UI/리프레시. 수용: 종일 date-only 및 timed 시간 저장, 취소 무변경, 실패 재시도. 종일 undo 버그 포함: due/scheduled/null/두 날짜 clear 복구와 낙관적 allDay, 같은 instant 종일↔자정 이동 검증. 의존성: 첫 번째.
공통: 기존 5개 보기 유지, Asia/Seoul/date-only=종일/ISO=timed/null=clear 계약, owner 격리·활동 로그·캡처 보존. DB migration 없음. 사용자 2026-10-17 A 범위 및 구현 승인. 티켓별 feat/yg-<n>-slug/worktree, 직렬 구현, main 변경·배포·병합 금지. 검증: 전용 yggdrasil_yg<n> DB에서 red 회귀/API/DB, npm run typecheck, npm run build, Playwright desktop/mobile acceptance. docs/yg-<n>-*.md 선작성.
- 검증 명령: `DATABASE_URL=<로컬 전용 yggdrasil_yg50> npm run db:migrate`; `DATABASE_URL=<동일 DB> npx vitest run --dir test`; `npm run typecheck`; `npm run build`; 티켓 fixture + Playwright browser acceptance.

## YG-51: 캘린더 월간 날짜에서 하루 상세 열기

- issue id: `672790e2-6aaf-4c76-9daa-9f114cc23b8f`
- branch: `feat/yg-51-calendar-day`
- worktree: `/Users/bong/github/workspaces/yggdrasil/calendar-improvements/.worktrees/yg-51`
- 담당 세션: Codex /root (직접 구현)
- 작업지시서: [yg-51-calendar-day.md](yg-51-calendar-day.md)
- 상태: 발행 완료, 구현 대기
- 수용 기준 및 계약/BE/FE: 목표: 월 날짜 번호 클릭으로 기존 일 보기 이동. BE: 기존 GET calendar 유지. FE: 날짜 버튼과 빈 칸 생성 구분, URL/뒤로가기 보존. 수용: 인접 월·오늘·카드/더보기·모바일. 일요일 시작 포함: weekStart/monthGrid/요일 헤더/주 보기 일~토 통일, 월말·연말·윤년 테스트. 의존성: 첫 티켓 위 직렬.
공통: 기존 5개 보기 유지, Asia/Seoul/date-only=종일/ISO=timed/null=clear 계약, owner 격리·활동 로그·캡처 보존. DB migration 없음. 사용자 2026-10-17 A 범위 및 구현 승인. 티켓별 feat/yg-<n>-slug/worktree, 직렬 구현, main 변경·배포·병합 금지. 검증: 전용 yggdrasil_yg<n> DB에서 red 회귀/API/DB, npm run typecheck, npm run build, Playwright desktop/mobile acceptance. docs/yg-<n>-*.md 선작성.
- 검증 명령: `DATABASE_URL=<로컬 전용 yggdrasil_yg51> npm run db:migrate`; `DATABASE_URL=<동일 DB> npx vitest run --dir test`; `npm run typecheck`; `npm run build`; 티켓 fixture + Playwright browser acceptance.

## YG-52: 캘린더 연·월 직접 선택과 최신 범위 로딩

- issue id: `c99a7d23-a401-46dd-9921-92d3534ac9e7`
- branch: `feat/yg-52-calendar-navigation`
- worktree: `/Users/bong/github/workspaces/yggdrasil/calendar-improvements/.worktrees/yg-52`
- 담당 세션: Codex /root (직접 구현)
- 작업지시서: [yg-52-calendar-navigation.md](yg-52-calendar-navigation.md)
- 상태: 발행 완료, 구현 대기
- 수용 기준 및 계약/BE/FE: 목표: 연·월 직접 선택으로 빠르게 이동. FE: 최소 month 입력, 보기 유지/선택 월 1일 이동. BE: 기존 API. 수용: 12월↔1월/윤년/URL 복원. fetch 역전 버그 포함: 이전 응답 성공·실패 무시, 로딩·실패·제목·내용 범위 일치, 완료 토글/token/refetch 회귀. 의존성: 두 번째 위 직렬.
공통: 기존 5개 보기 유지, Asia/Seoul/date-only=종일/ISO=timed/null=clear 계약, owner 격리·활동 로그·캡처 보존. DB migration 없음. 사용자 2026-10-17 A 범위 및 구현 승인. 티켓별 feat/yg-<n>-slug/worktree, 직렬 구현, main 변경·배포·병합 금지. 검증: 전용 yggdrasil_yg<n> DB에서 red 회귀/API/DB, npm run typecheck, npm run build, Playwright desktop/mobile acceptance. docs/yg-<n>-*.md 선작성.
- 검증 명령: `DATABASE_URL=<로컬 전용 yggdrasil_yg52> npm run db:migrate`; `DATABASE_URL=<동일 DB> npx vitest run --dir test`; `npm run typecheck`; `npm run build`; 티켓 fixture + Playwright browser acceptance.

## YG-53: 캘린더 마감일·예정일 표시 기준 선택

- issue id: `fdb966f1-caa7-4721-a469-6c8eb56ceaaa`
- branch: `feat/yg-53-calendar-date-basis`
- worktree: `/Users/bong/github/workspaces/yggdrasil/calendar-improvements/.worktrees/yg-53`
- 담당 세션: Codex /root (직접 구현)
- 작업지시서: [yg-53-calendar-date-basis.md](yg-53-calendar-date-basis.md)
- 상태: 발행 완료, 구현 대기
- 수용 기준 및 계약/BE/FE: 목표: 기본 마감 우선 및 마감일/예정일 기준 선택. 계약: effective/due/scheduled, pure 기준 필드 없는 항목 제외, undated는 두 날짜 없음. BE: calendar route query validation/service 필터/ghost anchor, 기존 호출 기본 보존. FE: dateOf/allDayOf/place/drag/undo 동일 기준, 해당 기준 신규 생성 날짜. 수용: 두 날짜 다른 월/하나/없음/완료/보관/타인/ghost API-FE 일치. timed 00:00 분류 버그 포함: 실제 allDay로 todo/ghost 행 구분, 5개 보기 보존. 의존성: 세 번째 위 직렬.
공통: 기존 5개 보기 유지, Asia/Seoul/date-only=종일/ISO=timed/null=clear 계약, owner 격리·활동 로그·캡처 보존. DB migration 없음. 사용자 2026-10-17 A 범위 및 구현 승인. 티켓별 feat/yg-<n>-slug/worktree, 직렬 구현, main 변경·배포·병합 금지. 검증: 전용 yggdrasil_yg<n> DB에서 red 회귀/API/DB, npm run typecheck, npm run build, Playwright desktop/mobile acceptance. docs/yg-<n>-*.md 선작성.
- 검증 명령: `DATABASE_URL=<로컬 전용 yggdrasil_yg53> npm run db:migrate`; `DATABASE_URL=<동일 DB> npx vitest run --dir test`; `npm run typecheck`; `npm run build`; 티켓 fixture + Playwright browser acceptance.
