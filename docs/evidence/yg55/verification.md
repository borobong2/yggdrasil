# YG-55 검증 — 2026-10-26

- 기준 `8cb785c`, 이 워크트리만 변경. AGENTS/.ai 없음. 외부 원본 기능정의 파일 없음.
- `npm ci` 완료. lockfile 수정 없음. npm audit가 기존 의존성 취약점 17개(8 moderate/6 high/3 critical)를 보고했으며 이 티켓에서 자동 업그레이드하지 않았다.
- 새 `yg55-layout.test.ts`는 helper 부재로 실패를 확인한 뒤 구현. 연결 겹침/독립 폭/마감 추정시간 무시/예정 추정시간/자정 clipping/기본값 2 tests 통과.
- 전용 `yggdrasil_yg55` DB migrate 완료. `DATABASE_URL=<전용 DB> npm test`: **46 files / 221 tests 통과**, 약 49초. 기존 calendar/YG50/51/53/64/소유자 격리 테스트 포함.
- `npm run typecheck`, `npm run build`, `git diff --check` 통과.
- `node test/yg55-browser.mjs` 통과: bare 주간/명시 5보기, 일~토, 3개 겹침과 단독 full width, 마감 180분 추정치를 24px 시점 표시로 유지, 자정 예정, 23:45 예상90분을 자정에서 자름, 종일9개 전체 popover, ghost, sticky 헤더, 1440×900/1280×800/390×844, 페이지 가로 넘침 없음, 모바일 가로탐색/하루 이동, 생성, 키보드 이동/undo와 API scheduledAt/allDay 복원·dueAt 보존, pageerror 없음.
- `CALENDAR_BASE=http://127.0.0.1:3055 node test/calendar-navigation-browser.mjs` 통과: 늦은 성공/실패 무시, loading 범위 일치, 최신 실패와 retry, 연월/윤년/범위 밖 입력, 완료 필터 새 query.
- Impeccable detector: `[]`.
- 브라우저 초기 실패는 숨겨진 month popover 카드 선택, day에 발생하지 않는 ghost 대기, 접힌 undated에 대한 기존 테스트 가정, 키보드 DnD 렌더 완료 전 이벤트 진행이었다. fixture/대기·선택자를 실제 화면에 맞게 수정 후 통과. 첫 시각 점검에서 종일 중첩 세로스크롤을 발견해 더 보기로 수정 후 확인.

재현: `DATABASE_URL=<loopback yggdrasil_yg55> npx tsx test/yg55-browser-server.ts` 실행 후 위 두 browser 명령. fixture는 매번 임의 owner를 만들고 DB명/호스트를 assert한다. 브라우저 fixture는 별도 프로세스로 테스트 전체 suite가 끝난 후 실행한다.

[데스크톱](desktop.png), [모바일](mobile.png)

## 제한

실제 로그인 세션, 물리 터치 기기, Safari/Firefox는 확인하지 않았다. Chrome 모바일 viewport로 검증했다. 긴 제목/아주 짧거나 자정 직전 블록은 잘릴 수 있어 전체 내용은 상세/tooltip으로 확인한다. 자정을 넘는 예상시간은 해당 날짜에서만 표시한다. 프로젝트 색 설정/상세 사이드 패널/보기 영속화는 이번 최소 구현에 포함하지 않았다. 예정시간이 없을 때 30분과 짧은 작업 최소20분은 배치를 위한 표시 공간이며 새로운 종료시각 계약이 아니다. 병합/배포 전까지 티켓은 doing으로 유지한다.
