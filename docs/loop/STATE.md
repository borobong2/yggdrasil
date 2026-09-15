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

## Retry and escalation

For a failed loop check, retry once after fixing the identified cause. If the same check fails again, stop that loop, add the failing command, output, hypothesis, and owner decision needed to `INBOX.md`, then escalate. Resume only with a recorded decision or a materially different hypothesis.

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
