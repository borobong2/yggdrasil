# YG-01 Core Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one authenticated owner create, read, update, and delete Goal → Epic → Issue records and issue or revoke a personal access token.

**Architecture:** A focused work service owns owner-scoped hierarchy persistence; routes only validate JSON and translate ownership/parent failures to HTTP responses. PATs live in a second focused service and persist only a SHA-256 digest. The React shell stores an existing Supabase bearer session token in session storage and uses it for the small login-status and PAT-management views.

**Tech Stack:** TypeScript, Hono, Drizzle/Postgres, React/Vite, Vitest, Node `crypto`.

**Spec:** `docs/yg-01-core-model.md`

## Global Constraints

- Work kinds are exactly `goal`, `epic`, and `issue`; Project, Feature, documents, links, MCP, capture, and proposal behavior are out of scope.
- Every work and PAT read/mutation filters by authenticated `owner_id`; an inaccessible parent or resource returns 404.
- An Issue defaults to `backlog` and `medium`; allowed statuses are `backlog|todo|doing|done` and priorities are `low|medium|high`.
- Due dates are optional ISO-8601 timestamps and are serialized as ISO strings.
- PAT plaintext is returned only by `POST /api/pats`; PostgreSQL stores a SHA-256 hash, never plaintext.
- UI uses an existing bearer session only; it does not implement Supabase email/password or OAuth sign-in.

---

### Task 1: Freeze core contracts and schema migration

**Files:**
- Create: `drizzle/0003_core_work.sql`
- Modify: `drizzle/meta/_journal.json`, `src/contracts/items.ts`, `src/server/schema.ts`
- Test: `test/work.test.ts`, `test/pats.test.ts`

**Interfaces:**
- Produces: `WorkKind`, `Goal`, `Epic`, `Issue`, `IssueStatus`, `Priority`, `PersonalAccessToken`, and `IssuedPersonalAccessToken` contracts.
- Produces: `goals`, `epics`, `issues`, and `personal_access_tokens` Drizzle tables.

- [ ] **Step 1: Write failing API tests that import and exercise the planned contracts/routes.**

```ts
expect((await app.request('/api/goals', { method: 'POST', headers, body: JSON.stringify({ title: 'Ship core' }) })).status).toBe(201);
expect((await app.request('/api/pats', { method: 'POST', headers, body: JSON.stringify({ label: 'MCP' }) })).status).toBe(201);
```

- [ ] **Step 2: Run the focused tests and verify they fail because routes are absent.**

Run: `npm test -- test/work.test.ts test/pats.test.ts`
Expected: FAIL with 404 responses.

- [ ] **Step 3: Add the contracts, tables, and append-only migration.**

```sql
CREATE TABLE goals (id uuid PRIMARY KEY, owner_id uuid NOT NULL, title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE epics (id uuid PRIMARY KEY, owner_id uuid NOT NULL, goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE, title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE issues (id uuid PRIMARY KEY, owner_id uuid NOT NULL, epic_id uuid NOT NULL REFERENCES epics(id) ON DELETE CASCADE, title text NOT NULL, status text NOT NULL DEFAULT 'backlog', priority text NOT NULL DEFAULT 'medium', due_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
```

- [ ] **Step 4: Apply the migration locally.**

Run: `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil npm run db:migrate`
Expected: migration `0003_core_work` applies successfully.

### Task 2: Implement and test owner-scoped hierarchy API

