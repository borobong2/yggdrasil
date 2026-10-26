# YG-65 모바일 하단 내비게이션

기준: main `8cb785c`, 작업 브랜치 `borobong2/feat-yg-65-mobile-navigation`. 이 워크트리에서만 구현. main 변경·병합·배포 없음.

## 선택과 범위

기존 모바일 하단 9개 항목을 **오늘·보드·캘린더·더보기** 4칸으로 정리했다. 오늘은 실행할 일, 보드는 작업 상태, 캘린더는 날짜 탐색을 담당하므로 직접 접근 대상으로 골랐다. 사용 빈도 분석에 근거한 순위는 아니며, 인박스를 더 많이 쓰는 사용자에게는 한 번의 추가 조작이 필요하다.

더보기에는 기존 순서대로 인박스·문서·기획·활동·회고·설정을 배치했다. 기존 hash 라우팅, 세부 경로, 문서/기획/캡처 앵커, 데스크톱 9개 메뉴는 유지한다. 선택된 보조 목적지는 더보기 버튼의 배경과 접근 가능한 이름, 열린 패널 안의 `aria-current=page`로 표시한다. 핵심 탭도 색과 배경 및 `aria-current=page`로 구분한다.

변경 범위는 `src/client/main.tsx`의 MobileNav와 `styles.css`의 `.mobile-nav*` 선택자뿐이다. 기존 아이콘·토큰·포커스 스타일을 재사용했다. 서버, 데이터/소유자 격리, 캘린더 컴포넌트 및 전용 CSS, API·설정 저장 동작은 변경하지 않았다. 신규 의존성 없음. 적용 경로에서 AGENTS.md와 .ai는 발견되지 않았다.

## 상호작용과 접근성

브라우저 기본 `popover=auto`와 `popoverTarget`을 사용한다. 일반 내비게이션 링크이므로 menu 역할이나 별도 화살표 키 규칙을 추가하지 않았다. Tab으로 이동하고 Enter로 선택하며 Escape와 바깥 클릭으로 닫는다. 키보드 닫기/선택 뒤 더보기 버튼으로 포커스가 복귀한다. 동일 링크 선택, hash 변경, 데스크톱 전환 때도 닫힌다. 브라우저가 제공하는 펼침 상태와 popover 연결 관계를 이용한다. 장식 아이콘은 보조기술에서 숨긴다.

하단 버튼 높이 56px, 보조 링크 최소 48px이며 320px에서도 모든 타깃이 가로·세로 44px 이상이다. 하단 safe-area를 반영하고 패널은 낮은 화면에서 스크롤할 수 있다. 비활성 레이블도 기존 faint 대신 muted 색을 사용한다.

## 검증 (2026-10-26)

- `node test/yg65-browser.mjs docs/yg-65-screens`: Chrome headless, 모바일 터치 320/390/767×720, 데스크톱 1280×900. 9개 목적지, 설정 접근, 활성 표시, 세부 URL/앵커, 뒤로/앞으로, 같은 링크 재선택, 키보드 열기/선택/Escape/포커스 복귀, 바깥 클릭, breakpoint 전환, 44px 터치 영역 통과. pageerror 없음.
- 모든 `/api/**` 요청은 테스트가 로컬 응답으로 가로챈다. Vite만 사용했으며 운영 DB·테스트 DB 모두 접속하지 않았다. 화면은 빈 데이터와 일부 의도된 API 오류 상태다. 서버 통합 테스트는 변경 범위 밖이므로 실행하지 않았다.
- `npm run typecheck`, `npm run build`, `git diff --check` 통과.
- impeccable detector: 변경 UI 파일 대상 결과 `[]`.
- 320px 더보기와 데스크톱 설정 스크린샷을 직접 확인했다. 나머지 크기의 캡처도 아래 폴더에 포함한다.
- 테스트 재실행 중 인증 설정 로딩 전 링크 개수를 읽는 테스트 대기 누락을 발견해 내비게이션이 표시된 뒤 검사하도록 수정했다.

화면 증거: [320px 더보기](yg-65-screens/mobile-320-more.png), [390px 하단](yg-65-screens/mobile-390.png), [767px 더보기](yg-65-screens/mobile-767-more.png), [데스크톱 설정](yg-65-screens/desktop-settings.png).

## 제한과 후속 검토

실제 iOS/Android 하드웨어, Safari/Firefox, VoiceOver/TalkBack 음성 출력은 확인하지 않았다. native Popover API를 지원하는 브라우저가 필요하다. safe-area와 작은 높이 대응 CSS는 있지만 노치/가상 키보드가 있는 실제 기기 검증은 남는다. 모든 기존 메뉴의 탐색은 검사했지만 각 화면의 CRUD와 로그인/소유자 격리 통합 테스트는 재실행하지 않았다. 티켓 상태는 검토를 위해 변경하지 않았다.

## PR 병합 전 추가 검증 (2026-10-26)

사용자의 PR 생성·충돌 없을 때 병합 요청에 따라 전용 로컬 DB `yggdrasil_yg65`를 새로 만들고 마이그레이션했다. `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg65 npm test` 결과 45개 파일, 219개 테스트가 모두 통과했다. 운영 DB 접속 없음. 위 초기 검증의 서버 통합 테스트 미실행 제한은 이 추가 검증으로 해소했다. 브라우저 테스트, typecheck, build, diff 검사도 재실행해 통과했다. 실기기·다른 브라우저·음성 스크린리더 검증 제한은 그대로다.

PR #74 생성 중 YG-55 PR #73이 main에 병합되어 `styles.css` 끝부분 추가끼리 충돌했다. `origin/main` (`a97640b`)을 작업 브랜치에 병합하고 두 선택자 블록을 모두 보존해 해결했다. 캘린더 CSS 블록은 main과 바이트 단위 동일함을 assert로 확인했다. 통합 상태에서 전체 테스트 **46개 파일 / 221개 통과**, YG-65 브라우저 테스트, typecheck, build, staged diff 검사를 재실행해 모두 통과했다. GitHub Actions 검사 구성은 없다.
