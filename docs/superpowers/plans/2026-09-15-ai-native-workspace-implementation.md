# AI-Native Workspace Implementation Plan

**목표:** 캡처가 검토 가능한 FE/BE/문서 실행 계획으로 바뀌고, 단일 owner의 명시적 승인만 영속 작업을 만드는 개발 워크스페이스를 완성한다.

**Baseline:** `main` currently contains Loop 1–3 only: captures, pending single-item suggestions, Hono routes, Drizzle migrations `0000`–`0002`, and Vitest HTTP/database tests. Nexus is read-only reference material; no source, copy, UI, or assets are copied.

**전역 불변식:** 모든 query/mutation은 `owner_id`를 필터링한다. 캡처는 불변이다. AI/MCP는 proposal/capture만 만들 수 있다. 수락은 provenance/activity를 남기는 단일 transaction이며 재수락을 거부한다. provider 출력은 fail-closed 검증한다. evidence URL은 검증 후 저장하며 issue 상태를 바꾸지 않는다.

## 티켓 완결 형식

모든 YG 티켓은 아래 순서로 한 사용자 결과를 끝낸다.

1. **공통 계약/DB:** shared TypeScript type, migration, 상태/권한/transaction 규칙을 먼저 확정한다.
2. **BE:** service와 Hono route를 red→green으로 만들고 owner-one/owner-two·실패 rollback을 테스트한다.
3. **FE:** 고정된 API contract만 사용해 화면, loading/empty/error 상태와 명시 승인 UI를 만든다.
4. **통합 검증:** API, SQL snapshot, browser flow를 같은 티켓에서 실행하고 `STATE.md`에 정확한 명령과 결과를 기록한다.

티켓 내부에서 BE와 FE는 계약 확정 후 병렬 가능하다. 티켓 간 병렬화는 의존성 그래프가 허용할 때만 한다.

## Shared file map

- Contracts: extend `src/contracts/items.ts`; add `src/contracts/workspace.ts`, `src/contracts/mcp.ts`.
- Persistence: extend `src/server/schema.ts`; append ordered SQL migrations and journal entries under `drizzle/`.
- Services/routes: one focused service and `src/server/routes/<domain>.ts` per domain; register in `src/server/app.ts`.
- UI: split current `src/client/main.tsx` into `src/client/{AppShell,InboxView,DocumentsView,PlanningView,BoardView,SearchCommand}.tsx` only when each ticket needs it.
- Tests: `test/<domain>.test.ts`, using existing owner fixtures; every service route has owner-one/owner-two assertions.

## YG-00 — Replace the contract

**Files:** Modify `docs/loop/PRODUCT.md`, `docs/loop/STATE.md`, `docs/superpowers/specs/2026-09-05-yggdrasil-mvp-0.1-design.md`; create `docs/superpowers/specs/2026-09-15-ai-native-workspace-design.md`.

Define Project→Goal→Epic→Feature→Issue, lanes, proposal states, MCP allowlist, evidence-only GitHub boundary, and compatibility mapping for existing captures/suggestions. No code/migration. **Checks:** `rg -n 'team|OAuth|required|direct mutation'` against the contract; human review of trust table. **Commit:** `docs: define AI-native workspace contract`. Blocks every ticket.

## YG-01 — 인증, PAT, 축소된 핵심 작업 모델

**Files:** Create `drizzle/0003_workspace_core.sql`, `src/server/workspace.ts`, `src/server/routes/workspace.ts`, `test/workspace.test.ts`; modify journal, schema, contracts, app.

Tables: `goals`, `epics(goal_id)`, `issues(epic_id,status,position,priority,due_at)`, `documents`, typed `document_issue_links`, `personal_access_tokens(token_hash,revoked_at,last_used_at)`. Project/Feature와 범용 polymorphic links는 도입하지 않는다. 각 행은 `owner_id`를 가지며 service가 parent ownership을 검증한다. 로그인 UI와 PAT 발급/폐기 화면을 이 티켓에서 제공한다. Contracts expose `WorkKind`, `WorkItem`, `IssueStatus`, `Priority`, `PersonalAccessToken`.

