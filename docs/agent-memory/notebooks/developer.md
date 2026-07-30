# Developer — Notebook

**Last updated:** 2026-07-30 | **Cycle:** FACTORY-GUARD-CI-RAWVERIFY-IMPL

## Session 2026-07-30 — FACTORY-GUARD-CI-NOHARDCODE-IMPL — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`, epic FACTORY-MAINTAINABILITY-2026-06), 5th sibling (own brief `2026-07-24-factory-guard-ci-no-hardcode-allowlist-scan.md`, which itself corrects the ticket's naive "ticker allowlist" reading — hundreds of legit domain rule-table arrays are NOT the bug class, only a literal smuggled into a control-flow condition is). New CI gate + fix 2 cosmetic branches + annotate 2 known-debt findings (JANITOR-034/035).

**Actions taken:** New `scripts/audits/no-hardcode-allowlist-scan.sh` (`--check`, zero-tolerance, 2 checks: temporal-combo `.includes('YYYY')`/Go `strings.Contains` near a literal-year `===`/`==`; ticker/code literal-branch vs `HOSE|HNX|UPCOM|BLOOMBERG`-denylisted quoted ALL-CAPS). Fixed `backfillBctcScalarsTool.ts`'s CTG-only reason branch and `pharmaEventMapper.ts`'s IMP-only reasoning branch to the generic message. Annotated `newsChainFallback.ts` (`JANITOR-035`) and `cascadeExecutor.ts`+`priceSourceRouter.ts` (`JANITOR-034`) with `hardcode-scan-allow:`. Wired `no-hardcode-allowlist-scan` CI job + CANONICAL pointer.

**Verify-live catches:** (1) my own first-draft identifier-boundary regex excluded `.` from the valid-prefix set, silently blocking the real `report.action_code` property-access match — found by running the tool live before trusting it. (2) `priceBackfillService.ts:224` `ticker === "BAD"` (documented test-fixture sentinel, brief §2(c) explicitly out-of-scope) still matches check-2's literal regex — annotated rather than adding an ad-hoc "BAD" denylist entry.

**Verification:** New `no-hardcode-allowlist-scan.test.sh` 9/9 PASS. `tsc --noEmit` clean. Targeted 17-file suite 191/191 pass. Full `bun test`: 14865-14869/40 skip/52-56 fail across 2 runs — matches the standing `FIX-MCP-SUITE-HEALTH-BASELINE` order-dependent pattern, grep-confirmed zero fails touch any file this task changed.

**Board:** `task_board.in_progress[FACTORY-GUARD-CI-NOHARDCODE-IMPL]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — 2 mechanical checks only (generic ticker-array-overlap detection explicitly deferred per brief §3), fixes are pure subtraction of a special-case branch, annotations cite ticket ids not blanket suppressions.

**Zone note:** No MCP/gateway tool available this session (Read/Edit/Write/Bash only, confirmed at Step 0) — flipped the board row directly via `scripts/orch-apply.sh` (permitted, pure bash); could not release `task:FACTORY-GUARD-CI-NOHARDCODE-IMPL` or send Telegram (structural gap, flagged for the coordinating dev-team session).

Zone health: no drift detected.

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
