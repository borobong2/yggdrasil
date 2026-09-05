# Yggdrasil MVP 0.1 design

**Date:** 2026-09-05
**Status:** approved execution contract

## Purpose

Build a calm personal workspace where a capture can be recorded immediately and organized later without the system losing the original thought or silently changing it.

## Product shape

The app has one authenticated owner. The default screen is the inbox: a person captures plain text, sees all unprocessed captures, and decides whether an AI proposal should create or update a document, project, or issue. The source inbox record remains available after acceptance.

Documents form a tree and have editable content. Projects group issues. Issues have a small fixed status set (`todo`, `doing`, `done`) and appear in a board. Any two core items can have a typed link. Search returns matching accessible items across all four types.

## Trust model

AI work is asynchronous suggestion generation. A suggestion contains the proposed title, target core type, and optional target context, plus its source capture and status. Generating, viewing, retrying, or dismissing a suggestion cannot alter an item. Only an authenticated explicit accept action may apply it, in one database transaction, while retaining the original capture and an acceptance record.

Invalid suggestions, unavailable AI, and a failed acceptance leave the capture untouched and show an actionable error. The first release may use a server-side provider adapter, but the interface must keep provider credentials off the browser and must allow a deterministic fake in tests.

## Architecture

One Cloud Run service serves the Vite-built React app and a Hono JSON API. Supabase Auth supplies the user identity; Hono verifies the bearer token and passes the authenticated user ID to every database operation. Postgres is accessed through Drizzle, and every user-owned query filters by that user ID.

Use a small shared TypeScript contracts module for API payloads and item discriminators. Keep route handlers thin: validate input, call a focused service, return typed JSON. Do not add realtime, queues, separate workers, or a runtime-control subsystem in MVP 0.1.

## Data model

- `captures`: immutable source text, owner, timestamps, processing state.
- `suggestions`: capture reference, proposed title/type/target, status (`pending`, `accepted`, `dismissed`, `failed`), model metadata, timestamps.
- `documents`: owner, optional parent document, title, body, timestamps.
- `projects`: owner, title, description, timestamps.
- `issues`: owner, optional project, title, description, status, position, timestamps.
- `item_links`: owner, source type/id, target type/id, relation label, timestamp; reject self-links and duplicates.

Captures are not overloaded as structured items. Search projects a normalized result shape from captures, documents, projects, and issues. Links use a polymorphic pair because the core types are deliberately few.

## Primary flows and acceptance criteria

1. Capture: submit text; it appears immediately in inbox and remains readable after later organization.
2. Suggestion: request analysis; the UI displays title/type/target without changing existing records.
3. Accept: accept once; exactly one chosen structured result is created or updated, the capture remains, and repeat acceptance is rejected safely.
4. Documents: create, nest, rename, edit, and navigate documents inside the owner boundary.
5. Work: create/update/delete projects and issues; move an issue between three board columns.
6. Context: create/remove links and search all core types by title/body/capture text.

## Quality and delivery

Each vertical loop must include route/service tests for its trust boundary plus a browser-level happy path. A loop is accepted only after its commands pass, its manual check passes, and evidence is added to `docs/loop/STATE.md`. Retry a directly caused failure once; then record and escalate it through `docs/loop/INBOX.md` instead of rolling work forward silently.

## Explicit exclusions

No teams, invitations, sprints, realtime notifications/presence, monitoring, direct third-party runtime integration, or custom run/session/checkout features. These are future product decisions, not latent scaffolding requirements.
