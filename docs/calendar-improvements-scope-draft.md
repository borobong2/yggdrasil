# 캘린더 개선 인계 — A 승인됨 — 구현 기준

2026-10-17. 기준 커밋 `cd8361d`. 소유 워크트리: `/Users/bong/github/workspaces/yggdrasil/calendar-improvements`.

## 실행 경계

- 사용자가 A를 확정하고 티켓 발행·구현을 승인했다. 실제 티켓 YG-50~53은 calendar-improvements-dispatch.md를 참조한다.
- 범위 대기는 해제되었다. 티켓별 worktree에서 직렬 구현한다. 원본 main과 다른 worktree는 수정하지 않는다.
- 답변 후 Yggdrasil MCP에서 중복을 다시 확인하고 `create_todos`, `prefix: YG`로 4개를 등록한다. GitHub issue로 대체하지 않는다.
- 실제 키가 정해지면 각 `docs/yg-<n>-<slug>.md`를 먼저 작성하고 `feat/yg-<n>-<slug>` 및 티켓별 `.worktrees/yg-<n>`에서 직렬 구현한다. 이번 사용자 지시는 범위 확정 후 등록·구현 권한을 포함한다.
- PR과 검증 증거를 남긴다. 병합과 배포는 하지 않는다.

## 확인한 계약과 연결

README, docs/loop/PRODUCT.md, docs/github-tracking.md, docs/deploy/README.md를 읽었다. 현재 워크트리에 AGENTS.md와 .ai는 없고, 경로 상위의 AGENTS.md도 발견되지 않았다.

세션에 Yggdrasil create_todo/create_todos/list_todos/search_workspace/get_todo/update_todo가 노출된다. 별도 PAT 접근이나 connect-mcp 실행은 필요 없다. 검색 `캘린더`에는 YG-30(캘린더), YG-31(ICS)이 나왔으며 `calendar`, `자정`, `종일`에는 결과가 없었다. 이는 완전한 중복 검사 결과가 아니므로 등록 직전에 기존 티켓 상세와 목록을 다시 확인한다.

## 코드 리뷰 근거 — 실행 재현 전

- `src/client/calendar-dates.ts`: weekStart는 월요일 기준이며 monthGrid와 rangeOf가 이를 사용한다. `test/calendar.test.ts`도 월요일을 기대한다.
- `src/client/CalendarView.tsx`: weekdayNames는 월~일이다. load는 응답 순서를 검사하지 않고 기존 data를 유지하며, 제목과 그리드는 새 location으로 즉시 바뀐다.
- patch의 previous는 ISO 날짜만 담고 all-day flag를 직렬화하지 않는다. 낙관적 업데이트도 날짜만 바꾸므로 종일/시간 이동 직후 표시가 서버 응답 전까지 틀릴 가능성이 있다.
- `src/server/todos.ts` columns는 date-only를 종일, ISO를 timed로 처리한다. null은 날짜와 flag를 함께 지운다.
- TimeGrid는 minutes 0을 종일 행에 넣는다. todo와 ghost 모두 실제 allDay와 시간 좌표를 분리해야 한다.
- 같은 instant로 이동하면 onDragEnd가 반환하므로 같은 날 종일 ↔ timed 00:00 전환도 검증해야 한다.
- calendarView 쿼리는 coalesce(dueAt, scheduledAt), FE dateOf/allDayOf 및 drag 대상도 마감 우선이다. 표시 기준 추가는 서버 필터만 고쳐서는 완결되지 않는다.
- 빈 칸 생성, 월 날짜의 일 보기 전환, 연·월 직접 선택, 표시 기준 선택 UI는 현재 CalendarView에 없다.

## A: 추가 기능 4개 후보

### A1 빈 날짜/시간에서 할 일 추가

목표: 선택한 날짜/시간을 미리 채워 생성한다. 월 빈 칸·종일 행은 date-only, 시간 칸은 Asia/Seoul ISO를 사용한다. 카드 클릭·드래그가 생성을 중복 유발하지 않아야 한다.

