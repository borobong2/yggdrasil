# GitHub 티켓 추적 (YG-24)

Yggdrasil 이슈에 `YG-24` 같은 키를 붙이고, 연결된 저장소의 GitHub 이벤트로 상태·PR·CI·배포를 자동 반영한다.

## 에이전트 규칙

1. 티켓은 Yggdrasil에 만든다: MCP `create_todo`에 `prefix: "YG"`를 넘기면 다음 키(예: `YG-25`)가 붙는다. GitHub 이슈는 만들지 않는다.
   에픽에 기본 접두사가 있으면(YG-36, 예: `프로젝트 › yggdrasil` → `YG`) `prefix`를 생략해도 키가 붙는다. 키 없이 만들려면 `prefix: null`.
   키가 없는 기존 할 일은 `update_todo`에 `prefix`를 넘기거나 상세의 「티켓으로 승격」으로 키를 붙인다(이미 있으면 그대로). 키는 지우지 않는다.
   에픽 기본 접두사와 시작 번호는 설정 › 티켓 접두사에서 바꾼다(번호는 앞으로만 간다).
2. 브랜치: `feat/yg-<n>-<slug>` (예: `feat/yg-24-github-tracking`)
3. PR 제목: `YG-<n>: <요약>`. 본문에 `Closes #…`는 쓰지 않는다.

키는 브랜치 이름, PR 제목, PR 본문에서 대소문자 구분 없이 찾는다.

## 자동 반영 규칙

| GitHub 이벤트 | 이슈 변화 | 근거(evidence) |
| --- | --- | --- |
| 키가 든 브랜치로 push | 진행 중(완료면 유지) | `github_branch` 브랜치 URL |
| PR opened / reopened / ready_for_review | 진행 중(완료면 유지) | `github_pr` (state open) |
| PR merged | 완료 | PR state merged + `github_commit` 병합 커밋 |
| PR closed (병합 없음) | 할 일(완료면 유지) + 메모에 한 줄 추가 | PR state closed |
| check_suite / workflow_run completed | — | PR(없으면 브랜치) 근거의 `ci` = conclusion |
| deployment_status | — | `deployment` 근거(state). success면 카드에 배포 칩 |

- 모든 변경은 활동 로그에 `payload.via = 'github'`, `delivery`(X-GitHub-Delivery)로 남는다.
- 같은 delivery는 한 번만 처리된다. 연결 안 된 저장소의 이벤트는 200으로 무시한다.
- 회사 조직(`creatived-digital-lab`) 저장소는 API와 스크립트 모두 연결을 거부한다.

## 연결

배포 런북 [docs/deploy/README.md](deploy/README.md) 7단계 참고: `GITHUB_WEBHOOK_SECRET` 등록 → 재배포 → `scripts/connect-repo.sh <owner/repo> <PREFIX> [START]`.
