# Execution state

**Updated:** 2026-09-12
**Phase:** YG-00 제품 계약 작업 진행 중

## Current objective

AI-native 개발 워크스페이스 계약을 확정한 뒤, YG-01부터 기능 티켓 단위로 구현한다.

## Auto-continuation policy

After independent checks pass, dispatch the next already-approved loop automatically. Stop only for external credentials or provisioning, deployment or cost, a second identical check failure, or a scope decision.

## Confirmed decisions

- Personal, single-user, Inbox-first workspace.
- Captures are immutable source records for organization purposes: never delete a capture during conversion.
- AI makes reviewable title/type/target suggestions only; acceptance is the sole mutation trigger.
- Core item types: inbox, document, project, issue.
- Stack: TypeScript, React/Vite, Hono, Supabase Postgres/Auth, Drizzle, one Cloud Run service.

## 현재 티켓

YG-00: [AI-native 제품 계약](../superpowers/specs/2026-09-15-ai-native-workspace-design.md)을 검토·확정한다. 구현 코드는 변경하지 않는다.

## Evidence ledger

| Date | Loop | Evidence | Result |
| --- | --- | --- | --- |
| 2026-09-05 | 0 | Documentation links and repository status verified | Passed |
| 2026-09-05 | 1 | `npm install` | Passed; installed 155 packages (npm reported 5 dependency audit vulnerabilities). |
| 2026-09-05 | 1 | `npm test -- test/health.test.ts` before route implementation | Expected failure: `GET /api/health` returned 404 rather than 200. |
| 2026-09-05 | 1 | `npm test` | Passed: 3 tests covering health, test-owner access, and missing/invalid bearer rejection; no Supabase credentials or network required. |
| 2026-09-05 | 1 | `npm run typecheck && npm run build` | Passed after one direct type fix for the Hono test context. |
| 2026-09-05 | 1 | `npm start` then `curl --fail --silent --show-error http://127.0.0.1:3000/api/health` | Passed; response was exactly `{"ok":true}`. |
| 2026-09-05 | 2 | `npm test -- test/captures.test.ts` before capture implementation | Expected failure: all four capture route tests returned 404 instead of the required create/list/validation behavior. |
| 2026-09-05 | 2 | `docker compose up -d --force-recreate postgres` then `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil npm run db:migrate` | Passed; local Postgres applied `app_owners` and `captures` migrations. The initial migration attempt exposed a missing Drizzle journal, and the next attempt exposed an occupied host port; both had distinct direct causes and were corrected. |
| 2026-09-05 | 2 | `npm test` | Passed: 8 tests, including create, newest-first listing, blank rejection, cross-owner isolation, and production rejection of the development-owner override. No Supabase credentials or network required. |
| 2026-09-05 | 2 | `npm run typecheck && npm run build && git diff --check` | Passed. |
| 2026-09-05 | 2 | Fresh `npm start` with local `DATABASE_URL` and `YGGDRASIL_DEV_OWNER_ID`, then HTTP POST `/api/captures`, GET `/api/captures`, and GET `/` | Passed against local Docker Postgres: `real db reload check after rebuild` was returned after reload; the built Inbox page returned HTML. |

## Loop YG-04 evidence (2026-09-17)

- Added owner-scoped ordered backlog and `todo|doing|done` board moves. `PATCH /api/issues/:id/move` locks the owner's issue set, reindexes affected siblings, and appends one `issue.moved` activity in the same transaction. It does not change the Goal→Epic→Issue hierarchy, captures, AI proposals, or MCP mutation boundary.
- Added the minimal explicit BoardView controls with loading, empty, and error states. Drag-and-drop, sprint, SSE, and AI/MCP work mutation remain excluded.

