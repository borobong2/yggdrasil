# YG-29 아침 브리핑 자동 발송

## 목표

매일 아침(기본 07:00 KST) 앱 소유자에게 텔레그램으로 오늘 할 일 요약을 한 번 보낸다. 범위 밖: 여러 사용자/채널, 메시지 안 버튼·답장 처리, 저녁 회고.

## 계약 (migration 0018)

- `briefing_settings(owner_id PK, enabled bool default true, send_time text 'HH:mm' default '07:00', last_sent_date date)`, RLS 켬. 행이 없으면 기본값.
- `BriefingSettings` (`src/contracts/items.ts`): `{ enabled, sendTime, lastSentDate, missing, isOwner }`.
- 서버 env(Secret Manager, 모두 선택): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `BRIEFING_OWNER_ID`(UUID), `BRIEFING_SECRET`.

## BE (`src/server/briefing.ts`, `routes/briefing.ts`)

- `buildBriefing(todayView, staleView, now)` 순수 함수, Telegram HTML(`& < >` 이스케이프). 날짜 줄 / 오늘 할 일(최대 8, P1 먼저, 그다음 시각순, 키) / 밀린 일 = `todayView.overdue`(건수, 가장 오래된 일수, 상위 3) / 기다리는 중·방치 건수 / 오늘 반복 / 앱 링크. 마감 지난 일은 밀린 일에만, 반복 회차는 오늘 반복에만 나온다.
- `sendTelegram`: fetch, 10초 타임아웃, 네트워크·429·5xx면 1회 재시도. 오류 메시지에 URL(토큰) 없음.
- `runBriefing(owner, { now, force })`: 행 잠금 트랜잭션 안에서 enabled·`now ≥ send_time`·오늘 미발송 확인 → 전송 → `last_sent_date` 기록. 실패 시 롤백(다음 실행이 재시도). `force`는 검사·기록 없이 전송.
- `POST /api/briefing/run` (공개, `X-Briefing-Secret` 상수 시간 비교): 비밀 미설정 503, 틀림 401, 텔레그램/owner 미설정 503(빠진 이름), 전송 실패 502. `?force=1`.
- `GET/PUT /api/briefing/settings`, `POST /api/briefing/test` (세션). 테스트는 `BRIEFING_OWNER_ID` 본인만(403).

## FE

설정 › 아침 브리핑: 매일 보내기 체크, 보낼 시각, 저장, 「지금 테스트 보내기」, 마지막 발송일, 미설정 안내.

## 운영

`scripts/briefing-setup.sh <PROJECT_ID>` + [docs/deploy/briefing.md](deploy/briefing.md). 스케줄 `*/30 6-23 * * *` Asia/Seoul.

## 검증

`npx vitest run --dir test` (`test/briefing.test.ts`), `npm run typecheck`, `npm run build`, `git diff --check`.
