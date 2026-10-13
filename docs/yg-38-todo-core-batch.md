# YG-38 · YG-35 · YG-39 · YG-37 · YG-40 할 일 서버·MCP 개선

## 목표

- YG-38: 날짜만 넣은 마감·예정은 그날 종일이다. 하루 종일 "기한 지남"으로 보이지 않는다.
- YG-35: MCP `create_todo`가 병렬에서도 줄 서지 않고, 왕복 수가 적다. `read_planning_tree`는 메모를 줄여 보낸다.
- YG-39: MCP `get_todo`·`list_todos`·`archive_todo`·`unarchive_todo`, `id` 대신 키(`YG-24`)도 받는다.
- YG-37: 완료 시각을 남기고(모든 완료 경로), 지난 날짜로 완료할 수 있다.
- YG-40: `create_todos`로 최대 50개를 한 transaction에 만든다.

## 계약 (migration 0015)

- `issues.due_all_day`, `issues.scheduled_all_day` (boolean, 기본 false). 날짜만(`YYYY-MM-DD`) → 그날 00:00 KST + 플래그 true, ISO 시각 → false, null → 둘 다 지움. 기존 `15:00:00Z`(= 00:00 KST) 값은 종일로 이관(시각 있는 반복 시리즈 회차 제외).
  - 별도 date 컬럼 대신 플래그를 고른 이유: 정렬·캘린더·`nextSlot`이 모두 같은 instant 하나로 계속 동작하고, 바뀌는 건 "지남" 판정과 표시뿐이다.
- 지남: 종일은 서울 날짜 < 오늘, 시각은 instant < 지금 (`src/contracts/dates.ts` `isOverdue`, `todayView().overdue` 같은 규칙).
- 표시: UI 배지 종일 `10/13`, 시각 `10/13 21:00`. MCP 텍스트는 연도 포함 `2026-10-13` / `2026-10-13 21:00`.
- `issues.completed_at`: 트리거 `issues_completed_at`가 done이 될 때 채우고(작성자가 준 값 우선), done이 아니면 지운다. CHECK `(status = 'done') = (completed_at IS NOT NULL)`. 기존 done 행은 마지막 완료 활동 시각, 없으면 `updated_at`.
  - 트리거를 고른 이유: 완료 경로가 서비스·일괄·보드 이동·레거시 `/api/issues`·GitHub webhook·import로 흩어져 있어 한 곳에서 지킨다.
- `completedAt` 입력: 날짜만 → 그날 12:00 KST(지금보다 늦으면 지금). 23:59:59는 "오늘"이 미래가 되어 거절되므로 정오. 미래(날짜는 오늘 이후, 시각은 지금+5분 이후) 거절. done이 아닌 할 일에 주면 400.
- 반복: 다음 회차 = max(이번 회차 슬롯, completedAt) 이후 첫 슬롯. completedAt 없으면 지금(기존과 같음).
- `issues.archived_at`: 보관. 오늘·캘린더(할 일·날짜 없음·ghost)·보드/`/api/issues`·계획 트리·영역 리소스·검색·`list_todos`에서 빠진다. `get_todo`/`todo://issue/{id}`는 보관된 것도 읽는다. 활동 `issue.archived`/`issue.unarchived`.

## BE

- `createTodos` (todos.ts): 한 transaction에 Goal/Epic 일괄 조회(없을 때만 owner advisory lock 후 생성), 상태별 위치 한 번, prefix별 키 한 번(`allocateKeys`, 순서대로 연속), 다중 insert 두 번(issues, activities). `createTodo`는 1개짜리 호출.
- `updateTodo`: 반복 재조회 제거. `completeTodo(…, completedAt?)`, `setArchived`, `todoIdOf({ id | key })`, `listTodos(filter)`.
- MCP 할 일 도구·리소스는 `src/server/mcp-todos.ts`로 분리. 검증 실패는 SDK가 `at items[3].title`처럼 항목별로 알려주고 아무것도 쓰지 않는다.
- `POST /api/todos/:id/complete`는 선택 body `{ completedAt }`, `PATCH /api/todos/:id`는 `completedAt`도 받는다.

## FE

- `DueBadge`·오늘·계획·캘린더 배지가 공용 `isOverdue`/`formatDue`를 쓴다. 캘린더 종일 행/시간표 구분과 끌어 옮기기는 플래그 기준.
- TodoDetail: 마감 시각은 플래그 기준(시각 00:00도 시각), 완료된 할 일에 `완료일` 날짜 입력.

## 검증

- `npx vitest run --dir test` (`test/yg38-all-day.test.ts`, `test/yg37-completed-at.test.ts`, `test/yg39-mcp-todo-tools.test.ts` + 기존)
- `DATABASE_URL=<local> npx tsx scripts/bench-mcp.ts [--rtt 30]`: 순차·병렬 create_todo, create_todos, update_todo 시간과 쿼리 수.
- 브라우저: 기존 `test/yg25-browser.mjs`, `yg28`, `yg30` 통과.

## 한계

- `list_todos` 페이지는 메모리에서 자른다(커서 = offset).
- 위치 계산은 잠그지 않아 동시 생성이 같은 위치를 받을 수 있다(정렬은 id로 갈리고 보드 이동이 다시 매긴다).
- 캘린더 시간표는 시각 00:00 할 일을 종일 행에 보여준다.
- 보관한 열린 반복 회차는 시리즈를 멈춘다(열린 회차가 남아 있는 것으로 본다). 보관은 MCP만, UI 버튼 없음.
