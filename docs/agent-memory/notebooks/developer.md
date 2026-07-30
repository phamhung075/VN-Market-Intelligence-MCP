# Developer — Notebook

**Last updated:** 2026-07-30 | **Cycle:** FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE

## Session 2026-07-30 — FACTORY-GUARD-CI-SHAREDPKG-IMPL — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`, epic FACTORY-MAINTAINABILITY-2026-06), 4th/final sibling (own brief `2026-07-24-factory-guard-ci-shared-package-import-check.md`). Baseline/ratchet gate for `packages/*` orphan-importer detection — same axis as size-lint (fix is a domain keep-or-cut decision, not this task's).

**Actions taken:** New `scripts/audits/shared-package-import-check.sh` (`--check`/`--update`): check-1 (blocking) — every `@vn-market/`-scoped `packages/*/package.json` needs a real import/dependency reference in `apps/**`+`packages/**` (own dir excluded) OR a baseline entry, else FAIL; check-2 (advisory-only, never fails) — exported-symbol-name collisions between `packages/shared-*/index.ts` and `apps/**/*.ts`. Seeded `docs/data/shared-package-import-baseline.json` via `--update` — 3 current orphans (shared-types/shared-config/shared-db), live-verified zero real hits. Wired `shared-package-import-check` CI job + CANONICAL pointer.

**Verify-live catch:** first draft's per-file `grep` subprocess loop (check-1 + check-2) hung >2min on this repo's file count (~7K+~34K forks) — caught via a background-run timeout, not a passive read. Root-cause fixed: batched every candidate file array into ONE `grep -l ... -- "${files[@]}"` call per package/symbol (O(1) forks) — re-measured 7s standalone / 14s full smoke suite. Check-2 also surfaced MORE collisions than the brief's cited "e.g. Alert/Signal/McpConfig" (also `loadMcpConfig`/`ExtractPDFRequest`/etc) — kept the general scan since it's advisory-only.

**Verification:** `shared-package-import-check.sh --check` exits 0 on live repo (3 BASELINE + 11 ADVISORY lines, no fail). New `.test.sh` 4/4 PASS (baseline-listed passes, new zero-importer+no-baseline fails, real-importer passes despite baseline listing, advisory lines emit without failing). No `apps/` source touched — `bun test`/`tsc` structurally N/A. `shellcheck` clean (1 benign SC2329 info, same as size-lint's own test file).

**Board:** `task_board.in_progress[FACTORY-GUARD-CI-SHAREDPKG-IMPL]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — 2 mechanical checks only (per-package granularity, per-symbol AST diffing explicitly deferred per brief §3), zero edits to `packages/shared-*/` contents (explicitly out of scope, reserved for `FACTORY-SHARED-wire-or-prune-shared-packages`).

**Zone note:** No MCP/gateway tool available this session (Read/Edit/Write/Bash only, confirmed at Step 0) — flipped the board row directly via `scripts/orch-apply.sh` (permitted, pure bash); could not release `task:FACTORY-GUARD-CI-SHAREDPKG-IMPL` or send Telegram (structural gap, flagged for the coordinating dev-team session).

Zone health: no drift detected.

## Session 2026-07-30 — FACTORY-GUARD-CI-RAWVERIFY-IMPL — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`, epic FACTORY-MAINTAINABILITY-2026-06), 7th/LAST sibling (own brief `2026-07-24-factory-guard-ci-rebuild-raw-verify-hook.md`). Mechanizes the previously-unenforced `PUSH-AUTONOMY-1` §5 post-push REAL-DATA verify mandate at the immediately-checkable textual-attestation layer — closes the LAST `ci-regression-prevention` guardrail in the epic.

**Actions taken:** New `scripts/audits/rebuild-raw-verify-check.sh <base-sha> <head-sha>` — zero-tolerance, forward-only diff-range check (no baseline). Trigger composes the two already-designed sibling primitives (brief §3): a `apps/*/src/infrastructure|interface/**` or `apps/*/pkg/interface/http|infrastructure/**` file gains an ADDED line matching `metric-mask-lint.sh`'s own field regex. Requires ONE of a commit-message RAW-verify/REALDATA token, a matching token in an added `docs/agent-memory/decisions/**`/`reports/TASK_REPORT_*.md` line, or an inline `raw-verify-allow:` annotation on the triggering line (or the line immediately before it). Wired PRIMARY/blocking into `scripts/git-hooks/pre-push`'s existing `CODE_TOUCHING_REGEX`-gated block; SECONDARY/backstop `rebuild-raw-verify-hook` CI job (`fetch-depth: 0`) against `github.event.before..github.sha`. CANONICAL pointer + `PUSH-AUTONOMY-1` §5 cross-reference added to `dev-standards.md`.