**Acceptance:** red tests: invalid hierarchy and foreign parent return 400/404; owner two cannot read/write owner one; duplicate/self link rejected. Run `npm test -- test/workspace.test.ts`, migrate with `DATABASE_URL=... npm run db:migrate`, then full `npm test`. **Lanes:** BE/schema and contract tests first; FE cannot start hierarchy view until contracts land. **Commit:** `feat: add owner-scoped planning model`.

## YG-02 — Document workspace

**Files:** Create `drizzle/0004_documents_workspace.sql`, `src/server/documents.ts`, `src/server/routes/documents.ts`, `src/client/DocumentsView.tsx`, `test/documents.test.ts`; modify schema/contracts/app/main.

Use `documents(id,owner_id,parent_id,title,body,created_at,updated_at)` and `item_links`; plain textarea/Markdown only. Routes CRUD and `POST /api/documents/:id/links`; validate parent belongs to owner and reject cycles. UI tree/editor with explicit link picker and evidence URL list. **Checks:** document create/nest/edit/link/reload; cross-owner/cycle test; browser create parent/child and link a Feature. **Commit:** `feat: add linked document workspace`. Parallel with YG-03 after YG-01.

## YG-03 — Planning hierarchy

**Files:** Create `src/server/planning.ts`, `src/server/routes/planning.ts`, `src/client/PlanningView.tsx`, `src/client/PlanningTree.tsx`, `test/planning.test.ts`; modify workspace contracts/app/main.

`GET /api/planning/tree` returns typed nested Project/Goal/Epic/Feature/Issue data and progress `{done,total,ratio}` computed from descendant issue statuses; PATCH issue recomputes response, never client-derived. UI supports creation and valid parent selection. **Checks:** status update produces ancestor rollups; refresh equals API; foreign hierarchy hidden. Run `npm test -- test/planning.test.ts`. **Commit:** `feat: show planning hierarchy`. FE can run in parallel with YG-01 fixture work once response contract is frozen.

## YG-04 — Board and backlog

**Files:** Create `drizzle/0005_issue_order.sql`, `src/server/board.ts`, `src/server/routes/board.ts`, `src/client/BoardView.tsx`, `test/board.test.ts`; modify schema/contracts/app.

Use fixed `backlog|todo|doing|done` and integer `position`; `PATCH /api/issues/:id/move {status,position}` runs transaction that shifts siblings and appends one activity. UI uses explicit move controls first; no DnD dependency. **Checks:** ordered move, backlog transfer, foreign issue 404, exactly one activity. `npm test -- test/board.test.ts`. **Commit:** `feat: add ordered execution board`.

## YG-05 — 보류: 스프린트와 로드맵

이 티켓은 1인용/포트폴리오 Tier 3이므로 핵심 MVP 완료 뒤 별도 승인 없이는 구현하지 않는다. 우선 `issues.due_at`만 YG-01에서 제공한다.

Tables: `sprints(owner_id,name,start_at,end_at,status)` and nullable `sprint_id` on Feature/Issue; features gain `start_at,end_at`. Closing a sprint transaction moves unfinished assigned issues to backlog and writes activities. Routes CRUD/close; roadmap returns features with dates. **Checks:** close carry-over exact; invalid dates/foreign assignment reject; browser shows scheduled feature. **Commit:** `feat: add single-owner sprints and roadmap`.

## YG-06 — Reviewable delivery-plan generation

**Files:** Create `drizzle/0007_delivery_plan_proposals.sql`, `src/server/delivery-plans.ts`, `src/server/routes/delivery-plans.ts`, `src/client/DeliveryPlanPreview.tsx`, `test/delivery-plans.test.ts`; modify openai, suggestions, schema, contracts, app, Inbox view.

Proposal JSON is strict: `designDocument`, `project`, and `lanes.fe|be|docs[]`, each lane item maps only to valid Goal/Epic/Feature/Issue shapes; no IDs supplied by AI. Persist immutable `delivery_plan_proposals` with `capture_id`, model, normalized JSON, `pending|accepted|dismissed`. `POST /api/captures/:id/delivery-plan` only generates/persists proposal; GET reads it. **Checks:** malformed/extra field/provider failure persists nothing; table snapshots prove capture/work unchanged; preview is read-only. **Commit:** `feat: propose reviewable delivery plans`.

