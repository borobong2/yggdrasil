# HTML documents inside Yggdrasil

Status: design and native implementation approved by user on 2026-10-19. Implementation reviewed; PR delivery requested. Production deployment remains pending.

## User outcome

The user can open attractive, mobile-friendly study material directly in Yggdrasil's authenticated Documents workspace. A separate website or external learning link does not meet the requirement. The initial content is the existing LLM and NLP exam preparation material, with all recorded exam topics retained.

## Proposed experience

Documents have an explicit Markdown or HTML format. Existing pages remain Markdown. An HTML document opens in reading mode within the existing document navigation and title shell. An Edit action exposes the HTML source; Preview returns to the rendered page. Clearly explain unsaved and save-error states. Switching an existing document's format must not silently reinterpret or discard its body; creating HTML pages for the exam material avoids conversions of existing user records.

Study HTML uses comfortable mobile typography, short concept sections, clear definition/example/comparison groups, wrapping tables, and native details/summary answer disclosure. Provide in-document navigation and visible source/scope notes. Start with script-free HTML and CSS: progress persistence and custom JavaScript widgets are outside the first release.

## Storage and API

Add a format field with allowed values markdown and html, defaulting existing records and omitted create inputs to markdown. Carry the field through the database migration, Document contract, document service, UI API, MCP create/update/read/list outputs, and activity metadata as appropriate. Keep body limits explicit and consistent; measure generated study pages before upload and split pages rather than silently truncating.

An HTML body is stored as source, without Markdown block parsing or serialization. Saving HTML must preserve it byte for byte within existing normalization rules. Returning from preview must not trigger destructive autosaves. Existing Markdown read/write behavior and issue links remain compatible.

## Rendering boundary

Render HTML in a sandboxed srcDoc iframe without allow-scripts, allow-same-origin, forms, popups, or top navigation. Apply a restrictive document CSP: block scripts, connections, external assets, nested frames, objects and form actions; permit inline styles required by generated study material. Strip/neutralize document-supplied CSP/base/navigation mechanisms before injecting the application-controlled policy, using a reviewed HTML parser/sanitizer strategy. Do not directly inject arbitrary stored HTML into the app DOM.

Keep app navigation outside the iframe. Choose internal frame scrolling with a clearly bounded viewport initially; do not loosen sandbox isolation to implement auto-height. Verify mobile touch scrolling and section-anchor navigation in the actual browser. External links should not become an escape route from the reader; source references can be displayed in the application shell or as plain labels in the first release.

## Initial study content

Create HTML editions beneath the existing exam parent pages, preserving existing Markdown documents and user progress/questions. Include the eight-session study plan; LLM 23-topic core, 46 recall questions and 23-question practice exam; NLP full announced scope, 42 recall questions, exercises and answers. Include sentiment analysis even though the lecture recording notes it was deferred. Use existing source-backed answers and maintain the distinction between instructor scope and generated practice questions.

Avoid importing outdated date-specific plans from older HTML assets. Exam dates and actual commute duration remain unknown; sessions are learning blocks, not a calendar promise. Do not publish lecture files or private study content to a public host.

## Verification and release

Verify migration/default behavior, API/MCP format validation and round trips, existing Markdown compatibility, HTML source preservation and preview/edit transitions. Browser checks must cover responsive reading, details disclosure, section links, save failures and iframe isolation (scripts, same-origin access, network requests and top navigation blocked). Run repository-required checks in a dedicated test database, never production. Complete branch review and deployment validation before adding production study pages; read each created page back to verify body and format.

## Implementation boundary

This changes persistence, public contracts and the document UI and is therefore architectural. After design approval, prepare the implementation plan and the required YG ticket work order. Implement in a feature worktree; do not edit main. The user request authorizes preparation of this design, not an assertion that HTML viewing is already deployed.

## User-confirmed addition

The user approved this direction and explicitly requested HTML editions of the documents created in this session, usable on mobile within Yggdrasil. The first delivery covers all seven study documents.