**Verify-live deviation:** colocated test files under the trigger DDD layers (`apps/mcp-server/src/infrastructure/**/__tests__/*.test.ts`, `apps/*/pkg/infrastructure|interface/http/*_test.go`) confirmed live via `find` to exist directly inside those layers — excluded from the trigger corpus (mirrors `metric-mask-lint.sh`'s own test exclusion) so a routine test assertion like `expect(result.confidence).toBe(0.8)` doesn't fire on nearly every infra/interface test edit.

**Verification:** manually ran 6 scenarios in disposable scratch git repos (fail-no-attestation, pass-commit-msg, pass-inline-annotation, pass-decisions-journal, pass-no-trigger, pass-zero-sha fail-open) BEFORE writing the permanent test, so the test encodes already-observed behavior. New `rebuild-raw-verify-check.test.sh` 9/9 PASS (all 4 named DoD cases + bonus coverage). `shellcheck` clean on all 3 touched shell files (new script, new test, `pre-push`). `.github/workflows/ci.yml` YAML validated (`python3 -c "import yaml; yaml.safe_load(...)"`). No `apps/` TS/Go source touched (zone=`cross-service/`, pure bash+yaml+md) — `bun test`/`tsc` structurally N/A. Graphify: no Skill-tool path available to this spawned agent (same structural constraint as every prior sibling this session) — doc content itself updated directly (CANONICAL pointer + `PUSH-AUTONOMY-1` §5 cross-ref in `dev-standards.md`), skip flagged not silent.

**Board:** `task_board.in_progress[FACTORY-GUARD-CI-RAWVERIFY-IMPL]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — reuses 2 existing sibling primitives (DDD-layer path set, field regex) rather than inventing a third detection pattern; escape hatches mirror the established `metric-mask-allow:`/`size-justification:` idiom exactly, no new abstraction.

**Zone note:** No MCP/gateway tool available this session (Read/Edit/Write/Bash only, confirmed at Step 0) — flipped the board row directly via `scripts/orch-apply.sh` (permitted, pure bash); could not release `task:FACTORY-GUARD-CI-RAWVERIFY-IMPL` or send Telegram (structural gap, flagged for the coordinating dev-team session, per the dispatch prompt's own instruction).

Zone health: no drift detected. This closes the 7th and last `ci-regression-prevention` guardrail — epic `FACTORY-MAINTAINABILITY-2026-06` cluster `ci-regression-prevention` now complete.

## Session 2026-07-30 — FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`, no single `apps/<service>/` owner). PO row: `blocks`/`co_edit` orch-state.json task fields read as sequencing/atomic-ship constraints but are write-only — zero consumers repo-wide. Independently re-verified PO's 07-25 grep and found MORE than the catalogued 7 rows (5 more days of drift added 4 new `blocks` writers).

**Actions taken:** New `checkDecorativeSequencingFields()` in `orchStateSchema.ts` §12, wired as `orch-validate.mjs` Stage 1e (hard fail): a `blocks` edge must be empty or backed by the named target's own `depends_on`/`depends`/`blocked_by` (the fields the real gate reads) else REJECTED at write time; `co_edit` rejected unconditionally (no forward-field equivalent exists). One-time migration `scripts/fix-orchstate-blocks-coedit-decorative-normalize.jq` applied live via `orch-apply.sh`: 3 already-backed rows untouched, 8 dangling shorthand-id `blocks` deleted (historical VN-MACRO-TOOLING sprint rows, target ids like `"VMT-1"` never matched the real full ids), 1 malformed-prose row (`FIX-MCP-SUITE-HEALTH-BASELINE`) renamed to `migrated_blocks_prose`, 2 `co_edit` rows (already co-shipped in commit `adb426877`) renamed to `migrated_co_edit_partner`. `scripts/orch-backlog-stub.sh:57` `STUB_FIELDS` default gained `depends_on,depends,blocked_by` (AC-4, PO-endorsed) — closes a second independent route to the same silent-gate-reopen failure.

**Verify-live catches:** (1) an early full-repo jq scan under-reported (jq `,`/`|` precedence bug — `a,b | c` parses as `(a,b)|c`, silently dropping `active_sprints` rows from the stream) — caught by re-checking a known id count before trusting the result. (2) 3 of PO's original 7 rows were ALREADY correctly backed by a reciprocal `depends_on`/`blocked_by` on the target (added independently by PO/architect for unrelated reasons) — verified at source rather than assumed decorative.

**Verification:** New `FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE.test.ts` 11/11 PASS (incl. AC-3 negative control: freshly-authored reverse-only `blocks`/`co_edit` fixtures both caught). New `scripts/orch-backlog-stub.test.sh` 7/7 PASS — T2 reproduces the pre-fix silent-gate-reopen (`deps_satisfied()` false→true) via the OLD field list on the identical fixture. `orchStateSchema.test.ts` 104/104 (live-data C3-a: 0 coherence issues post-migration). `orchStateStore-atomic-write.test.ts` + `TASK-FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT.test.ts` 13/13. `test-orch-validate-ac.mjs` 29/29. `tsc --noEmit` clean. `orch-state-validate.sh` exits 0 on the migrated live file.

**Board:** `task_board.in_progress[FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — validate-and-reject (mirrors the existing Stage 1d pattern) instead of full unknown-key rejection (PO's own note flags an unmeasured 658-row migration cost) or auto-mirror-at-write (idempotency/fight-a-hand-written-field risk PO's own menu flags).

**Zone note:** No MCP/gateway tool available this session (Read/Edit/Write/Bash only, confirmed at Step 0) — flipped the board row directly via `scripts/orch-apply.sh` (permitted, pure bash); could not release `task:FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE` or send Telegram (structural gap, flagged for the coordinating dev-team session).

Zone health: no drift detected.