| Command / check | Exact evidence | Result |
| --- | --- | --- |
| Dedicated DB migration | `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg04 npm run db:migrate` applied migrations `0000` through `0007_issue_board` only to `yggdrasil_yg04`. | Passed. |
| RED API test | `DATABASE_URL=.../yggdrasil_yg04 npm test -- test/board.test.ts` before implementation: move requests returned `404` rather than `200`, and SQL reported missing relation `activities`. | Expected red. |
| Board API/SQL green test | `DATABASE_URL=.../yggdrasil_yg04 npm test -- test/board.test.ts`: 3 tests passed for same-column reordering, backlog-to-board insertion, owner-two `404`, and exactly one activity for the tested move. | Passed. |
| Full regression | `DATABASE_URL=.../yggdrasil_yg04 npm test`: 12 files / 49 tests passed. `npm run typecheck`, `npm run build`, and `git diff --check` passed. | Passed. |
| Browser move/reload | Local `http://127.0.0.1:3004` used only `DATABASE_URL=.../yggdrasil_yg04` and `YGGDRASIL_DEV_OWNER_ID`. Browser selected **doing** for **Open work**, sent `PATCH /api/issues/:id/move` with `200`, showed it in Doing, and showed it there again after reload with no console errors. | Passed. |

## Loop YG-06 evidence (2026-09-17)

- Added `delivery_plan_proposals`: owner-scoped, capture-linked, strict JSON `design` and FE/BE/Docs lanes, model metadata, and a database-enforced `pending` state. Each lane is capped at 10 server-validated items.
- Added owner-scoped `GET`/`POST /api/captures/:id/delivery-plan`. Provider, malformed-output, and missing-configuration paths fail closed; generation creates only one proposal. No acceptance/dismissal route or document/Goal/Epic/Issue mutation was added.
- Added the capture-level generation control and read-only proposal preview. It explicitly states that no documents or work items have been created.

| Command / check | Exact evidence | Result |
| --- | --- | --- |
| RED API test | `npm test -- test/delivery-plans.test.ts` before the route existed: 8 assertions failed with `404` instead of required delivery-plan responses. | Expected red. |
| Dedicated DB migration | `DATABASE_URL=…:54331/yggdrasil_yg06 npm run db:migrate` applied `0000` through `0008_delivery_plan_proposals` only to `yggdrasil_yg06`. | Passed. |
| GREEN API/DB test | `DATABASE_URL=…:54331/yggdrasil_yg06 npm test -- test/delivery-plans.test.ts`: 8 tests passed for pending-only persistence, owner isolation, reload listing, malformed provider output, and provider failure. SQL snapshots proved every public table except `delivery_plan_proposals` stayed unchanged. | Passed. |
| Full verification | `DATABASE_URL=…:54331/yggdrasil_yg06 npm test && npm run typecheck && npm run build && git diff --check`: 12 files / 54 tests passed; typecheck, production build, and whitespace check passed. | Passed. |
| Dedicated API/SQL | Local `GET /api/captures/…/delivery-plan` returned one pending preview; SQL confirmed one matching pending proposal; `POST /api/delivery-plan-proposals/:id/accept` returned `404`. | Passed. |
| Browser | Local dev-owner browser at `127.0.0.1:3006` displayed the enabled generation trigger and seeded pending design/FE/BE/Docs preview; no accept/dismiss controls or console errors. | Passed. |
| Post-YG-04 rebase | Fresh `yggdrasil_yg06_rebase` applied `0000` through `0008_delivery_plan_proposals`; `npm test` passed 13 files / 57 tests, including board and delivery-plan suites; typecheck and build passed. | Passed. |

## Loop YG-07 evidence (2026-09-17)

- Added owner-scoped atomic acceptance and dismissal routes. Acceptance locks and revalidates the pending proposal, then creates one design document, Goal/Epic, lane Issues, typed document-to-Issue links, acceptance provenance, and one activity in one transaction. Dismissal changes only proposal status and adds one activity.

| Command / check | Exact evidence | Result |
| --- | --- | --- |
| RED API test | `DATABASE_URL=…:54331/yggdrasil_yg07 npm test -- test/plan-acceptance.test.ts` before route implementation: accept/dismiss assertions returned `404` instead of `201`/`200`. | Expected red. |
| Dedicated DB migration and API/SQL green | `DATABASE_URL=…:54331/yggdrasil_yg07 npm run db:migrate`; then `npm test -- test/plan-acceptance.test.ts`: 4 tests passed for owner isolation, duplicate-accept conflict, forced document insert rollback, capture preservation, dismissal side-effect boundary, and exact provenance/activity rows. | Passed. |
| Full verification | `DATABASE_URL=…:54331/yggdrasil_yg07 npm test && npm run typecheck && npm run build && git diff --check`: 14 files / 61 tests passed; typecheck, production build, and whitespace check passed. | Passed. |
| Dedicated SQL | Browser-created accepted proposal query returned `[{"status":"accepted","provenance":1,"activity":1}]`. | Passed. |
| Browser capture → proposal → accept → reload | Test-provider local server at `127.0.0.1:3017`: created **Browser acceptance capture**, generated plan, clicked **Accept plan** (`201`), and reload retained **Accepted** plus document/Goal/Epic/three Issue links; browser console had no messages. | Passed. |

