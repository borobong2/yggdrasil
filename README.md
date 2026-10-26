# Yggdrasil

Yggdrasil is a personal, single-user workspace for turning captured thoughts into documents, projects, and issues without losing the original capture.

MVP 0.1 is intentionally small: an inbox, reviewable AI suggestions, documents, projects and issues, a simple board, item links, and unified search. AI may propose metadata, but it never changes user data until the user explicitly accepts it.

## Run locally with Docker

```sh
docker compose up -d --build   # app + Postgres; migrations run on app start
open http://127.0.0.1:3000
docker compose down            # stop; data stays in the `pgdata` volume
docker compose down -v         # stop and delete local data
```

The container signs requests in as the local dev owner `00000000-0000-4000-8000-000000000001` via `YGGDRASIL_DEV_OWNER_ID`. Postgres is also exposed on `127.0.0.1:54330` for host tools. Logs: `docker compose logs -f app`.

## Deploy

One Cloud Run service + Supabase, plus a daily local `pg_dump`: see the [deploy runbook](docs/deploy/README.md).

## Local database

Run `docker compose up -d postgres`, then `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil npm run db:migrate`. For local browser use only, set `YGGDRASIL_DEV_OWNER_ID` to a UUID; it is ignored in production and bearer tokens still take precedence.

## Run tests

Tests write and truncate tables. Use the isolated Docker setup below (`npm run test:db`),
then `npm test`. Never point tests at a DB containing user data.

## Working contract

- [Product contract](docs/loop/PRODUCT.md)
- [Current execution state](docs/loop/STATE.md)
- [Inbox / decisions queue](docs/loop/INBOX.md)
- [MVP 0.1 design](docs/superpowers/specs/2026-09-05-yggdrasil-mvp-0.1-design.md)
- [MVP 0.1 implementation plan](docs/superpowers/plans/2026-09-05-yggdrasil-mvp-0.1.md)

Existing research remains under [docs/research](docs/research/).

## HTML documents (YG-56)

In 문서, choose **HTML** next to **새 페이지** to create a static HTML page. It opens in reading mode; **소스 편집** edits the original HTML/CSS with autosave. Existing documents remain Markdown. HTML preview runs in an isolated iframe: native section links and answer disclosure work, while scripts, external assets, forms and external navigation are disabled.

Private study editions can be prepared without checking their contents into this repository:

```sh
# Supply YGGDRASIL_PAT through the environment. The directory contains published.json (source document IDs).
node scripts/publish-study-html.mjs /path/to/private/study --prepare
npx tsx scripts/generate-study-html.ts /path/to/private/study
CHECK_BASE_URL=http://127.0.0.1:3156 STUDY_HTML_DIR=/path/to/private/study node scripts/verify-html-documents.mjs
# Only after the HTML document API is deployed:
node scripts/publish-study-html.mjs /path/to/private/study --publish
```

Preparation reads current Markdown pages without remote writes. Publication checks source/output hashes, preserves original pages, refuses to overwrite user-edited editions, persists returned IDs for reruns, and reads each HTML document back. Private study screenshots go to the OS temporary directory (or `STUDY_EVIDENCE_DIR`), not the Git repository. The committed browser evidence uses synthetic examples.

## Small study visuals (YG-57)

Open **문서 → 시각화 모음**, or `#/documents/visuals`, for three short visual lessons: RAG, Word2Vec, and cosine similarity. Each supports previous/next steps, full playback/pause, a short explanation, and a self-check question. A direct link such as `#/documents/visuals/rag` opens that lesson.

The gallery lazy-loads Remotion Player and uses bundled React/SVG scenes. Existing documents and the HTML sandbox are unchanged. No rendering server or external media hosting is required. Run `CHECK_BASE_URL=http://127.0.0.1:3157 node scripts/verify-study-visuals.mjs` against the dev server for the browser acceptance check (API calls are mocked).

### Coverage and pre-push (YG-71)

```sh
npm ci                    # installs Husky for THIS worktree
npm run test:db            # Docker required; creates/migrates an isolated disposable DB
npm test                  # complete Vitest suite, serial files
npm run test:coverage     # same suite + V8 measurement and four global 90% gates
open coverage/index.html  # local HTML report; console also prints per-file coverage
```

`test:db` derives a DB/container name from the real worktree path, publishes PostgreSQL
only on `127.0.0.1` with a Docker-assigned port, and generates local credentials. It
stores the connection in ignored `.local/test-db.json` (mode 0600). It reuses only a
container labelled for this exact worktree, never deletes a container or database,
and migrates only that database. Run it again to start the container after a reboot.
To discard it, inspect the `container` field in that local file, stop/remove **that
container only**, then remove `.local/test-db.json`. Never use `docker compose down -v`
for test cleanup: the product compose file owns the local application DB.

An explicit `DATABASE_URL` overrides the saved connection. Both the runner and Vitest
setup require PostgreSQL on localhost and a DB named `yggdrasil_test_<suffix>`; choose
a unique suffix per worktree. All tests can write/truncate this database. Remote
hosts (including Supabase), the live `yggdrasil` DB and arbitrary DB names are refused.
Do not tunnel a production DB onto localhost. The gate checks connection and migration
before running tests; missing/unavailable/unmigrated DB exits nonzero with setup guidance.
Push never prepares or resets a database automatically. Do not run multiple test or
coverage commands concurrently in the same worktree (shared DB and report output).

Husky `pre-push` runs `npm run test:coverage`: test failures, DB failures and any metric
below 90% block push. `npm ci`/`npm install` runs `prepare`; rerun `npm run prepare` if
hooks were disabled during install. Git must support `extensions.worktreeConfig`.
The installer enables that shared extension but writes `core.hooksPath=.husky/_`
**only to the current worktree's `config.worktree`**, including in the main checkout.
It does not set/change the shared `core.hooksPath`; sibling worktrees keep their
previous hook behavior until they install this change themselves. Existing unusual
`core.worktree`/bare configurations fail with guidance rather than being migrated.
This replaces this worktree's prior hook path; integrate existing custom hooks manually.
`HUSKY=0 npm ci` skips installation for environments without Git hooks.

These are local checks: `git push --no-verify`, `HUSKY=0`, or editing Git config can
bypass them. They do not enforce a remote policy. CI/branch protection is outside YG-71.

Coverage includes **every `src/**/*.ts` and `src/**/*.tsx`**, even unimported files,
including client entry points and server startup. Only TypeScript declaration files
(`src/**/*.d.ts`) are excluded. Tests, scripts, dependencies and generated outputs
are outside the `src` product scope; no product files are removed from the denominator.
Type-only modules contribute no executable lines. Browser components run in jsdom
with real React components/events; fetch responses and unsupported browser APIs are
controlled at the boundary. Server integration tests still use real PostgreSQL.
Standalone Playwright scripts are separate checks and are **not** added to Vitest
coverage. See [measurement and verification record](docs/yg71-coverage.md).
