# YG-56 execution ledger

- User approved design and proceeding with native implementation.
- Worktree created from main 5095592.
- Ruling: use browser-native DOMParser allowlist with sandbox/CSP; no sanitizer dependency is needed for isolated static HTML.
- Task 1 RED: route/MCP new tests failed because format was undefined. GREEN: 16/16 passed after adding format migration/service/REST/MCP.
- Baseline note: initial full suite discovered the newly added route RED test during its scan; 196 existing tests passed, one expected new failure. Subsequent full suite will run serially after changes.
- Ruling: migration metadata follows the repository's handwritten SQL + journal convention (no snapshots exist), rather than generating a first full-schema snapshot.
- User narrowed the immediate deliverable to implementation and PR. Production migration/deployment and private content publication wait for the reviewed PR; prepare and verify HTML editions locally now.
- Task 2 browser RED: HTML reader absent. First GREEN attempt exposed a test timing issue: Playwright click doesn't await the asynchronous save/navigation handler; wait for the target title before asserting persistence.
- Task 2 HTML preview/source editor implemented. Browser tests cover exact source round trips, reload, save failure/retry, pending-save navigation, fragment anchors, disclosure, sandbox isolation and CSP-blocked requests.
- Found/fixed real srcDoc anchor bug: fragment URLs otherwise resolve against the embedding app; preview rewrites them to about:srcdoc fragments.
- Found/fixed tablet readability: at 768px the app sidebar plus document tree squeezed the reader. HTML pages now hide the document tree below xl and use compact reader padding; mobile/tablet minimum reader widths are tested.
- CSP diagnostics: Playwright reports attempted CSS requests even when blocked. The test asserts each attempt fails specifically with csp, rather than treating the attempted-request event as a network leak.
- Study editions: all seven current Yggdrasil source pages pulled read-only, converted locally; 46 LLM and 42 NLP answer disclosures validated. No production document writes.
- Publication integration test passed: seven editions, rerun without duplication, original Markdown preserved, changed sources or user-edited editions rejected before writes.
- Full suite after persistence/UI: 38 files, 198 tests passed. Final suite includes the new publication integration test.
- Fresh reviewer found two Important issues. Both were reproduced with failing regression tests: navigation finishing before newer edits were saved, and prepare→publish reusing stale generated HTML.
- Fixed saves by retaining pending jobs by document ID and draining all jobs before navigation. Failed jobs merge with newer changes for that document; other jobs are retained.
- Fixed publication provenance by binding each generated HTML hash to the exact input Markdown hash; preflight rejects stale or modified outputs before writes.
- Repository is public. Private study sources/HTML and real study screenshots remain outside Git; committed browser screenshot uses synthetic fixtures only.

- Fresh reviewer rechecked both fixes: no remaining Important/Critical issues.
- Mobile browser acceptance passed with 360/390/768 widths, minimum readable iframe width, in-flight edits, failed navigation/save retry and all seven study editions. Real study preview inspected locally; no private content committed.
