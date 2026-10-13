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

Tests write and truncate tables, so they refuse to start without `DATABASE_URL`, against the live local `yggdrasil` database, or against any Supabase host. Use a dedicated database:

```sh
docker compose up -d postgres
docker compose exec postgres createdb -U yggdrasil yggdrasil_test   # once
export DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_test
npm run db:migrate
npx vitest run --dir test
```

Per-ticket worktrees use their own DB (`yggdrasil_yg<n>`) the same way. Vitest ignores `.worktrees/**`.

## Working contract

- [Product contract](docs/loop/PRODUCT.md)
- [Current execution state](docs/loop/STATE.md)
- [Inbox / decisions queue](docs/loop/INBOX.md)
- [MVP 0.1 design](docs/superpowers/specs/2026-09-05-yggdrasil-mvp-0.1-design.md)
- [MVP 0.1 implementation plan](docs/superpowers/plans/2026-09-05-yggdrasil-mvp-0.1.md)

Existing research remains under [docs/research](docs/research/).
