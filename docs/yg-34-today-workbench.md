# YG-34 — 오늘 작업대 (A 3단 + B 정리 모드)

## 목표

오늘 화면이 넓은 화면에서도 가운데 좁은 카드 한 줄(모바일 같은 모양)이었고, 마감 지난 일이 「마감 지남」과 「방치」에 두 번 나왔다. 시안 [docs/design/yg-34-today-layouts.html](design/yg-34-today-layouts.html)의 **A(3단 작업대) + B 정리 모드**로 바꾼다.

## 계약

- `GET /api/todos/today` → `TodayView`에 두 필드 추가. 기존 `today/overdue/waiting/week`는 그대로(MCP `todo://today|overdue|waiting|stale` 변경 없음).
  - `late: LateTodo[]` — 밀린 일. 보류·백로그가 아닌 todo/doing 중 **마감일(서울 날짜)이 오늘 이전**인 것 ∪ YG-41 방치(`staleView`)를 id당 한 번. `lateDays`(마감 지난 날, 종일·시각 모두 서울 날짜 차이), `untouchedDays`, `age = lateDays ?? untouchedDays`, `bucket`: `recent`(≤3일) / `month`(≤30일) / `older`. 오래된 순. 오늘 앞선 시각에 마감된 일은 오늘 할 일에 남는다(빨간 시각 배지).
  - `timeline: { todos, ghosts }` — 오늘 시각이 있는 할 일(마감, 없으면 예정) + 반복 시리즈의 다음 회차(`calendarView`와 같은 계산).
- `POST /api/todos/:id/archive`, `POST /api/todos/:id/unarchive` (owner-scoped, YG-39 `setArchived`, 활동 `via: 'ui'`). 다른 사용자 id → 404.
- 정리 모드 결정은 기존 API를 쓴다: 완료 `/complete`(옵션 `completedAt` = 마감일), 오늘·다음 주 = bulk `snooze`(종일), 백로그 = bulk `backlog`, 대기 = bulk `hold waiting`(+사유), 보관 = archive. 되돌리기는 bulk `restore`(스냅샷) 또는 unarchive.
- migration 없음. 새 의존성 없음.

## FE

- `TodayView`: ≥1100px 3단(타임라인 | 오늘 할 일 | 밀린 일·기다리는 중·이번 주 예정), 720–1100px 2단(타임라인 위), <720px 세그먼트 탭 오늘 / 밀린 일 / 예정.
- 오늘 할 일: 한 줄 행(~36px), 동그란 체크(낙관적 완료), 키 배지, 우선순위, 시각/마감 배지, 영역, hover 내일·완료. 클릭 → `TodoDetail`. 헤더 P 개수. YG-26 다중 선택 유지.
- 밀린 일 레일: 나이 묶음(개수·비율 막대·상위 3개·`+n개`), 「전부 백로그로」(되돌리기 토스트), 「하나씩 정리」.
- `TriageDialog`: 한 장씩, 오래된 순. D/T/W/B/H/A 결정, U 되돌리기, Esc 닫기, aria-live 안내, 끝 화면 「밀린 일 0 🎉」+ 결정별 개수. 데스크톱 가운데 대화상자, 모바일 전체 화면.

## 파일

`src/contracts/items.ts`, `src/contracts/stale.ts`, `src/server/todos.ts`, `src/server/routes/todos.ts`, `src/client/TodayView.tsx`, `src/client/TriageDialog.tsx`, `src/client/BulkActions.tsx`(날짜 helper export), `test/yg34-today-workbench.test.ts`, `test/yg34-browser-server.ts`, `test/yg34-browser.mjs`, `test/yg25-browser*.{ts,mjs}`, `test/yg36-browser*.{ts,mjs}`.

## 검증

```sh
export DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg34
npm run db:migrate && npx vitest run --dir test && npm run typecheck && npm run build && git diff --check
NODE_ENV=test npx tsx test/yg34-browser-server.ts &
node test/yg34-browser.mjs tmp/yg34-screens   # CHROME_PATH로 Chromium 지정 가능 (yg25/yg36도 같은 DB로 실행 가능)
```

## 한계

- 되돌리기도 변경이라 `updated_at`이 바뀐다: 「오래 안 건드림」으로만 방치였던 일은 되돌린 뒤 밀린 일에서 빠진다.
- 「전부 백로그로」는 한 번에 200개까지(bulk 상한).
- 앱 전체가 라이트 테마 전용이라 다크 모드는 이 티켓 범위 밖.
