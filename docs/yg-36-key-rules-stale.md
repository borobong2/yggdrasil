# YG-36 티켓 키 규칙 · YG-41 방치 감지

## 목표

- YG-36: 에픽에 기본 접두사를 두면 그 에픽의 새 할 일에 키가 자동으로 붙는다. 키 없는 할 일은 상세에서 「티켓으로 승격」. 키는 지우지 않는다(GitHub 추적이 키에 기댄다).
- YG-41: 오래 마감이 지났거나 한동안 그대로인 할 일을 오늘 탭·MCP에 **제안만** 한다. 자동으로 옮기지 않는다.

## 계약 (migration 0017)

- `epics.key_prefix` (nullable, CHECK `^[A-Z][A-Z0-9]{0,9}$` = `normalizePrefix`). 데이터 단계: 목표 `프로젝트` 아래 `yggdrasil` 에픽에 `YG`(없으면 아무 일 없음). 새 테이블 없음 → RLS 그대로.
- 생성 시 `prefix`: 생략 = 에픽 기본값(없으면 키 없음), 문자열 = 그 접두사, `null` = 키 없음. 경로: UI `POST /api/issues`, MCP `create_todo`/`create_todos`, import(`createTodo`). 새로 생기는 에픽은 기본값이 없다. 반복 다음 회차·납품 계획 수락은 키를 붙이지 않는다(기존과 같음).
- 에픽을 옮기는 수정은 키를 붙이지 않는다(“새 할 일”만).
- `Epic.keyPrefix`, `EpicPrefix`, `StaleTodo`, `StaleView` (`src/contracts/items.ts`). 임계값은 `src/contracts/stale.ts` 한 곳: `STALE_OVERDUE_DAYS = 14`, `STALE_UNTOUCHED_DAYS = 30`.
- 방치 = 상태 todo/doing(backlog·done 제외), 보관 안 됨, 진행 중인 반복 시리즈 아님(일시정지 시리즈 회차는 포함), 그리고
  (a) 마감이 14일 이상 지남 — 종일은 서울 날짜 차이, 시각은 instant 차이 — 또는 (b) 30일 이상 `updated_at` 그대로.
  보류(대기·막힘·예정) 할 일은 (b)만 본다: 보류 시각 컬럼이 없어 `updated_at`을 “보류한 지” 대용으로 쓴다.

## BE

- `promoteTodo(owner, id, prefix?)` → `POST /api/todos/:id/promote` `{ prefix? }`. 이미 키가 있으면 그대로, 접두사도 에픽 기본값도 없으면 400.
- `listEpicPrefixes` / `setEpicPrefix` (ticket-keys.ts) → `GET /api/ticket-prefixes`, `PUT /api/ticket-prefixes/:epicId` `{ prefix: string | null, start? }`. `start`는 `ensureCounterStart`(카운터를 절대 뒤로 돌리지 않음).
- `staleView(owner, now?)` → `GET /api/todos/stale`, MCP `todo://stale`, `todo://today` 첫 줄에 `· 방치 N건`.

## FE

- 오늘: 맨 아래 접힌 「방치된 할 일 N건」(0건이면 숨김). 펼치면 사유 칩(`마감 23일 지남`, `47일 동안 그대로`)과 YG-26 일괄 작업(완료·백로그로·미루기·보류).
- TodoDetail: 키 없는 할 일에 접두사 입력(비우면 에픽 기본값) + 「티켓으로 승격」. 키는 머리 줄에 표시.
- 기획 생성 폼: 이슈 유형에 「티켓 키」 토글, 고른 에픽의 기본값으로 켜지고 접두사가 채워진다. 끄면 `prefix: null`.
- 설정 › 티켓 접두사: 에픽 선택 + 접두사 + 시작 번호, 접두사가 있는 에픽 목록(다음 번호).

## 검증

- `npx vitest run --dir test` (`test/yg36-key-rules-stale.test.ts` + 기존), `npm run typecheck`, `npm run build`, `git diff --check`
- 브라우저: `NODE_ENV=test DATABASE_URL=…/yggdrasil_yg36 npx tsx test/yg36-browser-server.ts` 후 `node test/yg36-browser.mjs <dir>`

## 한계

- 같은 접두사를 여러 에픽에 둘 수 있다(카운터 공유, 키는 owner 안에서 유일).
- 보류 기간은 `updated_at` 대용이라 보류 중 메모만 고쳐도 다시 30일을 센다.