**Files:**
- Create: `src/server/work.ts`, `src/server/routes/work.ts`, `test/work.test.ts`
- Modify: `src/server/app.ts`
- Test: `test/work.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts and Drizzle tables.
- Produces: `POST|GET /api/goals`, `GET|PATCH|DELETE /api/goals/:id`; corresponding Epic and Issue endpoints. Create payloads use `{ title }`, `{ title, goalId }`, and `{ title, epicId, priority?, dueAt? }`; PATCH accepts only editable fields.

- [ ] **Step 1: Write focused failing tests.**

```ts
const goal = await createGoal('Goal');
const epic = await createEpic(goal.id, 'Epic');
const issue = await createIssue(epic.id, 'Issue', { priority: 'high', dueAt: '2026-10-01T00:00:00.000Z' });
expect(issue).toMatchObject({ status: 'backlog', priority: 'high' });
expect((await app.request('/api/epics', { method: 'POST', headers: other, body: JSON.stringify({ title: 'foreign', goalId: goal.id }) })).status).toBe(404);
```

- [ ] **Step 2: Run the work suite and verify it fails for missing endpoints.**

Run: `npm test -- test/work.test.ts`
Expected: FAIL with 404 before route registration.

- [ ] **Step 3: Implement minimal service and route validation.**

```ts
const parent = await db.select().from(goals).where(and(eq(goals.id, goalId), eq(goals.ownerId, ownerId))).limit(1);
if (!parent[0]) throw new NotFoundError();
```

Validate nonempty trimmed titles, UUID route/parent IDs, allowed priority/status, and valid ISO due dates. Select/update/delete by both `id` and `owner_id`; use cascade FKs for hierarchy deletion.

- [ ] **Step 4: Run focused tests and verify green.**

Run: `npm test -- test/work.test.ts`
Expected: PASS for CRUD, defaults, date/priority updates, invalid parent/type/input, and owner-one/owner-two isolation.

### Task 3: Implement and test hashed PAT management API

**Files:**
- Create: `src/server/pats.ts`, `src/server/routes/pats.ts`, `test/pats.test.ts`
- Modify: `src/server/app.ts`, `src/server/schema.ts`
- Test: `test/pats.test.ts`

**Interfaces:**
- Consumes: `PersonalAccessToken`/`IssuedPersonalAccessToken` and the PAT table from Task 1.
- Produces: `GET /api/pats`, `POST /api/pats { label }`, `POST /api/pats/:id/revoke`.

- [ ] **Step 1: Write failing security tests.**

```ts
const issued = await (await app.request('/api/pats', { method: 'POST', headers, body: JSON.stringify({ label: 'MCP' }) })).json();
expect(issued.token).toMatch(/^ygpat_/);
expect((await pool.query('SELECT token_hash FROM personal_access_tokens WHERE id = $1', [issued.id])).rows[0].token_hash).not.toBe(issued.token);
expect((await app.request(`/api/pats/${issued.id}/revoke`, { method: 'POST', headers: other })).status).toBe(404);
```

- [ ] **Step 2: Run the PAT suite and verify red.**

Run: `npm test -- test/pats.test.ts`
Expected: FAIL with 404 before PAT routes exist.

- [ ] **Step 3: Implement the minimal SHA-256 issue/list/revoke service.**

```ts
const token = `ygpat_${crypto.randomBytes(32).toString('base64url')}`;
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
```

Return `token` only on issuance. List and revoke responses use `PersonalAccessToken`, which has no plaintext token field. Revoke only a matching owner row and leave revoked tokens listable.

- [ ] **Step 4: Run the PAT suite and verify green.**

Run: `npm test -- test/pats.test.ts`
Expected: PASS for one-time token return, hash-only persistence, owner isolation, invalid label/ID rejection, and revocation.

### Task 4: Add bearer-session status and PAT settings UI

**Files:**
- Create: `src/client/LoginView.tsx`, `src/client/PatSettings.tsx`
- Modify: `src/client/main.tsx`, `.env.example`
- Test: manual browser acceptance

**Interfaces:**
- Consumes: `GET|POST /api/pats` and `POST /api/pats/:id/revoke` with `Authorization: Bearer <existing session token>`.
- Produces: a session-token status/save/clear control and an accessible PAT issue/list/revoke view that displays an issued plaintext token once.

- [ ] **Step 1: Build the smallest UI on the frozen API.**

```tsx
const headers = token ? { authorization: `Bearer ${token}` } : {};
<LoginView token={token} onChange={setToken} />
<PatSettings token={token} />
```

Use `sessionStorage` to retain the existing session for the current browser session. Include loading, no-session, empty-token-list, and API-error states. Never persist or re-render a newly issued plaintext token after component unmount/reload.

- [ ] **Step 2: Typecheck and build the client.**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Run browser acceptance with a real existing Supabase session.**

Run: `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil npm start`
Expected: after entering an existing bearer session, the page reports authenticated status; a PAT appears once after issuance, remains listed after refresh without plaintext, and becomes revoked after the revoke action.

### Task 5: Run integration verification and record evidence

**Files:**
- Modify: `docs/loop/STATE.md`

- [ ] **Step 1: Run the full automated suite.**

Run: `npm test && npm run typecheck && npm run build && git diff --check`
Expected: PASS.

- [ ] **Step 2: Re-run migrations against the local Postgres database.**

Run: `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil npm run db:migrate`
Expected: reports all migrations applied successfully.

- [ ] **Step 3: Record exact command results and browser outcome in `docs/loop/STATE.md`.**

Include owner-one/owner-two API outcomes, invalid-parent result, hash/revocation result, migration output, and browser outcome. Do not include bearer tokens or PAT plaintext.

- [ ] **Step 4: Commit the validated ticket.**

```bash
git add drizzle src test docs .env.example
git commit -m "feat: add owner-scoped core work model"
```