## YG-07 — Atomic approval and provenance

**Files:** Create `src/server/plan-acceptance.ts`, `src/server/routes/plan-acceptance.ts`, `test/plan-acceptance.test.ts`; modify proposal schema/contracts/routes/UI.

`POST /api/delivery-plan-proposals/:id/accept` locks pending proposal, validates again, creates document + hierarchy + lane issues + links in one DB transaction, writes `plan_acceptance` provenance and one activity, then marks accepted. Dismiss only changes proposal status/activity. **Checks:** forced insert failure rolls back all work; second accept conflict; source capture remains; owner two gets 404. **Commit:** `feat: accept delivery plans atomically`.

## YG-08 — PAT 기반 MCP 경계와 통합 검색

**Files:** Add only if required: `@modelcontextprotocol/sdk`; create `src/server/mcp.ts`, `src/server/routes/mcp.ts`, `test/mcp.test.ts`; modify auth/app/package docs.

`GET /api/search?q=`는 문서/Goal/Epic/Issue/capture를 `ILIKE`로 검색하고 capped typed result를 반환한다; UI Cmd+K와 MCP가 같은 service를 사용한다. MCP `/mcp`는 PAT hash로 owner를 resolve하고 `search_workspace`, `read_document`, `read_planning_tree`, `create_capture`, `request_delivery_plan`만 제공한다. accept/update 작업 tool은 없다. **Checks:** PAT가 24시간 이상 동작하는 static config; revoked/invalid token 401; owner two 데이터 0건; MCP definition에 accept/update handler 없음. **Commit:** `feat: add searchable PAT MCP boundary`.

## YG-09 — Evidence URL

**Files:** Create `src/server/evidence.ts`, `src/server/routes/evidence.ts`, `src/client/EvidenceList.tsx`, `test/evidence.test.ts`; modify schema/contracts/app.

Allow HTTPS GitHub PR/commit URLs and HTTPS deployment URLs only; store normalized URL, kind, status, owner, issue, timestamp. Webhook/OAuth는 제외한다. **Checks:** URL validation, foreign issue, evidence never mutates issue. **Commit:** `feat: link delivery evidence`.

## YG-10 — Activity timeline

**Files:** Create `src/server/activity.ts`, `src/server/routes/activity.ts`, `src/client/ActivityTimeline.tsx`, `test/activity.test.ts`; modify all mutation services/app.

Append-only `activities` records `{owner,actor,kind,subject_type,subject_id,payload,created_at}`. 기록 대상은 issue 이동, proposal 생성/수락/기각, evidence 추가로 한정한다. SSE는 제외하고 성공 후 refetch한다. **Checks:** 각 지원 mutation당 activity 정확히 1건; owner two timeline 0건. **Commit:** `feat: add owner activity timeline`.

## YG-11 — Verification, deployment, case study

**Files:** Create `test/ai-native-flow.ts`, `docs/demo/ai-native-workspace.md`, `docs/architecture/ai-native-workspace.md`; modify README, PRODUCT, STATE, deployment config only if absent.

Run local migration, full tests, build, single-service startup, and scripted capture→proposal→preview→accept→board→evidence flow. Browser acceptance uses a real owner session; deployed health/smoke runs only with provisioned credentials. Case study contains architecture diagram and 3-minute script, never secrets. **Commands:** `npm test`; `npm run typecheck`; `npm run build`; `DATABASE_URL=... npm run db:migrate`; `DATABASE_URL=... npx tsx test/ai-native-flow.ts`; `curl --fail $DEPLOY_URL/api/health`. **Commit:** `docs: package AI-native workspace evidence`.

## Dependency and approval gates

`YG-00 → YG-01`; then YG-02/YG-03/YG-09 parallel; YG-04→YG-05; YG-06→YG-07→YG-08; YG-10 waits for board, acceptance, evidence; YG-11 last. Human approval is required after YG-00 contract, before every YG-06 proposal acceptance, before enabling webhook secret, and before deployment. No ticket authorizes implementation until its own acceptance checks are approved.