## Retry and escalation

For a failed loop check, retry once after fixing the identified cause. If the same check fails again, stop that loop, add the failing command, output, hypothesis, and owner decision needed to `INBOX.md`, then escalate. Resume only with a recorded decision or a materially different hypothesis.

## Loop YG-03 evidence (2026-09-16)

- Added an owner-scoped, read-only planning tree for the existing Goal→Epic→Issue model. It returns server-calculated `{done,total,ratio}` at Goal and Epic levels; no migration, table, `WorkItem`, or `IssueStatus` contract changed.
- The Planning UI creates only valid parent relationships, updates an existing Issue status endpoint, then reloads `/api/planning/tree`; loading, empty, and error states are explicit. Capture, AI proposal, and MCP mutation boundaries remain unchanged.
- Rebased onto the YG-02/YG-09-integrated main branch. Documents, evidence, and planning views/routes/types are registered together; their existing STATE evidence remains preserved.

| Command / check | Exact evidence | Result |
| --- | --- | --- |
| Initial dedicated-DB readiness check | No `psql` or running worktree Postgres was available; no DB command was run against shared `yggdrasil`. | Deferred safely. |
| `docker compose up -d postgres` | Failed once because host port `54330` was already held by existing `yggdrasil-postgres-1`; shared DB was not contacted. | Replaced with isolated container. |
| Isolated PostgreSQL | Started `yggdrasil-yg03-postgres` on `127.0.0.1:54331` with database `yggdrasil_yg03`. | Passed. |
| `DATABASE_URL=...:54331/yggdrasil_yg03 npm run db:migrate` | Drizzle reported migrations applied successfully. | Passed. |
| Mutation red check: temporarily unregister planning route, then `DATABASE_URL=... npm test -- test/planning.test.ts` | Both assertions failed as expected with `404` instead of required `200`; route registration was restored immediately. | Expected red. |
| `DATABASE_URL=...:54331/yggdrasil_yg03 npm test -- test/planning.test.ts` | 1 file, 2 tests passed: server rollups and foreign-owner invisibility. | Passed. |
| `DATABASE_URL=...:54331/yggdrasil_yg03 npm test` | 9 files, 37 tests passed. | Passed. |
| `npm run typecheck && npm run build && git diff --check` | TypeScript passed; Vite built 32 modules; no whitespace errors. | Passed. |
| Local HTTP flow on `127.0.0.1:43103` with the dedicated DB | Goal → Epic → Issue create, status `done`, and tree reload returned `{"done":1,"total":1,"ratio":1}` and status `done`; built bundle contains planning loading/empty UI strings. | Passed. |
| Browser automation | gstack browse setup was approved but its advertised `./setup` script and `dist/browse` binary were absent, so a graphical browser run was unavailable. | HTTP/build substitute recorded. |
| Post-rebase `DATABASE_URL=...:54331/yggdrasil_yg03 npm run db:migrate` | Latest journal entry `0006_issue_evidence_owner_fk` verified; migration completed against the dedicated DB only. | Passed. |
| Post-rebase `DATABASE_URL=...:54331/yggdrasil_yg03 npm test` | 11 files, 46 tests passed, including document, evidence, and planning suites. | Passed. |
| Post-rebase `npm run typecheck && npm run build && git diff --check` | TypeScript passed; Vite built 34 modules; no whitespace errors. | Passed. |

## Loop 3 evidence (2026-09-12)

