# 작업지시서

모든 기능 티켓은 구현 전에 이 폴더에 작업지시서를 만든다.

파일명은 `YG-XX-<slug>.md`를 사용한다. 지시서에는 목표, 범위/비범위, 공통 계약·BE·FE lane, 파일 목록, API/DB/browser 검증 명령, 의존성, 명시 승인·single-owner·capture 보존 규칙을 적는다.

구현은 `feat/yg-XX`와 `.worktrees/yg-XX`에서만 한다. `main`은 검증 완료 후 병합용이다.
