# AI-Native Workspace Ticket Plan

> Planning brief for the Yggdrasil expansion. This is the source for issue tickets; it is not authorization to start implementation before the product contract and detailed design are approved.

## Goal

Turn Yggdrasil into a single-owner AI-native development workspace: a requirement becomes a reviewable delivery plan, then connected documentation and execution work. AI and MCP clients may read context and propose work; a person explicitly accepts every persisted plan mutation.

## Product boundary

- Keep the single-owner boundary. Do not add teams, invitations, or presence.
- Reuse the existing TypeScript, React/Vite, Hono, Drizzle/Postgres, one-service deployment shape.
- Nexus is a read-only feature reference. Do not copy its source, wording, or design assets.
- Preserve every capture. AI generation, MCP reads, and proposal creation never mutate a work item.
- A proposal acceptance is atomic, auditable, and cannot be repeated.
- Direct GitHub OAuth is not a prerequisite: begin with validated external PR/commit/deployment URLs and add webhook syncing only when credentials are available.

## Nexus capability mapping

| Nexus reference capability | Yggdrasil ticket | Why it belongs |
|---|---|---|
| Documents and document tree | YG-02 | Connects decisions to execution context |
| Goal → Epic → Feature → Issue planning | YG-03 | Shows full-stack planning data modeling |
| Issue workflow, Kanban, backlog | YG-04 | Makes plans executable |
| Sprints and roadmap | YG-05 | Adds time-bound delivery planning |
| MCP issue/document/plan tools | YG-08 | Lets AI clients use real workspace context |
| GitHub PR linkage | YG-09 | Connects planned work with delivery evidence |
| Activity and notifications | YG-10 | Makes agent and user changes traceable |
| Capture + AI proposal + approval | YG-06, YG-07 | The differentiating AI-native trust boundary |

## Ticket order and dependency graph

```text
YG-00 → YG-01 → ┬→ YG-02 → YG-06 → YG-07 → YG-08
                  ├→ YG-03 → YG-04 → YG-05
                  └→ YG-09 ───────────────→ YG-10 → YG-11
```

`YG-02`, `YG-03`, and `YG-09` can proceed in parallel after `YG-01`.
`YG-06` must use the domain contracts from `YG-01` through `YG-03`; it must not invent a second work model.

## Issue-ticket backlog

### YG-00 — Replace the product contract

**Purpose:** Replace the paused Inbox-first MVP contract with the AI-native delivery-workspace contract.

**Scope:** Update the product contract, architecture design, execution state, acceptance criteria, and migration strategy. Explicitly choose the planning hierarchy and describe how existing captures/suggestions remain valid.

**Done when:** The document answers who owns data, what AI/MCP may do, what needs explicit approval, and how every ticket below proves its behavior.

**Depends on:** none.

### YG-01 — Establish the core work model

**Purpose:** Create one typed, owner-scoped model shared by API, UI, AI proposals, and MCP tools.

**Scope:** Migrations and contracts for project, goal, epic, feature, issue, document, item links, activity records, and external evidence URLs. Provide owner-scoped CRUD services and route validation.

**Done when:** A signed-in owner can create/read/update the hierarchy through tested APIs; cross-owner reads and writes fail; invalid parent/type combinations are rejected.

**Depends on:** YG-00.

### YG-02 — Deliver the document workspace

**Purpose:** Let a person create a durable design record and attach it to planned work.

**Scope:** Document tree, plain editor, rename/move, document-to-work-item links, and external evidence URL fields. Use a simple textarea/Markdown body before adding a rich-text dependency.

**Done when:** A document can be created, nested, edited, linked to a feature or issue, and retrieved by its owner after reload.

**Depends on:** YG-01.

### YG-03 — Deliver project planning hierarchy

**Purpose:** Make Project → Goal → Epic → Feature → Issue readable and editable in the UI.

**Scope:** Planning tree/detail views, parent selection, progress roll-up, and a single source of truth for status values.

**Done when:** Changing an issue status recomputes each ancestor's progress correctly and the UI agrees with the API after refresh.

**Depends on:** YG-01.

### YG-04 — Deliver execution board and backlog

**Purpose:** Turn planned issues into active execution work.

**Scope:** Fixed workflow states, issue board, ordered columns, drag/drop or explicit move action, and an unscheduled backlog.

**Done when:** An issue can move between backlog and board states with stable ordering and an activity record.

**Depends on:** YG-03.

### YG-05 — Deliver sprints and roadmap

**Purpose:** Add a time dimension to features without making the product a team-management clone.

