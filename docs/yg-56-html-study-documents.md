# YG-56 — HTML 문서와 모바일 시험 공부

- 상태: 구현 및 로컬 검증 완료, PR 검토 단계. 운영 배포·자료 게시 미실행.
- 사용자 결과: 이그드라실 문서 안에서 HTML 학습 자료를 읽고 편집한다. 새로 만든 시험 문서 7개를 모두 모바일용 HTML로 제공한다.
- 설계: `docs/superpowers/specs/2026-10-19-html-study-documents.md`
- 실행 계획: `docs/superpowers/plans/2026-10-19-html-study-documents.md`
- 티켓: YG-56 (`e3daec9b-590e-4a7f-ad6f-92c80ef1a18f`)
- 브랜치/worktree: 승인 후 `feat/yg-56-html-study-documents`, `.worktrees/yg-56`.

## 범위와 계약

Document.format은 markdown/html이고 기본값 markdown. DB migration, service, REST, MCP, UI를 같은 티켓에서 변경한다. 본문 100,000자 제한을 유지한다. HTML은 원문 보존, 읽기/소스 편집 전환. 기존 Markdown 문서·진도·질문·ID 보존. 기존 기록에 링크를 추가할 때 먼저 최신 내용을 읽는다.

## BE / FE 책임

BE: 계약·스키마·마이그레이션·service·routes·MCP format 처리 및 검증, owner 격리와 기존 동작 회귀 테스트.
FE: DOMParser allowlist + iframe sandbox/CSP로 HTML 미리보기 격리, 소스 편집, 현재 저장 상태 활용, 모바일 문서·표·코드·정답 펼치기.
콘텐츠: 기존 시험 범위로 생성한 7개 자료의 HTML 판본, 링크, 업로드 manifest, 재실행 중복 방지와 읽기 검증.
순서: 계약/BE → FE/브라우저 → 자료 변환 → 전체 검증/리뷰/배포 → 운영 자료 게시. 현재 별도 에이전트 작업은 요청되지 않았고 실행 방식은 계획 검토 시 선택한다.

## 검증과 보존

정확한 파일과 테스트는 연결한 실행 계획에 명시. 전용 yggdrasil_yg56 DB에서 실패 테스트 확인 후 구현. npm test/typecheck/build, git diff --check, Playwright 360/390/768 너비와 격리 공격 테스트. 운영에서는 health와 문서 생성·읽기·모바일 동작 확인만 하고 테스트 데이터를 DB에서 truncate하지 않는다. 시험 자료를 외부 공개 사이트에 올리지 않는다.
