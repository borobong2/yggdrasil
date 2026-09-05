# Yggdrasil product contract

## Product

Yggdrasil is an Inbox-first workspace for one person running their work. It keeps every capture, then lets the person deliberately organize it into documents, projects, and issues.

## MVP 0.1 outcome

A signed-in person can capture an item, review an AI-proposed title/type/target, explicitly accept or dismiss that proposal, edit documents, manage projects and issues on a simple board, link related items, and find all of it through one search.

## Non-negotiable rules

1. Every capture is preserved; conversion or organization creates/updates structured records without deleting the source capture.
2. AI may propose a title, core type, and target. It must not mutate persisted user data until the person explicitly accepts a specific proposal.
3. Core types are `inbox`, `document`, `project`, and `issue`.
4. MVP scope is personal and single-user. Authorization must still isolate data by authenticated user.
5. Product, copy, UI, and implementation are clean-room work. Do not copy source, wording, or design assets from external products.

## In scope

- Inbox capture and retention
- AI suggestion creation and explicit approval/dismissal
- Document tree and editor
- Project and issue CRUD
- A simple issue board
- Links between items
- Unified search

## Out of scope

- Teams, invitations, or shared workspaces
- Sprints
- Realtime notifications or presence
- Monitoring dashboards
- Direct third-party agent-runtime integration
- Custom run, session, or checkout systems

## Technical boundary

Use TypeScript, React with Vite, Hono, Supabase Postgres/Auth, Drizzle, and one Cloud Run service. Do not install dependencies or scaffold an application as part of this documentation contract.

## Completion evidence

MVP 0.1 is complete only when the acceptance checks in the implementation plan pass against a deployed single-service environment, including the preservation and explicit-acceptance rules.

## Delivery loop

Each vertical loop has one user-visible outcome, automated checks, a manual acceptance check, and a small commit. Retry a failed check once after reading its direct cause; if it still fails, record the failure and next hypothesis in `STATE.md` and escalate with the command output. Do not hide failed verification behind a later loop.