계약/BE: 기존 생성 API와 소유자 검증을 재사용하고 별도 스키마 변경을 피한다. 기존 생성 UI와 필수 area 입력 경로를 먼저 조사한다. FE: 취소·실패 시 입력 보존, 저장 후 현재 범위 refetch, 키보드와 모바일 접근 지원. 수용: date-only 종일/시간 timed 저장, 취소 무변경, 실패 후 재시도, 카드 상세와 드래그 회귀 없음.

### A2 월간 날짜에서 하루 상세

목표: 월 날짜 번호를 누르면 해당 날짜의 기존 일 보기로 이동한다. 빈 셀 생성과 날짜 번호 이동의 클릭 대상을 구분한다.

계약/BE: 기존 `#/calendar/day/YYYY-MM-DD`와 GET calendar를 재사용한다. FE: 날짜 번호를 이름 있는 버튼/링크로 제공하고 오늘·인접 월 날짜에도 동일하게 동작한다. 수용: 정확한 날짜의 제목/데이터, 새로고침·뒤로 가기, 카드 상세와 더보기 유지.

### A3 연·월 직접 선택

목표: 이전/다음 반복 클릭 없이 지정한 연·월로 이동한다. 기존 mode를 유지하고 선택 월의 1일로 이동하는 최소안을 사용한다.

계약/BE: 유효한 YYYY-MM 날짜만 URL로 전달, 서버 API와 DB 변경 없음. FE: 기존 제목 주변에 선택 UI, 취소/키보드/모바일 처리. 수용: 12월↔1월, 윤년 2월, 잘못된 입력에서 이동하지 않음, URL 복원 및 빠른 연속 선택에서 최신 범위 유지.

### A4 마감일/예정일 표시 기준

목표: 현재 마감 우선 기본값을 유지하면서 마감일/예정일 기준을 선택한다. 후보 enum은 `effective | due | scheduled`이며 순수 due/scheduled에서 선택 필드가 없는 항목은 날짜 그리드에서 제외한다. 날짜 없음 사이드바는 두 날짜 모두 없는 할 일을 뜻하도록 유지한다.

계약/BE: `src/server/routes/todos.ts` query validation, `src/server/todos.ts` calendarView, `src/contracts/items.ts` 필요 여부를 함께 검토한다. todayView의 기존 calendarView 호출 기본 동작을 보존한다. FE: dateOf/allDayOf/place/drag/undo가 선택한 동일 필드를 사용한다. recurring ghost의 anchor와 선택 필드 부재 처리도 명세에 고정한다. 수용: 두 날짜가 서로 다른 월인 할 일, 필드 하나/둘/없음, 완료·보관·타인 데이터, 반복 ghost를 API·FE 일치로 검증한다. 설정 영속화는 자동으로 범위에 추가하지 않는다.

A 공통: 이미 동의한 일요일 시작 및 재현된 버그 수정도 포함한다. B의 수정 명세를 공통 선행 변경으로 배분하되 4개 기능 티켓의 책임과 커밋에 명시하고 별도 티켓을 임의로 늘리지 않는다.

## B: 추천 첫 묶음 4개 후보

### B1 일요일 시작

목표/범위: 월·주 보기를 일~토로 통일. 계약/BE: Asia/Seoul 날짜와 inclusive API range 유지, DB 변경 없음. FE: calendar-dates weekStart/monthGrid 및 CalendarView weekdayNames와 주 보기 범위 일치. 수용: 일요일 자신은 주 시작, 토요일은 직전 일요일, 월말/연말/윤년 격자가 7의 배수이며 날짜 누락·중복 없음. 기존 월요일 기대 테스트를 갱신한다.

### B2 드래그 되돌리기에서 종일 속성 복원

