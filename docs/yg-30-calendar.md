# YG-30 캘린더 뷰

## 목표

할 일을 날짜 위에서 보고 끌어서 옮긴다. 월·주·3일·일·목록 보기, 날짜 없는 할 일 사이드바, 반복 시리즈의 앞으로 회차 미리보기.

## 계약

- `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD[&done=1]` (owner 범위, 서울 날짜 포함 범위, 최대 62일) → `CalendarView { from, to, todos, undated, ghosts }`.
  - 할 일의 캘린더 날짜 = `dueAt`, 없으면 `scheduledAt` (서울 날짜). `done=1`이면 완료도 포함.
  - `undated`: 두 날짜가 모두 없는 열린 할 일.
  - `ghosts`: 일시정지 아닌 시리즈의 앞으로 회차. 열린 회차의 날짜와 지금 중 늦은 쪽(= `spawnNext`가 쓸 기준) 이후 `nextSlot`을 반복해 범위 안 슬롯만 낸다. DB 행은 만들지 않는다.
- 쓰기는 기존 `PATCH /api/todos/:id`만 쓴다(via='ui'). migration 없음.

## FE

- 탭 `캘린더` (`#/calendar/<month|week|3day|day|list>/<YYYY-MM-DD>`, 새로고침해도 위치 유지). 기본 보기: 데스크톱 월, 모바일 3일.
- 월: 칸마다 3개, 넘치면 2개 + `+n개 더` 팝오버. 주·3일·일: 종일 행 + 시간표(06시로 스크롤, 0–24시). 목록: 기준일부터 30일, 날짜 머리글.
- 끌어 놓기(@dnd-kit, 마우스·터치 길게 누르기·키보드 Space/방향키): 날짜 칸 → 시각 유지(종일은 종일), 시간 칸 → 카드 윗변 기준 15분 단위, 종일 행 → 종일, `날짜 없음`으로 → 날짜 지움(되돌리기 알림). 낙관적 갱신 후 실패하면 되돌린다.
- 반복 회차 날짜를 옮기면 YG-28의 이번 회차 예외다(규칙 그대로).

## 검증

- `npx vitest run --dir test` (`test/calendar.test.ts`: KST 경계, done, owner 분리, 주간·월말 ghost, 날짜 계산)
- 브라우저: `npm run build && NODE_ENV=test DATABASE_URL=…/yggdrasil_yg30 npx tsx test/yg30-browser-server.ts` 후 `node test/yg30-browser.mjs [dir]`

## 한계

- 키보드 이동은 시간표에서 1시간 단위다(마우스·터치는 15분).
- 같은 시간대 겹침은 그날 전체를 같은 폭의 열로 나눈다.
- 목록 보기는 기준일 이전(지난 마감)을 보여주지 않는다. 지난 마감은 월·주 보기에서 빨갛게 보인다.
- 시간대는 Asia/Seoul 고정.
