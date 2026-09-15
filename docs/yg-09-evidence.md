# YG-09 evidence 작업지시서

목표: Issue에 검증된 GitHub PR/commit 또는 deployment URL evidence를 연결한다.

공통/DB: typed evidence URL, owner/issue FK, kind/status 계약. BE: HTTPS URL normalize/validate, owner isolation. FE: issue evidence list와 add/remove 상태. 검증: malformed URL·foreign issue 거부, evidence mutation이 issue status를 바꾸지 않는 SQL/API check.

비범위: GitHub OAuth, webhook, PR 자동 동기화. trust: URL은 evidence만 추가하며 실행 작업이나 capture를 변경하지 않는다.

선행: YG-01 migration 충돌이 해결된 전용 DB.

## 구현·검증 기록 (2026-09-16)

- 전용 DB: `yggdrasil_yg09`만 생성·사용했다. shared `yggdrasil` DB에는 migration이나 test를 실행하지 않았다. 로컬 compose 기동은 포트 `54330`이 이미 점유되어 실패했으며, 기존 `yggdrasil-postgres-1`의 전용 DB에만 `0000`–`0006`을 적용했다.
- RED: `DATABASE_URL=.../yggdrasil_yg09 npm test -- test/evidence.test.ts`는 route 구현 전 2개 테스트가 `404`(기대 `201`/`400`)로 실패했다.
- GREEN: Issue evidence는 `github_pr|github_commit|deployment`과 `linked` 상태를 저장한다. HTTPS URL만 허용하고 GitHub PR/commit URL을 정규화한다. 모든 evidence read/write는 owner와 issue를 함께 검사하며, `0005`의 `(issue_id, owner_id)` FK도 같은 관계를 보장한다. mutation은 `issues.status`를 변경하지 않는다.
- 리뷰 보완: malformed issue/evidence UUID는 400, foreign-owner DELETE는 404를 반환한다. SQL과 `GET /api/issues/:id` 양쪽에서 evidence mutation 전후 issue status가 같음을 검증한다.
- 검증: 전용 DB에서 `npm test` 9 files/40 tests passed, `npm run typecheck`, `npm run build`, `git diff --check`가 통과했다. 로컬 `http://127.0.0.1:3001`에서 Issue 선택, PR URL 추가(`github_pr — linked` 표시), Remove 후 목록 제거, console error 없음까지 확인했다.
