# YG-03 hierarchy 작업지시서

목표: Goal→Epic→Issue hierarchy와 서버 계산 진행률을 읽고 수정한다.

공통: YG-01 `WorkItem`, `IssueStatus` 계약을 변경하지 않는다. Goal→Epic→Issue만 사용하며 Project/Feature는 추가하지 않는다. BE: `/api/planning/tree`, descendant done/total/ratio 계산. FE: tree/detail, parent-safe 생성 UI, loading/empty/error 상태. 검증: 상태 변경 후 API/UI refresh 일치, foreign owner 404/빈 결과.

비범위: board ordering, sprint, Project/Feature. trust: owner-scoped read/write만 허용하며 AI/MCP는 작업을 변경하지 않는다.

선행: YG-01 migration 충돌이 해결된 전용 DB.

파일: `src/contracts/items.ts`, `src/server/planning.ts`, `src/server/routes/planning.ts`, `src/server/app.ts`, `src/client/PlanningView.tsx`, `src/client/PlanningTree.tsx`, `src/client/main.tsx`, `test/planning.test.ts`, `docs/loop/STATE.md`.

검증: `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54331/yggdrasil_yg03 npm run db:migrate`; 같은 `DATABASE_URL`로 `npm test -- test/planning.test.ts`, `npm test`; `npm run typecheck`; `npm run build`; 전용 DB의 local HTTP server에서 create → done → tree refresh를 확인한다.

보존/승인: 이 티켓은 owner 자신의 Goal/Epic/Issue만 생성·수정한다. capture와 AI proposal은 변경하지 않으며 AI/MCP mutation을 추가하지 않는다.
