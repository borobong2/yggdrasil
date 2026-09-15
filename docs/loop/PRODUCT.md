# Yggdrasil 제품 계약

## 제품

Yggdrasil은 한 사람이 요구·결정·실행 근거를 연결하는 AI-native 개발 워크스페이스다. 모든 캡처를 보존하고, AI는 검토 가능한 계획만 제안하며 사람의 명시적 승인만 영속 작업을 만든다.

## 티켓 실행 기준

티켓 하나는 하나의 사용자 결과를 끝까지 제공한다. 공통 계약·DB, BE route/service, FE 화면, API/DB/browser 검증을 같은 티켓에 포함한다. FE와 BE는 티켓 내부에서 병렬 구현할 수 있지만, 계약이 고정되기 전에는 시작하지 않는다.

## 변경 불가 규칙

1. Every capture is preserved; conversion or organization creates/updates structured records without deleting the source capture.
2. AI/MCP는 캡처·검색·읽기·계획 제안만 할 수 있으며, 승인된 계획/작업을 직접 생성·수정·수락할 수 없다.
3. AI 제안 수락은 한 DB transaction으로 적용하고, 재시도·부분 실패는 새 작업을 남기지 않는다.
4. MVP scope is personal and single-user. Authorization must still isolate data by authenticated user.
5. Product, copy, UI, and implementation are clean-room work. Do not copy source, wording, or design assets from external products.

## 티켓 명세 형식

모든 티켓에는 아래를 명시한다.

- 목표와 사용자 결과, 범위/비범위
- 공통 계약: 타입, migration, 상태값, 권한 규칙
- BE: service, route, 입력 검증, transaction 경계
- FE: 화면 컴포넌트, 로딩/빈/오류/권한 상태
- 검증: red test, API/DB assertion, browser acceptance 명령
- 의존성, 병렬 가능 lane, 커밋 경계
- AI/MCP/캡처/승인에 대한 trust rule

## 의도적 제외

- 팀, 초대, presence, 모니터링, Slack 연동
- GitHub OAuth와 webhook 자동 동기화 (검증된 URL evidence만 우선)
- SSE 실시간 알림 (활동 타임라인과 refetch로 대체)

## 기술 경계

TypeScript, React/Vite, Hono, Supabase Postgres/Auth, Drizzle, Cloud Run 단일 서비스. 새 의존성은 MCP SDK·인증·필수 기능처럼 표준 라이브러리로 대체할 수 없을 때만 티켓에 근거를 적는다.

## Completion evidence

MVP 0.1 is complete only when the acceptance checks in the implementation plan pass against a deployed single-service environment, including the preservation and explicit-acceptance rules.

## Delivery loop

Each vertical loop has one user-visible outcome, automated checks, a manual acceptance check, and a small commit. Retry a failed check once after reading its direct cause; if it still fails, record the failure and next hypothesis in `STATE.md` and escalate with the command output. Do not hide failed verification behind a later loop.

## Auto-continuation policy

After independent checks pass, dispatch the next already-approved loop automatically. Stop only for external credentials or provisioning, deployment or cost, a second identical check failure, or a scope decision.
