# dev-news-fetch — Notebook

## c002 · 2026-07-09T22:27Z

Task: FACTORY-NEWS-split-sandbox (BOUNDED-1 idle-capacity pickup, P1/L/low-risk).

Split `apps/news-fetch/src/sandbox/runner.ts` (486L, do-everything CLI script) into 7 files in the same
dir, each ≤120L: `cli.ts` (48L — flag parsing + env-audit gate), `registry.ts` (56L — PRIMITIVE/MODULE
registries), `discover.ts` (57L — scenario file discovery), `equal.ts` (21L — `deepEqual`), `execute.ts`
(120L — both scenario executors + dispatcher), `report.ts` (82L — console output, summary, trace/data.js
writer), `runner.ts` (75L — thin orchestrator, main loop only). `import.meta.dir` resolution preserved
(all files stay in `src/sandbox/`). Full trail:
`docs/agent-memory/decisions/dev-news-fetch-20260709T2227Z-FACTORY-NEWS-split-sandbox.md`.

`registry.ts`: each `PRIMITIVE_REGISTRY` entry now carries an `argAdapter` fn (scenario input → positional
args), replacing the by-name if/else switch confirmed at the router-specced lines 223-235 pre-edit.

Premise check (per prompt instruction, mirrors last cycle's catch): grepped for test imports of
`runner.ts` internals — zero hits. `runner.ts` is invoked only as a CLI script (`bun run
src/sandbox/runner.ts`, wired via `package.json`'s `"sandbox"` script), never imported by any test — safe
to relocate freely.

Behavior-preservation catch (self-caught before finalizing, not from a stale premise this time): original
code resolves `mod[fnName]` using the scenario JSON's own `"function"` field, NOT the registry entry's
(unused, dead) `fnName` field. First draft of `execute.ts` wired `entry.fnName` into the lookup by
mistake — fixed to use the scenario-derived `fnName` local var, matching original semantics exactly (zero
observable diff on current fixtures since they always match, but ERROR-path messages would have diverged
under a hypothetical mismatch).

To fit both executors + type + dispatcher into 120L, added two small shared helpers inside `execute.ts`:
`resolveFn` (dynamic-import + typeof-fn guard, was duplicated verbatim in both executors) and `finalize`
(PASS/FAIL-with-diff result shaping, was duplicated 3x). Pure dedup of exact-duplicate original logic.

Verification: `bun test` 233 pass/6 skip/0 fail/372 expect() (unchanged baseline — zero test/production
files touched outside `sandbox/`); `bun tsc --noEmit` clean; `eslint lint:ci` clean; scenario JSON valid;
G12 sandbox `bun run sandbox --tier=all --module=news-fetch` → 16 PASS/0 FAIL/0 ERROR (unchanged); ran
sandbox again with scrubbed env (`env -i`) → same 16/16, confirms env-gate still enforced. Direct
before/after: checked out pre-edit `runner.ts` via `git show HEAD`, ran both old and new against
`--output=<file>`, diffed trace JSON with `runAt` stripped → byte-identical.

Closed to `task_board.review[]` (not `done_verified`) — `news-fetch` is a `docker-compose` service, live
container still runs pre-change image, rebuild is user-gated to ops. This change touched only
`sandbox/` (dev-only CLI, zero infra imports, never runs in the container's request path), so the deferred
check is a low-risk rebuild-boots-clean sanity, not a behavior confirmation. Deferred signal:
`docs/signals/ops-rebuild-verify-news-fetch-20260709T2227Z.json`.

Zone health: no drift detected — `apps/news-fetch/src/sandbox/` now single-responsibility modules instead
of one 486L script; registry is data-driven (`argAdapter` per entry) so adding a new primitive no longer
requires a code-branch edit in the executor.

## c001 · 2026-07-09T21:52Z

Task: FACTORY-NEWS-dedup-normalizeDate (BOUNDED-1 idle-capacity pickup, P1/S/low-risk).

Deduped the two byte-identical `normalizeDate` copies in `bloomberg-stealth.ts`/`reuters-stealth.ts` into
`src/primitive/published-at-parser/index.ts` (`parsePublishedAt` core + new null-tolerant `normalizeDate`
wrapper). Stale-premise catch: router's dispatch note claimed no test imports the stealth `normalizeDate`
directly — FALSE, 2 test files (`1899a-bloomberg-normalize-date.test.ts`,
`1899a-reuters-fallback-lifecycle.test.ts`) import it by name from the stealth infra files. Fixed by
re-exporting the primitive symbol from both stealth files instead of a bare deletion. Full trail:
`docs/agent-memory/decisions/dev-news-fetch-20260709T2152Z-FACTORY-NEWS-dedup-normalizeDate.md`.

Verification: `bun test` 233 pass/6 skip/0 fail; `bun tsc --noEmit` clean; G12 sandbox 16/16 PASS; direct
before/after comparison script (12 date-format inputs, 3 post-edit call sites) = 0 mismatches vs
pre-edit inlined implementation. Line counts: bloomberg-stealth.ts 151→142L, reuters-stealth.ts 134→125L.

Closed to `task_board.review[]` (not `done_verified`) — `news-fetch` is a `docker-compose` service, live
container still runs pre-change image, rebuild is user-gated to ops. Deferred RAW-verify signal:
`docs/signals/ops-rebuild-verify-news-fetch-20260709T2152Z.json`.

Zone health: no drift detected — `apps/news-fetch/` primitive/infra split is clean; this was the last
remaining date-normalization duplication in the zone (RSS-side `normalizeRfcDate` dupe was already
deduped in a prior task per the primitive's own header comment).