- Implemented owner-scoped `POST /api/captures/:id/suggestions` and `GET /api/captures/:id/suggestions`, a `suggestions` migration, and Inbox display of **Pending — unaccepted. No items have been changed.** Each successful generation stores exactly one pending record with title, one of the four core types, capture identity, and model metadata. There are no target candidates yet, so the structured schema requires `targetId: null`; the API omits the optional target ID. No destination is invented.
- The production provider uses server-only `OPENAI_API_KEY`, optional `OPENAI_MODEL` (default `gpt-4o-mini`), native fetch, a 30-second timeout, and strict JSON Schema structured output. Output is validated again before persistence; refusal, incomplete output, malformed JSON, invalid proposals, and provider errors fail without storing a suggestion. Missing configuration returns HTTP 503 with `AI configuration required: set OPENAI_API_KEY on the server.` The Inbox displays that API error when generation is requested. Provider details and secrets are not returned in errors.
- Official implementation reference: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). No live model calls, credentials, or account were used for verification; production API access remains untested. The deterministic fake exists only under `test/` and is injected into the app factory; there is no environment switch enabling a fake in production.

| Command / check | Exact evidence | Result |
| --- | --- | --- |
| `npm test -- test/suggestions.test.ts` before implementing the route | Initial generation assertion returned **404 instead of 201** (1 failed test). | Expected red. |
| Full deterministic fake regression check with `registerSuggestionRoutes` temporarily disabled, then restored | `npm test -- test/suggestions.test.ts`: **15 failed**, including pending generation, list, ownership, invalid output, configuration, and all four core types. This expanded regression check was run after implementation; the initial pre-implementation test was the narrower route assertion above. | Expected red; restored before final checks. |
| `docker compose up -d postgres` | `yggdrasil-postgres-1 Running` on local port 54330. | Passed. |
| `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil npm run db:migrate` | `[✓] migrations applied successfully!`; applied `0002_suggestions`. | Passed first attempt. |
| `npm test` | **5 test files, 29 tests passed**: 15 suggestion-route tests, 6 mocked OpenAI tests, 4 capture tests, 3 auth tests, 1 health test. No external network or real credentials required. | Passed. |
| Mutation checks | Snapshot every existing public table except `suggestions` before and after generation; exact equality for `inbox`, `document`, `project`, and `issue` proposals. SQL verifies exactly one pending row for a generated capture. Public tables are `app_owners`, `captures`, `suggestions`; document/project/issue tables remain absent. | Passed. |
| `npm run typecheck` | `tsc --noEmit`, exit 0. | Passed. |
| `npm run build` | `tsc -b && vite build`, 28 modules; `dist/client/assets/index-D6WtIjsF.js` **196.49 kB**, gzip **61.69 kB**. | Passed. |
| `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil npx tsx test/suggestions-flow.ts` | Real loopback HTTP server + Docker Postgres + test fake: built Inbox HTML 200; capture POST 201; suggestion POST 201; reloaded list exactly equals the generated pending record; SQL has one pending suggestion and unchanged capture. Capture `f7ade4a4-d456-4c25-a924-94fe4c01070c`; suggestion `352793ae-d410-46dd-b342-44feb90117de`. | Passed. |
| HTTP-flow bundle check | Served client bundle includes the pending/unaccepted label and excludes `api.openai.com` and `process.env.OPENAI_API_KEY`. Client imports no server modules. | Passed. |
| `git diff --check` | No whitespace errors. | Passed. |

Verification used HTTP requests and built-asset inspection, not an interactive browser UI session. The UI disables generation until initial listing finishes, preventing the initial list response from overwriting a newly generated proposal. Route suites run sequentially because their database snapshots share local Postgres. No unexpected check failure or retry escalation occurred; deliberately failing red checks are recorded above. Acceptance, dismissal, core-item implementations, deployment, and all other later-loop features remain out of scope.

## Pause checkpoint (2026-09-12)

- Durable repository state ends at commit `fdc1837` (`feat: add reviewable organization suggestions`). The worktree was clean before the worker dispatch attempts.
- Loop 4 has made no repository changes. Its initial Codex task and one Codex retry both failed before prompt delivery with `agent_prompt_blocked`.
- A Claude recovery worker also stopped before task execution at its interactive workspace-trust confirmation. The terminal was closed and the orchestration task is recorded as blocked.
- Resume by resolving the local Claude/Codex worker prompt-delivery setup, then start a fresh document-loop task. Do not implement acceptance/dismissal until document and project/issue destination models exist.

## Loop YG-02 evidence (2026-09-16)

