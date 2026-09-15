# YG-01 핵심 모델 작업지시서

## 목표

인증된 단일 owner가 Goal→Epic→Issue를 생성·조회·수정하고, 이후 MCP가 사용할 PAT를 발급·폐기할 수 있게 한다.

## 범위

- 공통: `WorkKind`, `Goal`, `Epic`, `Issue`, `Priority`, `PersonalAccessToken` 계약
- BE: owner-scoped schema/migration, hierarchy CRUD, parent/type 검증, PAT hash 발급·폐기
- FE: 로그인 상태와 PAT 관리 화면의 최소 UI
- 검증: owner-one/owner-two API, invalid parent, revoked PAT, migration, browser login/PAT flow

## 비범위

Project/Feature, team, OAuth, MCP endpoint, 검색, board, sprint, webhook, AI plan generation.

## 파일 경계

- Create: `drizzle/0003_core_work.sql`, `src/server/work.ts`, `src/server/pats.ts`, `src/server/routes/work.ts`, `src/server/routes/pats.ts`, `src/client/LoginView.tsx`, `src/client/PatSettings.tsx`, `test/work.test.ts`, `test/pats.test.ts`
- Modify: `drizzle/meta/_journal.json`, `src/server/schema.ts`, `src/contracts/items.ts`, `src/server/app.ts`, `src/server/auth.ts`, `src/client/main.tsx`, `.env.example`

## 순서와 검증

1. 계약과 migration을 확정하고 `npm run db:migrate`를 실행한다.
2. BE red test: owner isolation, Goal→Epic→Issue parent validation, priority/due date, PAT hash/revocation.
3. BE green: `npm test -- test/work.test.ts test/pats.test.ts`.
4. FE: bearer Supabase 세션으로 로그인하고 PAT를 한 번 표시/폐기한다.
5. 통합: `npm test && npm run typecheck && npm run build`; browser에서 owner가 hierarchy/PAT를 새로고침 후 확인한다.

## trust rule

모든 row와 query는 `owner_id`를 필터링한다. PAT 원문은 발급 응답에서 한 번만 보이고 DB에는 SHA-256 hash만 남긴다. 캡처와 AI proposal은 이 티켓에서 변경하지 않는다.
