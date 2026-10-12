# YG-25 · YG-26 — 오늘 첫 화면 + 일괄 정리

## 목표

앱을 열면 "오늘"이 먼저 보이고, 쌓인 할 일을 여러 개 골라 한 번에 정리한다. (YG-27 빠른 추가는 소유자가 취소: 할 일 추가는 MCP로 한다.)

## 계약

- `GET /api/todos/today` (owner-scoped) → `TodayView { date, today, overdue, waiting, week }`. `today/overdue/waiting`은 MCP `todo://today|overdue|waiting`과 같은 `todayView()`. `week`(이번 주 예정)는 내일~7일 뒤 마감 또는 예정, 대기/막힘 제외, `today`에 이미 있으면 제외.
- `POST /api/todos/bulk` (owner-scoped, 한 transaction, id 1~200개·중복 불가):
  - `{action:'complete'|'backlog', ids}`
  - `{action:'snooze', ids, until:'YYYY-MM-DD'}` — 마감일 설정. 보류가 `예정`이면 예정일을 옮긴다.
  - `{action:'hold', ids, hold:'waiting'|'blocked', holdReason?}`
  - `{action:'restore', items: TodoSnapshot[]}` — 직전 응답의 `previous`를 그대로 보내면 되돌린다(되돌리기 토스트).
  - 응답 `BulkResult { todos, previous }`. 다른 사용자 id가 하나라도 있으면 404, 아무것도 쓰지 않는다. 바뀐 이슈마다 활동 `payload.via='ui'`, `payload.bulk=<action>`. 변화 없는 항목은 기록하지 않는다.
- 반복 할 일(YG-28): 일괄 완료는 같은 transaction에서 `spawnNext`로 다음 회차를 만든다. `restore`는 다음 회차가 이미 열린 반복 회차를 다시 열지 않고 `skipped`로 돌려준다(시리즈당 열린 회차 1개 유지, 삭제 없음).
- migration 없음.

## FE

- 내비 첫 탭 `오늘`(기본 화면). 섹션: 오늘 할 일 · 마감 지남(마감 지난 항목은 여기만) · 대기·막힘 · 이번 주 예정. 카드 클릭 → 보드와 같은 `TodoDetail`. 동그란 체크 → 즉시 완료(낙관적, 실패 시 복구+안내).
- 선택: 데스크톱은 체크박스 + Shift 범위 선택, 모바일은 길게 누르기(오늘) 또는 `선택` 버튼(오늘·보드) → 탭으로 선택. 하단 일괄 바: 완료 / 백로그로 / 미루기(내일·다음 주 월요일·날짜) / 보류(대기·막힘+사유). 실행 후 10초 되돌리기 토스트.

## 파일

`src/contracts/items.ts`, `src/server/todos.ts`(week 섹션, helper export), `src/server/todo-bulk.ts`, `src/server/routes/todos.ts`, `src/client/TodayView.tsx`, `src/client/BulkActions.tsx`, `src/client/BoardView.tsx`, `src/client/main.tsx`, `test/today-bulk.test.ts`, `test/yg25-browser-server.ts`, `test/yg25-browser.mjs`.

## 검증

```sh
export DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg25
npm run db:migrate && npx vitest run --dir test && npm run typecheck && npm run build && git diff --check
NODE_ENV=test npx tsx test/yg25-browser-server.ts &
node test/yg25-browser.mjs tmp/yg25-screens   # CHROME_PATH로 Chromium 지정 가능
```