- Implemented owner-scoped plain-text documents with nullable self-parenting and typed document-to-Issue links. `documents.owner_id` has a DB FK to `app_owners`; document creation idempotently creates that owner row. Parent ownership and cycle checks run in the service; issue links require the same owner and are unique at the database boundary. YG-01 Goal/Epic/Issue contracts and migrations were not changed.
- Added a minimal Documents workspace: nested tree, selected-document title/body editor, parent selector, Issue link picker, plus loading, empty, and error states. No rich-text editor, sharing, deletion policy, or generic polymorphic links were added.

| Command / check | Exact evidence | Result |
| --- | --- | --- |
| Dedicated DB preparation | `yggdrasil_yg02` was created, then recreated after adding the owner FK, on the existing local PostgreSQL server. The shared `yggdrasil` DB and YG-01's `yggdrasil_yg01` DB were not migrated or tested. `DATABASE_URL=…/yggdrasil_yg02 npm run db:migrate` applied migrations only to YG-02's DB. | Passed. |
| RED API test | `DATABASE_URL=…/yggdrasil_yg02 npm test -- test/documents.test.ts` before implementation: 3 failures, each expected `201` but received `404` for `POST /api/documents`; before the FK addition, the DB assertion expected one `documents → app_owners` FK but received zero. | Expected red. |
| YG-02 migration | `DATABASE_URL=…/yggdrasil_yg02 npm run db:migrate` after adding `0004_documents` and recreating only this dedicated DB. Drizzle reported migrations applied successfully. | Passed. |
| GREEN API test | `DATABASE_URL=…/yggdrasil_yg02 npm test -- test/documents.test.ts`: 4 tests passed for create/nest/edit/reload, cycle rejection, owner isolation, typed Issue links, and the owner FK. | Passed. |
| Full verification | `DATABASE_URL=…/yggdrasil_yg02 npm test && npm run typecheck && npm run build && git diff --check`: 9 test files / 38 tests passed; typecheck, production build, and whitespace check passed. | Passed. |
| Browser flow | Final local server with only `DATABASE_URL=…/yggdrasil_yg02` and `YGGDRASIL_DEV_OWNER_ID` at `http://127.0.0.1:3005`: loaded the persisted test document tree, created a document, and received the title/body editor, parent selector, and Issue picker. Earlier in the same dedicated-DB flow, a document was saved, nested under **Design**, reloaded, and linked to an Issue. | Passed. |

The first full typecheck exposed only a client `HeadersInit` union annotation; it was corrected to `Record<string, string>` and all final checks above passed. The browser check uses the local development-owner override; real Supabase session verification remains deferred because no external credentials were supplied.

## Loop YG-01 evidence (2026-09-15)

- Added owner-scoped `goals`, `epics`, `issues`, and `personal_access_tokens` through migration `0003_core_work`. Goal deletion cascades through its Epic/Issue children; every service read, update, delete, and parent lookup filters `owner_id`.
- Contracts now define `WorkKind`, Goal/Epic/Issue, Issue status/priority, and PAT response shapes. Issues default to `backlog` and `medium`; due dates are nullable ISO timestamps.
- PAT issuance returns `ygpat_…` plaintext only in the create response. PostgreSQL stores SHA-256 `token_hash`; list responses never include plaintext. Revocation is owner-scoped. PAT authentication remains out of scope until YG-08.
- The browser stores a supplied existing bearer session only in `sessionStorage`; this ticket does not add email/password or OAuth sign-in. Existing Inbox and suggestions requests now pass that bearer token.

| Command / check | Exact evidence | Result |
| --- | --- | --- |
| `npm test -- test/work.test.ts test/pats.test.ts` before route implementation | 5 assertions failed with expected 404 routes rather than required 201/400 responses. | Expected red. |
| `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg01 npm run db:migrate` | Migration `0003_core_work` applied successfully in a worktree-specific local DB. The shared `yggdrasil` DB was not modified because it contained unrelated legacy `issues` data. | Passed. |
| `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg01 npm test -- test/work.test.ts test/pats.test.ts` | 2 test files, 5 tests passed: hierarchy CRUD/defaults/invalid parent/owner isolation and PAT hash/revocation. | Passed. |
| `npm run typecheck && npm run build && DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg01 npm test` | Typecheck passed; Vite built 30 modules; 7 test files and 34 tests passed. | Passed. |
| Browser at local `http://127.0.0.1:3001` with local dev owner | Issued PAT appears once, revoke changes it to revoked, and page refresh had zero `<code>` token elements. No console errors. A real Supabase bearer session could not be verified because no external credentials were supplied. | Local PAT flow passed; external-auth check deferred. |

