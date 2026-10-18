# HTML Study Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development only if the user chooses delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read and edit HTML documents inside Yggdrasil and deliver all seven newly created exam study documents as mobile-friendly HTML.

**Architecture:** Add an explicit document format with Markdown as the backward-compatible default. Render HTML in an isolated, script-free iframe in the existing authenticated document workspace; retain original source for editing. Create HTML editions of the study materials under the existing exam tree, preserving original Markdown and user study records.

**Tech Stack:** React/TypeScript, Hono, Drizzle/Postgres, MCP, native browser DOMParser and iframe sandbox/CSP, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-html-study-documents.md`

**Ticket/work order:** YG-56, `docs/yg-56-html-study-documents.md`.

## Global Constraints

- Existing pages remain Markdown. No public hosting of private study material.
- HTML is source text; it must not pass through the Markdown parser/serializer.
- Existing body limit: 100,000 JavaScript string characters per document; split longer pages rather than truncate.
- No HTML scripts, external requests, forms, nested frames, top navigation or same-origin app access.
- Existing progress, questions, document IDs and links are preserved.
- Mobile acceptance: 360, 390 and 768 CSS-pixel viewports; no horizontal document overflow. Long tables/code may scroll inside their own regions.
- Minimum readable study text 17 CSS px, line height at least 1.7, answer-disclosure tap targets at least 44 CSS px.
- Keep every recorded exam topic, including NLP sentiment analysis. Practice questions are labeled practice; no invented exam dates.
- Dedicated test DB only. Feature worktree and branch only; no implementation on main.

## Review Focus

1. Legacy records and clients without format must still create/read Markdown. Task 1 pins this.
2. Editing a title, icon or navigating during a delayed save must never rewrite HTML as Markdown or cross document IDs. Task 2 pins this.
3. Hostile/malformed HTML (meta refresh/base, event attributes, SVG/MathML, links and CSS URLs) cannot execute or contact external hosts. Task 2 pins this in a browser.
4. Mobile embedded reading must scroll, reveal answers, and reach anchored sections without clipping. Tasks 2 and 3 pin this.
5. Re-running the content upload or encountering a partial failure must not duplicate or overwrite user records. Task 3 pins this.

---

## Task 1: Persist and expose document format

**Files:** Modify `src/contracts/items.ts`, `src/server/schema.ts`, `src/server/documents.ts`, `src/server/routes/documents.ts`, `src/server/mcp-documents.ts`. Create the next available Drizzle migration (currently `0020_document_format.sql`) with generated metadata. Extend `test/documents.test.ts` and `test/mcp-documents.test.ts`.

**Interfaces:** Export `DocumentFormat = 'markdown' | 'html'`; `Document.format: DocumentFormat`. Add final defaulted argument `format: DocumentFormat = 'markdown'` to `createDocument`; accept optional format in `updateDocument`. REST/MCP create accepts optional format defaulting to markdown; update accepts optional format; read/list returns format.

- [ ] Write route tests: absent format returns markdown; HTML create/save/read/list preserves exact source; invalid formats return 400; title-only update preserves format/body; foreign-owner read/write remains 404.
- [ ] Write MCP tests: existing clients still create markdown; format html creates and updates exact HTML; listing includes format; invalid enum rejected; HTML append rejected to avoid concatenating complete documents. Existing Markdown append stays supported.
- [ ] Run these tests with the dedicated YG-56 DB and record the expected missing-format failures.
- [ ] Add `format text NOT NULL DEFAULT 'markdown'` and a database check for markdown/html; generate migration metadata using repository Drizzle conventions. Add service-level validation too, so direct calls cannot bypass constraints. Pass format through route/MCP/service mappers and include it in creation activity metadata.
- [ ] Migrate a dedicated DB seeded with a legacy Markdown document and assert unchanged ID/body with format markdown. Re-run targeted tests, full typecheck and commit the task.

## Task 2: Isolated HTML reader and source editor

**Files:** Create `src/client/HtmlDocument.tsx`, `src/client/html-document.ts` and `test/html-document.test.ts`; modify `src/client/DocumentsWorkspace.tsx`. Add browser checks in `scripts/verify-html-documents.mjs` following existing Playwright/browser conventions.

**Interfaces:** `buildHtmlPreview(source: string): string` builds an isolated preview using DOMParser; `<HtmlDocument body={string} onChange={(body: string) => void} />` owns preview/source mode. `DocumentsWorkspace` chooses it only when document.format is html, keys it by document ID, and uses its existing save state/error flow.

- [ ] Write browser tests for preview, source edit/reload, unchanged HTML after title-only edits, document switching with pending saves, native details/summary, and narrow-screen source editing. Write DOM-based tests for input containing scripts, meta/base/refresh, event attributes, nested frames/forms, SVG/MathML and javascript/external URLs.
- [ ] Run the new tests and record expected failure because the reader/format branch is absent.
- [ ] Implement DOMParser-based preview construction from a strict HTML element/attribute allowlist; omit source-supplied meta/base/active elements and event attributes. Permit bundled CSS, semantic text, tables and native disclosure. Links may retain fragment-only hrefs; images, external assets and external navigation are outside this first release.
- [ ] Prepend application-controlled CSP: default-src none, script-src none, style-src unsafe-inline, connect-src none, img-src none, font-src none, frame-src none, object-src none, base-uri none, form-action none. Use an iframe with empty sandbox permissions, descriptive title and a bounded responsive reading height. Do not add allow-scripts or allow-same-origin.
- [ ] Add reading/source controls and explicit format choice when creating an HTML page; do not offer silent format switching for populated documents. Keep preview within the existing title/tree shell. Use wrapped source textarea with the current save state and prevent Markdown block serialization for HTML.
- [ ] Verify browser attacks cause no top-level state change, no test marker execution and no external requests; details and anchors still work. At 360/390/768 widths, assert app and document widths fit, long tables/code overflow only in their containers, and vertical scrolling reaches the last section.
- [ ] Run full unit/integration suite, typecheck, build, and diff whitespace check. Commit.

## Task 3: Mobile HTML editions of all current study pages

**Files:** Keep private generated study assets in `/Users/bong/github/graduate-school/kookmin/26Y-02/yg-exam-docs/commute/`. Add HTML files alongside the seven Markdown sources, a publication manifest containing source IDs, edition IDs and checksums, and an uploader using the existing MCP SDK pattern. Do not commit private study content to a public repo.

**Interfaces:** Existing sources: `plan.md`, `llm-core.md`, `llm-qa.md`, `llm-mock.md`, `nlp-core.md`, `nlp-qa.md`, `nlp-practice.md`. Each maps to one HTML edition unless the 100,000-character limit requires splitting. MCP `create_document`/`update_document` uses format html. Source Markdown pages remain unchanged except for appended HTML edition links after reading current content.

- [ ] Validate source coverage counts (LLM core 23, LLM QA 46, LLM exam 23, NLP QA 42), all named NLP scope topics including sentiment analysis, no missing answer text, no fabricated dates, and body length under 100,000. Check local generated pages contain no scripts or remote assets.
- [ ] Generate designed HTML: one calm typography system, 17–18 px base text, comfortable line height, short concept sections, examples/pitfalls, headings and section links. Convert wide concept-answer tables to stacked cards on mobile; put unavoidable numerical tables/code inside scroll regions. Use semantic details/summary for answers. Make controls touch-friendly and respect reduced-motion preference.
- [ ] Capture local desktop and mobile previews; verify expected counts and native disclosure in a sandboxed iframe, not only as standalone HTML.
- [ ] After application verification, branch review and deployment, read current Yggdrasil source pages again. Detect source changes since generation and refresh affected editions rather than overwrite later user edits.
- [ ] Publish editions sequentially, persisting each returned ID immediately; reruns use the manifest and read-before-update, refusing unexpected remote changes. Read back format and exact body after every write. Append edition links to existing hubs and study plan without replacing existing text/progress.
- [ ] Verify all edition links work inside production Yggdrasil on mobile. Record URLs and evidence, then report completion.

## Execution and release commands

After plan approval, create branch `feat/yg-56-html-study-documents` in `.worktrees/yg-56` following the using-git-worktrees skill. Run dependency setup there. Use a new disposable database named `yggdrasil_yg56`; set DATABASE_URL to that DB for every migration/test. Follow `test/setup.ts` protections and the deploy runbook. Run `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`, and the HTML browser acceptance script. If baseline fails, report it before continuing. No production DB tests.

Review the complete branch using the applicable review workflow, integrate according to repository rules, deploy only the verified commit using `docs/deploy/README.md`, confirm health and HTML functionality, then publish the study editions. The user requested in-app delivery; local-only HTML is not completion.

## Self-review

The plan covers persistence, REST/MCP read/write, backward compatibility, isolated rendering, source editing, mobile reading, content completeness, preservation, publication and verification. Every review-focus condition has a task-level test. No new frontend framework or HTML-script runtime is required. Native execution approved by the user. The follow-up delivery request is implementation plus PR; production deployment and study publication remain post-merge steps.