목표/범위: due/scheduled 각각 날짜·종일 여부·null을 이동 전과 동일하게 복원한다. 계약/BE: 기존 date-only/ISO/null PATCH 계약을 유지한다. FE: previous는 원래 flag에 맞게 date-only 또는 ISO로 직렬화하고 낙관적 날짜와 flag도 함께 갱신한다. 같은 instant라도 종일 여부 전환이면 PATCH한다. 수용: 종일→다른 날→undo, 종일→시간→undo, timed→종일→undo, 날짜 없음 이동과 두 날짜 동시 clear/undo, PATCH 실패 복구 및 새로고침 후 DB/API 일치.

### B3 최신 범위 응답과 제목/내용 일치

목표/범위: 오래된 성공/실패가 최신 화면을 덮지 않게 하고 로딩/실패 중에도 다른 범위 데이터를 현재 제목 아래 표시하지 않는다. 계약/BE: GET calendar 응답 계약 유지. FE: 요청 세대 또는 동등한 최신성 검사와 범위에 귀속된 로딩/오류 상태. load의 effect뿐 아니라 detail 저장/recurrence refetch도 포함한다. 수용: A 느림/B 빠름, B 실패 후 A 성공, A 실패/B 성공, 완료 토글·token 변경·refetch·unmount. loading/error/empty/content 모두 요청 범위와 일치한다.

### B4 timed 자정과 종일 구분

목표/범위: 실제 allDay flag로 행을 나누고 timed 00:00은 시간 그리드 최상단에 둔다. 계약/BE: Todo dueAllDay/scheduledAllDay, CalendarGhost allDay를 재사용하고 DB 변경 없음. FE: Entry의 종일 여부와 minutes 좌표를 분리한다. 수용: due와 scheduled의 종일/timed 00:00, 반복 종일 ghost/timed 00:00 ghost, 월·주·3일·일·목록 표시 및 드래그 후/undo 후 새로고침에서 의미 유지.

## 검증 실행 명세

초안 단계의 예정 명세를 아래에 보존한다. 실제 실행 완료: YG-50~53 전용 로컬 DB, 최종 200 tests/typecheck/build/browser 3개 통과. 실제 결과는 calendar-improvements-dispatch.md 및 최종 티켓의 docs/evidence/calendar-improvements/verification.md 참조.

1. 티켓 worktree에서 lockfile 기반 의존성을 준비한다. 로컬 Docker Postgres 가용성을 확인하고 티켓 전용 `yggdrasil_yg<n>` DB만 만든다. 운영 DB/기존 사용자 DB는 사용하지 않는다.
2. 전용 DATABASE_URL을 프로세스에만 넘겨 `npm run db:migrate`; 테스트 setup의 DB 보호 검사 유지. credential 값은 로그에 출력하지 않는다.
3. 기존 `test/calendar.test.ts`, `test/yg38-all-day.test.ts`와 `test/yg30-browser.mjs`를 읽고 위 수용 기준으로 red 재현을 먼저 추가/실행한다. 요청 역순은 Playwright route 지연/응답 순서 제어로 재현한다.
4. `DATABASE_URL=<전용 로컬 DB> npx vitest run --dir test`, `npm run typecheck`, `npm run build`를 실행해 출력과 exit code를 남긴다.
5. 기존 `test/yg30-browser-server.ts`는 DB 이름 `/yggdrasil_yg30`을 강제한다. 이 fixture를 다른 DB에 무리하게 실행하지 말고 티켓 전용 fixture로 필요한 seed와 안전한 DB assert를 준비한다. 기존 포트 3030 점유도 확인한다.
6. 전용 DB와 로컬 서버에서 desktop/mobile browser acceptance를 수행하고 screenshot, API 날짜·flag assertion, console/network 오류를 확인한다. fixture를 종료한다.
7. 티켓별 결과·실패·PR URL·실제 YG 키를 기록한다. 테스트 실패는 직접 원인을 읽고 수정 후 재시도하며 반복 실패를 숨기지 않는다.

공통 trust rule: 캡처 보존, 기존 승인 경계·소유자 격리·활동 로그 보존. MCP는 사용자 요청 범위의 티켓 변경에만 사용하고 사용자 DB 직접 조작으로 티켓 등록을 우회하지 않는다.