**Scope:** Single-owner sprint CRUD, assign Feature/Issue to a sprint, unfinished-work carry-over, Feature start/end dates, and a simple roadmap timeline.

**Done when:** A user can schedule a feature, see it on the roadmap, close a sprint, and inspect carried-over work.

**Depends on:** YG-04.

### YG-06 — Generate reviewable AI delivery plans

**Purpose:** Convert a captured requirement into a proposal for a design document plus linked planning work in FE, BE, and documentation lanes.

**Scope:** Extend the existing suggestion provider and schema with a batch delivery-plan proposal. Validate structured output server-side. Show a read-only preview of the document and all proposed work before approval.

**Done when:** Generation stores a proposal only; no document, project, or issue is created until the owner accepts it. Provider errors, malformed output, and invalid lane data leave existing data unchanged.

**Depends on:** YG-02, YG-03.

### YG-07 — Accept plans atomically and preserve provenance

**Purpose:** Make human approval the only transition from AI proposal to durable work.

**Scope:** Single transaction that creates linked document/planning records, marks the proposal accepted, retains the capture, and records model/proposal/actor/timestamp provenance. Support dismissal without side effects.

**Done when:** A second acceptance attempt fails safely; any failed record creation rolls the transaction back; the UI exposes the original capture and accepted-plan record.

**Depends on:** YG-06.

### YG-08 — Expose an MCP workspace boundary

**Purpose:** Allow Codex, Claude, and Gemini to work from live Yggdrasil context without bypassing approval.

**Scope:** Streamable HTTP MCP endpoint, authenticated owner resolution, and a deliberately small first tool set: search workspace, read document, read planning tree, create capture, and request delivery-plan proposal.

**Done when:** An MCP client can use all five tools under a single owner; invalid credentials and cross-owner requests fail; no MCP tool directly creates or edits planned work.

**Depends on:** YG-07.

### YG-09 — Connect delivery evidence

**Purpose:** Link planned work to evidence of implementation.

**Scope:** Validated GitHub PR/commit/deployment URLs on issues, evidence list UI, optional GitHub webhook receiver that updates evidence status without changing issue state.

**Done when:** A linked PR is visible from its issue, malformed/unauthorized URLs are rejected, and a webhook request has a signature check before persistence.

**Depends on:** YG-01.

### YG-10 — Record activities and notify the owner

**Purpose:** Make important actions explainable after the fact.

**Scope:** Append-only activity records for work moves, plan generation/acceptance/dismissal, and evidence changes; activity timeline; owner-scoped SSE notifications for those events.

**Done when:** Each supported mutation creates exactly one activity record and an authenticated owner receives its event without another owner seeing it.

**Depends on:** YG-04, YG-07, YG-09.

### YG-11 — Verify, deploy, and package the case study

**Purpose:** Produce evidence that the product works and material that can be evaluated externally.

**Scope:** Browser happy path, trust-boundary regression suite, build/typecheck, deployed health check, 3-minute demo script, architecture diagram, and portfolio case draft.

**Done when:** A deployed run demonstrates capture → proposal → review → acceptance → board → external evidence, with exact verification output recorded in `docs/loop/STATE.md`.

**Depends on:** YG-08, YG-10.

## Suggested issue fields

Every ticket should include these fields before work starts:

- **Goal:** user-visible outcome in one sentence.
- **In scope / out of scope:** explicit boundary.
- **Data/API/UI:** exact contract or screen affected.
- **Acceptance checks:** one API/service check and one browser/manual check.
- **Trust rule:** whether it may mutate user data and who approves it.
- **Dependencies:** ticket IDs.
- **Evidence:** commit, test command, deployed URL, or demo recording.

## One-week lane schedule

| Day | Primary lane | Parallel lane |
|---|---|---|
| 1 | YG-00 + YG-01 contract, schema, API contracts | Test fixtures and migration verification |
| 2 | YG-02 documents | YG-03 planning hierarchy |
| 3 | YG-04 board/backlog | YG-05 sprint/roadmap |
| 4 | YG-06 AI plan generation | YG-09 evidence links/webhook boundary |
| 5 | YG-07 atomic approval | YG-08 MCP boundary |
| 6 | YG-10 activity/SSE | Regression and browser-flow coverage |
| 7 | YG-11 deployment/demo/portfolio | Fix only failures found by verification |

## Portfolio narrative enabled by this plan

"Built a single-owner AI-native development workspace using React, Hono, Drizzle, Postgres, Cloud Run, and MCP. The system turns requirements into reviewable FE/BE/documentation delivery plans, preserves source context and provenance, and requires explicit human acceptance before creating connected execution work."
