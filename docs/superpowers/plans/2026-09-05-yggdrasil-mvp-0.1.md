# Yggdrasil MVP 0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a personal Inbox-first workspace that preserves captures and applies AI suggestions only after explicit acceptance.

**Architecture:** A single Cloud Run container serves a React/Vite web app and Hono API. Hono authenticates Supabase users, Drizzle scopes Postgres queries by owner, and focused services implement capture, suggestion, organization, linking, and search transactions.

**Tech Stack:** TypeScript, React, Vite, Hono, Supabase Postgres/Auth, Drizzle, Cloud Run.

**Spec:** `docs/superpowers/specs/2026-09-05-yggdrasil-mvp-0.1-design.md`

## Global Constraints

- Keep the product personal and single-user; every user-owned read and write filters by authenticated user ID.
- Preserve every capture; no organization flow deletes its source capture.
- AI proposes only title, type, and target; persisted mutation requires one explicit authenticated acceptance action.
- Core types are exactly `inbox`, `document`, `project`, and `issue`.
- Use one Cloud Run service; do not add teams, invitations, sprints, realtime, monitoring, third-party runtime integration, or custom run/session/checkout.
- Use clean-room product copy and assets.

---

## File map

Create the app only during Task 1. Keep API contracts, database schema, services, routes, and page components in focused files under `src/`; place route/service tests beside or under `test/`. This plan names logical paths; choose the smallest standard Vite/Hono layout that preserves those responsibilities.

### Task 1: Foundation and owner boundary

**Files:** Create application workspace, `src/contracts/items.ts`, `src/server/auth.ts`, `src/server/db.ts`, `src/server/routes/health.ts`, schema and migration files, and one API test.

**Interfaces:** Produces `CoreType = 'inbox' | 'document' | 'project' | 'issue'`, `requireUser(request): Promise<{id: string}>`, and `GET /api/health`.

- [ ] Write a failing health-route test expecting `200` and `{ ok: true }`.
- [ ] Run that test and confirm it fails before the route exists.
- [ ] Create the minimal Vite/React/Hono/Drizzle setup, owner-scoped base schema, Supabase token verification middleware, and health route.
- [ ] Run typecheck, the health test, and a browser request to `/api/health`; record all commands and results in `STATE.md`.
- [ ] Commit: `feat: establish authenticated application foundation`.

### Task 2: Capture inbox

**Files:** Create capture schema/migration, capture service/routes, inbox page/components, and capture API/browser tests.

**Interfaces:** Produces `POST /api/captures { text }`, `GET /api/captures`, and a `Capture { id, text, status, createdAt }` contract.

- [ ] Write failing tests for create, ordered listing, empty-text rejection, and cross-owner invisibility.
- [ ] Run the tests and confirm the routes fail.
- [ ] Implement minimal owner-scoped capture persistence and an Inbox-first UI with a text capture form and list.
- [ ] Run route tests, typecheck, and browser flow: sign in, capture text, reload, and confirm it remains visible.
- [ ] Add evidence to `STATE.md`; if a check fails twice, create the required `INBOX.md` escalation entry before continuing.
- [ ] Commit: `feat: add persistent inbox capture`.

### Task 3: Reviewable AI suggestions

**Files:** Create suggestion schema/migration, provider adapter, suggestion service/routes, inbox suggestion UI, and tests.

**Interfaces:** Produces `POST /api/captures/:id/suggestions`, `GET /api/captures/:id/suggestions`, and `Suggestion { id, captureId, title, type, targetId?, status }`.

- [ ] Write failing tests proving generation stores a pending proposal and does not create or edit a document, project, or issue.
- [ ] Run tests using a deterministic fake provider and confirm they fail.
- [ ] Implement server-only suggestion generation, validation of the four core types, and a UI that labels proposals as unaccepted.
- [ ] Run route tests, typecheck, and browser flow; inspect database/API state to confirm generation changed only suggestion records.
- [ ] Record evidence or escalate after one retry, then commit: `feat: add reviewable organization suggestions`.

### Task 4: Explicit suggestion acceptance

**Files:** Modify suggestion service/routes and inbox UI; add transaction and duplicate-acceptance tests.

**Interfaces:** Produces `POST /api/suggestions/:id/accept` and `POST /api/suggestions/:id/dismiss`; acceptance returns `{ suggestion, item }`.

