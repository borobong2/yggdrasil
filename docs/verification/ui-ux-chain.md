# UI UX sequential chain (2026-10-27)

Each branch starts from the previous verified local commit. No push, main merge or deployment. All API browser fixtures are synthetic; database tests use each worktree's disposable Docker DB. No production data used.

## YG-73

- Worktree: `/Users/bong/github/workspaces/yggdrasil/feat-yg-73-edit-exit-guard`
- Branch: `borobong2/feat-yg-73-edit-exit-guard`
- Root cause: close/cancel/backdrop/Esc and completion bypassed draft and pending-write checks.
- Changes: native discard confirmation; synchronous duplicate-write guard; busy input/close protection; save-before-promotion guidance; native dialog cleanup and opener focus restoration. Existing neutral/green tokens retained, no autosave/dependency added.
- Red: 6 new regressions failed against original implementation. Green: related 33 tests; full coverage 62 files / 408 tests passed. Statements/lines 96.76%, branches 91.51%, functions 92.88%. Common jsdom close lifecycle polyfill added after integration tests exposed its absence.
- `npm run typecheck`, `npm run build`, `git diff --check`: passed.
- Installed exact lockfile with `npm ci`; audit reported 18 existing vulnerabilities (9 moderate, 6 high, 3 critical); dependency upgrades excluded.
- Real headless Chrome at 390, 320 and 1280 × 900: Escape stay/discard, opener focus, delayed-save close guard, failed-save draft preservation and no document horizontal overflow passed. Screenshots and runnable synthetic harness are in ignored `.local/yg73-{width}.png`, `.local/qa.{html,tsx,mjs}`. 320 screenshot visually inspected.
- Limits: synthetic component fixture, no authenticated production E2E or physical mobile/Safari. Native confirmation wording/buttons depend on browser locale. Browser tab/navigation exit guard is outside the ticket's specified close paths.

## YG-74

- Worktree: `/Users/bong/github/workspaces/yggdrasil/feat-yg-74-mobile-touch`
- Branch: `borobong2/feat-yg-74-mobile-touch`; explicit Orca base/parent YG-73, starting HEAD `6c7c9e6` and ancestry verified.
- Coarse-pointer controls get real 44px hit boxes; checkbox retains 18px visual; weekday buttons wrap; board selection/title/menu reserve space. Calendar event chips stay compact; desktop density unchanged.
- Browser red: original checkbox failed the 44px geometry assertion. Green: real Chrome 390/320/1280 measured hit boxes, row non-overlap, weekday controls, keyboard Space completion, dialog close, no document overflow. 320 screenshot visually inspected; `.local/yg74-{width}.png`, `.local/touch.mjs` hold evidence/self-check.
- Related tests: 68 passed. Typecheck/build/diff check passed. Full coverage result below.
- Limits: synthetic fixtures, no physical touch hardware/Safari or production E2E. Typography intentionally deferred to YG-77. New worktree installed via lockfile and uses its own disposable DB.
- Full suite: 62 files / 408 tests passed; coverage statements/lines 96.76%, branches 91.51%, functions 92.88% (90% gate unchanged).
- Additional board browser self-check at all three widths passed: selection/title spacing, bulk toolbar viewport fit, menu target/dropdown spacing. It caught and corrected an over-broad padding selector affecting the checkbox button; final touch self-check rerun passed. Evidence `.local/yg74-board-{width}.png`, `.local/board.mjs`.

## YG-75

- Worktree: `/Users/bong/github/workspaces/yggdrasil/feat-yg-75-today-retry`
- Branch: `borobong2/feat-yg-75-today-retry`; Orca explicit base/parent YG-74; starting HEAD `a00ffde` and ancestry verified.
- Initial failure offers retry; refresh failure retains visible data and announces stale content. Pending retry is disabled and announced. Latest request wins; requests predating optimistic changes cannot clear hidden items or replace data. Token changes/unmount invalidate pending responses.
- Red: all 3 added recovery/race tests failed on original code. Green: Today tests 12 passed, including initial retry/duplicate click, refresh failure/recovery, token response order and completion race. Existing completion/bulk/undo tests retained.
- Typecheck/build/diff check passed. Chrome 390/320/1280: keyboard Enter retry, pending feedback, retained rows on refresh failure, stale completion response, successful recovery/error clearing, no document overflow passed. `.local/recovery.mjs` and `.local/yg75-{width}.png`; 320 image visually inspected.
- Limits: fixtures and headless Chrome, no physical mobile/Safari or production E2E; an intentionally ignored response leaves prior data until next refresh. Exact lockfile install and separate disposable test DB used.
- Full coverage: 62 files / 411 tests passed; statements/lines 96.77%, branches 91.53%, functions 92.89%.

## YG-76

- Worktree: `/Users/bong/github/workspaces/yggdrasil/feat-yg-76-field-errors`
- Branch: `borobong2/feat-yg-76-field-errors`; explicit Orca base/parent YG-75; starting HEAD `15ec9b6` and ancestry verified.
- Existing server Zod rules remain authoritative. PATCH 400 adds only validation path/message (no submitted values); title/time/recurrence messages clarified, recurrence refinement paths made precise. UI maps only paths with actual controls, connects inline errors with aria-invalid/describedby, gives fields stable label references, and focuses the first invalid control or the summary. Native browser constraints also produce inline errors. Unknown/network failures stay general; drafts and YG-73 guards retained.
- Red: server error path, UI field/focus/recurrence/unknown summary and native-invalid tests failed before implementation. Related tests passed (including server no-write rejection). Typecheck/build/diff check passed.
- Real Chrome 390/320/1280: native required/integer constraints, server title/weekdays errors, first-field/group focus, unknown/network summary focus, preserved memo and successful resubmit passed. `.local/validation.mjs`, `.local/yg76-{width}.png`; 320 image visually inspected with visible focused title/error.
- Limits: native validation message language is browser-dependent; browser API fixtures, no physical mobile/Safari/production E2E. Fields not identified by the server intentionally use the summary. Lockfile install and worktree-specific disposable DB used.
- Full coverage: 62 files / 415 tests passed; statements/lines 96.79%, branches 91.53%, functions 92.93%. Additional 3 server path cases (monthly bounds, missing weekly days, zero actual duration) passed afterward in the 45-test related run.