## Loop YG-10 evidence (2026-09-21)

- Scope approved by the user's explicit implementation-through-Draft-PR instruction. Work order: `docs/yg-10-activity-timeline.md`. Parent main `192eecc` (YG-07 merged), branch `feat/yg-10`, worktree `.worktrees/yg-10`. No other ticket branch was merged; no main merge or deployment was performed.
- Reused `activities` and its owner/created/id index. A transaction-only append writer now handles issue move, delivery-plan creation/acceptance/dismissal, and evidence addition. Existing board/acceptance writes were replaced, not duplicated. No schema/migration/dependency/auth/PAT/MCP/search changes. Delivery-plan/capture service exports and signatures remain compatible with YG-08.
- `GET /api/activities` authenticates and scopes by owner, ignores client owner/limit overrides, returns newest 100 ordered by `created_at DESC, id DESC`. Timeline shows the bound, loading/empty/error/401 states, manual Refresh, and automatic refetch after the five successful mutations. Aborted/stale requests cannot expose the previous owner's rows.
- Read actual `~/.ai_panes_ai-yg-10`: orchestrator `%42`, Claude `%43`, Codex `%44`. Claude did independent read-only pre/final review; Codex implemented only the four assigned FE files. Orchestrator alone ran DB tests, integrated common files, and handled commit/PR. Both participant panes retained; no further edits assigned.

All database commands below used **`DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54331/yggdrasil_yg10`**, a dedicated DB on the existing `yggdrasil-yg03-postgres` server. Shared `yggdrasil` and other tickets' databases were never tested or migrated. Only PostgreSQL's `postgres` administrative DB was queried to check/create this dedicated database.

