# YG-50~53 검증 증거 (2026-10-17)

전용 로컬 DB만 사용: yggdrasil_yg50/51/52/53, Postgres 127.0.0.1:54330. 사용자/운영 DB를 사용하지 않았다. fixture는 DB 이름과 loopback 호스트를 검사하고 매번 새로운 dev owner를 생성한다. 실제 로그인 세션과 실제 터치 하드웨어는 검증 범위에 포함하지 않는다.

- YG-50: typecheck/build, 전체 39 files/197 tests 통과; 생성 API red 404 → green; Chrome desktop/mobile 생성·취소·종일/timed·이동 undo·scheduled null·두 날짜 clear 복원.
- YG-51: typecheck/build, 관련 8 tests, 일요일/월말/연말/윤년, 월 날짜 클릭→하루 및 desktop/mobile acceptance.
- YG-52: typecheck/build, 관련 8 tests, 역순 성공/실패·최신 실패·재시도·loading 범위 일치·완료 토글·연월 선택/윤년·지원 연도 1900~2100·보기 변경 후 undo.
- 최종 YG-53: typecheck/build 통과. `DATABASE_URL=<yggdrasil_yg53> npx vitest run --dir test`: 41 files / 200 tests passed. 기존 plan-acceptance rollback test의 `forced document failure`는 의도적 stderr이며 통과한다.
- 최종 새 fixture에서 `CALENDAR_STAGE=53 node test/calendar-browser.mjs`, `node test/calendar-navigation-browser.mjs`, `node test/calendar-basis-browser.mjs` 모두 exit 0.
- 추가 browser acceptance: 실패한 생성 입력 보존·재시도, 카드 상세/생성 분리, due/scheduled/effective, 선택 필드 생성·키보드 이동·undo와 다른 필드 보존, 자정 timed/ghost와 종일 행 구분, 5개 보기 존재.
- 독립 read-only review: YG-52 P2 두 건(이동 뒤 undo stale view, 극단 연도 picker) 수정 후 재검증. YG-53 추가 actionable finding 없음.

재실행:

```sh
# 해당 티켓 worktree에서, DATABASE_URL은 그 티켓 전용 로컬 DB로만 설정
npm run typecheck
npm run build
npm run db:migrate
npx vitest run --dir test
# 테스트 종료 후 실행 (동일 DB fixture와 테스트를 동시에 실행하지 않는다)
NODE_ENV=test npx tsx test/calendar-browser-server.ts
# 별도 터미널
CALENDAR_STAGE=53 node test/calendar-browser.mjs
node test/calendar-navigation-browser.mjs
node test/calendar-basis-browser.mjs
```

Chrome 기본 실행 경로는 macOS Google Chrome이며 CHROME_PATH로 바꿀 수 있다. browser suite는 새 fixture owner에서 시작한다. fixture 포트는 3050이다.

테스트 조정: overflow의 숨은 chip은 visible locator/분산 seed로 피했고 보기 전환 DOM 및 keyboard drag 측정을 기다린다. 자정 timed를 기대한 seed의 date-only 입력을 ISO로 바로잡은 뒤 통과했다. 이 문서는 실패한 실행을 통과로 대체해 기록하지 않으며 각 원인을 위와 같이 남긴다.

스크린샷: yg53-desktop.png, yg53-mobile.png, yg53-basis.png. 생성 폼과 전체 날짜 제목의 모바일 가시성, 목록의 00:00 반복 미리보기를 시각 확인했다.
