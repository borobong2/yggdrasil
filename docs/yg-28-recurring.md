# YG-28 반복 할 일

## 목표

한 사람이 매일·매주(요일 선택)·매월(n일) 반복하는 할 일을 만든다. 시리즈마다 열린 회차는 하나이고, 그 회차를 완료하면 다음 회차가 생긴다.

## 계약

- `recurrences` (migration `0014`, RLS on): `freq` daily|weekly|monthly, `weekdays` text[] (mon…sun, weekly만), `month_day` 1–31 (monthly만, 없는 날은 말일), `time` 'HH:mm' 또는 null(종일), `paused`.
- `issues.recurrence_id` → `recurrences.id` (ON DELETE SET NULL). 회차는 평범한 이슈다.
- 시간대는 Asia/Seoul 고정(DST 없음). 슬롯 = 서울 날짜 + `time`(없으면 00:00), `dueAt`에 저장.
- 입력: `todoFields.recurrence` (`create_todo`/`update_todo`/`PATCH /api/todos/:id`). `null`이면 시리즈 종료(규칙 행 삭제, 회차는 남음).

## 생성 규칙

- 완료(UI 완료·저장, 보드 이동, 기획 상태 변경, MCP, webhook 병합)와 같은 transaction에서 `spawnNext`가 다음 회차를 만든다. cron 없음.
- 다음 슬롯 = max(지금, 완료한 회차 날짜) 이후 첫 슬롯 → 놓친 회차는 건너뛴다.
- 일시정지·종료 시리즈, 또는 이미 열린 회차가 있으면 만들지 않는다(중복 완료·재시도 안전). 시리즈 행 잠금으로 동시 완료를 직렬화한다.
- 완료된 회차에서 일시정지를 풀면(또는 규칙을 붙이면) 다음 회차를 한 번 만든다.
- 예외: 회차의 마감일/시각만 바꾸면 그 회차만 옮겨진다. 규칙 변경은 다음 회차부터 적용된다.
- 다음 회차는 제목·Epic·우선순위·메모·예상 시간·출처를 복사하고 상태는 `todo`, 키는 없다.

## FE

카드에 `반복` 배지(정지 시 `반복 정지`). `TodoDetail`에 반복 fieldset(주기, 시각, 요일 토글, 월 날짜, 일시정지)과 반복 회차용 `마감 시각`.

## 검증

- `npx vitest run --dir test` (`test/recurrences.test.ts`), typecheck, build
- 브라우저: `NODE_ENV=test DATABASE_URL=…/yggdrasil_yg28 npx tsx test/yg28-browser-server.ts` 후 `node test/yg28-browser.mjs`

## 한계

- 회차를 원래 슬롯보다 앞당겨 완료하면 다음 회차는 앞당긴 날 이후 첫 슬롯이라, 같은 주의 원래 슬롯이 다시 나올 수 있다.
- 반복 종료 날짜·횟수, 격주, 여러 시간대는 없다.