| Command / check | Exact evidence | Result |
| --- | --- | --- |
| Dependencies | `npm ci`: installed 147 packages; package/lock unchanged. Existing audit output: 7 vulnerabilities (6 moderate, 1 high), plus two esbuild-kit deprecation warnings. No dependency remediation in YG-10 (YG-08 owns dependencies). | Install passed; baseline warnings recorded. |
| Dedicated DB | `docker exec yggdrasil-yg03-postgres createdb -U yggdrasil yggdrasil_yg10`; `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54331/yggdrasil_yg10 npm run db:migrate`. Applied existing migrations `0000`–`0009`; no new migration. SQL `SELECT current_database()` returned `yggdrasil_yg10`. | Passed. |
| Parent baseline | With the DATABASE_URL above, `npm test`: **14 files / 61 tests passed** (7.98s). `npm run typecheck` and `npm run build`: passed, 36 modules. Log `/tmp/yg10-baseline-test.log`. | No baseline test failures. |
| Initial RED | `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54331/yggdrasil_yg10 npm test -- test/activity.test.ts`: **6 failed / 3 passed**. Missing created event, missing service owner guard/persisted-text boundary, non-atomic proposal/evidence inserts, and timeline 404. Existing move/accept/dismiss rollback checks already passed. Log `/tmp/yg10-red.log`. | Expected red. |
| Initial GREEN | Same targeted command: **9/9 passed**. Full suite then **15 files / 70 tests passed**, typecheck passed. Logs `/tmp/yg10-green.log`, `/tmp/yg10-full.log`. | Passed. |
| Exact mutation counts and isolation | HTTP and direct service tests independently verify one new row per supported successful mutation. Owner-two calls, forged capture owner/text, invalid URL, provider error/invalid output, repeated decisions and unauthenticated timeline checks are covered. Client `ownerId`/`limit` cannot widen a timeline; 105 seeded rows return exactly 100 in timestamp/ID order. | Passed. |
| Atomic failure and preservation | `test/activity.test.ts` installs a temporary `BEFORE INSERT ON activities` failure trigger, runs all five service mutations, removes the trigger in `finally`, and compares **all public-table rows** before/after: identical in each case. Source capture stays identical; deleting evidence leaves activity history identical. | Passed. |
| Intentional prior-test updates | YG-06 successful proposal generation snapshot now permits activity append only; its failure snapshots still include activities. YG-07 acceptance/dismissal assertions select their exact kind, since a proposal now also has a created event. No failing baseline was hidden. | Existing preservation checks retained. |
| Review fix RED→GREEN | Deterministically delete a capture between route lookup and service recheck. Before fix, `npm test -- test/activity.test.ts`: **1 failed / 10 passed**, expected 404 but got 502. Added NotFound→404 mapping; final suite passes. Log `/tmp/yg10-review-red.log`. | Expected red, fixed. |
| Final automated verification | `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54331/yggdrasil_yg10 npm test && npm run typecheck && npm run build && git diff --check`: **15 files / 72 tests passed** (8.92s); TypeScript passed; Vite built 37 modules, JS 215.54 kB (gzip 66.39 kB); whitespace passed. Log `/tmp/yg10-final-test.log`. | Passed. |
| Browser fixture | `NODE_ENV=test DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54331/yggdrasil_yg10 npx tsx test/activity-browser-server.ts`; binds only `127.0.0.1:3010`, asserts test mode/dedicated DB, injects a deterministic provider only under `test/`. `browse goto http://127.0.0.1:3010` uses `/Users/bong/.codex/skills/gstack/browse/dist/browse`. | Passed; no external API. |
| Browser mutation flow | Initial baseline bundle had no timeline (`querySelector` false). Final bundle showed **No activity yet**. Filled `#capture`, clicked Capture → Generate delivery plan → Accept plan → Generate delivery plan → Dismiss plan; each successful operation immediately added its timeline row. Reloaded to populate board/evidence views, selected `Timeline UI destination=doing`, clicked Move, added `https://example.com/yg10-preview`: timeline immediately showed Issue moved and Evidence added. | All five kinds refetched successfully; reload preserved history. |
| Browser loading/error/owner race | Held an activities fetch response: `snapshot -s '[aria-label="Activity timeline"]'` showed **Loading activity…**, no old rows. Switched through the Session form to `yg10-browser-other`, then released the old owner's delayed response: **No activity yet**, no old rows. Invalid bearer showed **Sign in to view activity.** Browser-only simulated timeline HTTP 500 showed **Activity could not be loaded.** Restored fetch and clicked Refresh: all 6 history rows returned. | Passed. |
| Browser evidence | Happy-path `browse console --errors`: **no console errors** (before deliberate invalid-session checks). Screenshot `/tmp/yg10-activity-timeline.png` visually inspected: latest-100 notice, all five kind labels, subject IDs, source captures, evidence URL and move statuses. | Passed. |
| SQL after browser | `docker exec yggdrasil-yg03-postgres psql -U yggdrasil -d yggdrasil_yg10 ...`: browser owner `…0010` had created=2, accepted=1, dismissed=1, evidence.added=1, issue.moved=1; owner two `…0011` had **0**. Capture `cda3a18c-d589-420c-ab83-cb417f821102` retained text **YG-10 browser timeline acceptance**, status **inbox**. | Passed. |

Review disposition: Claude reported no blocker. Fixed disappearance error classification, timezone-explicit test fixtures and visible list bound. Kept evidence subject=issue plus evidence ID/URL payload for meaningful retained history. Kept the board test's strict single-row assertion because its fixture creates a fresh issue and no evidence. Existing evidence lookup/delete races still fail safely via the composite owner FK (may return 500 on concurrent deletion); no broader CRUD locking redesign in this ticket. Repeated Refresh remains allowed and safely aborts the previous request. Browser-generated `.gstack/` ignore/runtime changes were removed from the deliverable.

Integration notes: common files changed only for YG-10 — `app.ts` activity route import/registration; `main.tsx` revision state, callback props and timeline placement; `items.ts` two added Activity kinds; this YG-10 STATE section. Preserve YG-08's neighboring route/UI/contract registrations when combining branches. MCP `request_delivery_plan` must continue calling `generateDeliveryPlan`; it must not add a second activity at its HTTP/MCP boundary. Existing activities are retained without historical backfill.

External limits: real Supabase sessions, PAT/MCP integration from the separate YG-08 branch, real OpenAI credentials/provider calls, and deployed-environment verification were not exercised. Development no-token requests resolve to the fixture owner, so browser 401 used an invalid bearer; two-owner isolation used the explicitly installed second-owner token. The example evidence URL was stored/displayed only, never contacted. No unexpected test regression remains; failures above were intentional RED checks.
