# Yggdrasil

Yggdrasil is a personal, single-user workspace for turning captured thoughts into documents, projects, and issues without losing the original capture.

MVP 0.1 is intentionally small: an inbox, reviewable AI suggestions, documents, projects and issues, a simple board, item links, and unified search. AI may propose metadata, but it never changes user data until the user explicitly accepts it.

## Local database

Run `docker compose up -d postgres`, then `DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil npm run db:migrate`. For local browser use only, set `YGGDRASIL_DEV_OWNER_ID` to a UUID; it is ignored in production and bearer tokens still take precedence.

## Working contract

- [Product contract](docs/loop/PRODUCT.md)
- [Current execution state](docs/loop/STATE.md)
- [Inbox / decisions queue](docs/loop/INBOX.md)
- [MVP 0.1 design](docs/superpowers/specs/2026-09-05-yggdrasil-mvp-0.1-design.md)
- [MVP 0.1 implementation plan](docs/superpowers/plans/2026-09-05-yggdrasil-mvp-0.1.md)

Existing research remains under [docs/research](docs/research/).