- [ ] Write failing tests for accept, dismiss, retrying an already accepted suggestion, owner isolation, and source-capture retention.
- [ ] Run tests and confirm the acceptance endpoint is absent or incorrect.
- [ ] Implement a single transaction that verifies pending status, creates the chosen structured item, marks the suggestion accepted, and retains the capture; implement dismissal as suggestion-only mutation.
- [ ] Run tests and browser flow: capture, generate, inspect unchanged records, accept once, reload, and confirm both capture and result exist.
- [ ] Record evidence or escalate after one retry, then commit: `feat: require explicit suggestion acceptance`.

### Task 5: Document tree and editor

**Files:** Create document schema/migration, document service/routes, tree/editor components, and tests.

**Interfaces:** Produces `Document { id, parentId?, title, body }`, CRUD routes under `/api/documents`, and parent validation that rejects cycles and foreign parents.

- [ ] Write failing tests for CRUD, same-owner nesting, cross-owner parent rejection, and cycle rejection.
- [ ] Run tests and confirm the document routes fail.
- [ ] Implement minimal document persistence, tree navigation, title/body editor, and parent selector without a rich-text dependency.
- [ ] Run route tests, typecheck, and browser flow: create parent/child, edit body, reload, and confirm the tree and text persist.
- [ ] Record evidence or escalate after one retry, then commit: `feat: add document tree and editor`.

### Task 6: Projects, issues, and board

**Files:** Create project/issue schema/migrations, services/routes, project and board UI, and tests.

**Interfaces:** Produces CRUD routes for `/api/projects` and `/api/issues`; `IssueStatus = 'todo' | 'doing' | 'done'`; issue move updates `{ status, position }`.

- [ ] Write failing tests for project/issue CRUD, owner isolation, valid status moves, and invalid status rejection.
- [ ] Run tests and confirm the work routes fail.
- [ ] Implement owner-scoped CRUD and a three-column board using buttons or a native select to move issues; do not add drag-and-drop.
- [ ] Run route tests, typecheck, and browser flow: create project/issue, move it across all columns, and reload.
- [ ] Record evidence or escalate after one retry, then commit: `feat: add projects issues and simple board`.

### Task 7: Item links and unified search

**Files:** Create link schema/migration, link/search services/routes, link/search UI, and tests.

**Interfaces:** Produces `POST /api/links`, `DELETE /api/links/:id`, `GET /api/search?q=`, and `SearchResult { type: CoreType, id: string, title: string, snippet: string }`.

- [ ] Write failing tests for cross-type links, duplicate/self-link rejection, owner isolation, and search results from each core type.
- [ ] Run tests and confirm routes fail.
- [ ] Implement normalized link validation and simple case-insensitive Postgres search over the indexed text fields; return a capped deterministic result list.
- [ ] Run route tests, typecheck, and browser flow: link two items, search by each type’s text, and open a result.
- [ ] Record evidence or escalate after one retry, then commit: `feat: add item links and unified search`.

### Task 8: Deployment and MVP acceptance

**Files:** Create Cloud Run container/deployment configuration, production environment documentation, and an end-to-end smoke test.

**Interfaces:** Produces one deployable service with `/api/health` and documented required environment variables; no separate worker or runtime-control service.

- [ ] Write a smoke test covering sign-in, capture, suggestion display, explicit acceptance, document edit, issue move, link, and search.
- [ ] Run it locally and confirm it initially identifies missing production configuration.
- [ ] Add the minimum single-container build/deploy configuration and environment-variable validation; keep provider secrets server-side.
- [ ] Run typecheck, all tests, production build, container startup, health check, and deployed smoke test.
- [ ] Add final command outputs and manual acceptance results to `STATE.md`; after one failed retry, log `INBOX.md` and escalate rather than declaring completion.
- [ ] Commit: `chore: package MVP for single-service deployment`.

## Completion evidence

MVP 0.1 is done when every task’s automated checks pass, the deployed smoke test passes, and manual verification proves: captures survive organization; no AI proposal mutates data before acceptance; all CRUD and cross-item links are owner-isolated; the board persists moves; and unified search returns each core type. Record exact commands, dates, and outcomes in `docs/loop/STATE.md` before release.

## Plan self-review

Coverage: Tasks 2–7 map to every in-scope product capability; Tasks 3–4 enforce the trust boundary; Tasks 1 and 8 cover platform and deployment. No optional MVP exclusions are represented as implementation work. Placeholder scan and interface-name consistency completed on 2026-09-05.
