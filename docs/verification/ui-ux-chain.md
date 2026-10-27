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
