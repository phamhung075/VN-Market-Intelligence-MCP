# Developer — Notebook

**Last updated:** 2026-07-30 | **Cycle:** FACTORY-GUARD-CI-SHAREDPKG-IMPL

## Session 2026-07-30 — FACTORY-GUARD-CI-DEADCODE-IMPL — REVIEW

**Task:** dev-team BOUNDED-1 auto-pickup (`cross-service/`, epic FACTORY-MAINTAINABILITY-2026-06), 4th sibling of TSBOUNDARIES/COMPROOT-LOGIC above (same architect brief lineage, own brief `2026-07-24-factory-guard-ci-dead-code-gate.md`). New dead-code CI gate + fix all confirmed-orphaned trees first (zero-tolerance).

**Actions taken:** New `scripts/audits/dead-code-gate.sh` (`--check`, 4 checks on TRACKED files: `.bak`/`.backup`/`.patch`, `_deprecated/` segment, Go/TS twin scaffold, `//go:build ignore`). Deleted 2 stray root `docker-compose.yml.backup`/`.patch`, mcp-server's 2 `_deprecated/` trees + `1077-kinh-dich-wrapper.test.ts`, pdf-extractor's `_deprecated/mock_echo`, stock-price's `_deprecated/services_v1.go`+test (the only 2 `//go:build ignore` files repo-wide) — zero live importers independently grep-verified for each. Surgical edit to `1081-sprint-054-smoke.test.ts` (Scenario 5/5b/5c only, 17→14 tests). `technical-analysis/package.json` trimmed `bun-types`/`typescript` devDeps. Wired `dead-code-gate` CI job + CANONICAL pointer.

**Board-note correction:** Check-3's literal phrasing ("any Go `cmd/server`+`package.json`+`src/` combo bans") would permanently false-positive on the LIVE `apps/news-fetch` (legit WIP parallel Go port, TS side is what its Dockerfile actually builds/deploys) — refined to a Dockerfile-content signal (zero `src` reference = orphaned, matching technical-analysis's confirmed dead shape) instead of bare directory shape. Also found `apps/technical-analysis/src/` + its tests were ALREADY deleted by an unrelated prior commit (`099afddd3`, 2026-07-28) before this row was even dispatched — only the devDep trim remained live-actionable.

**Verification:** `dead-code-gate.sh --check` 0 on live repo; new `dead-code-gate.test.sh` 8/8 PASS (4 DoD synthetic-offender cases + tracked-vs-untracked control + twin-scaffold Dockerfile-blind/-referencing pair proving the news-fetch exemption is deliberate). mcp-server: `tsc --noEmit` clean, `eslint src/` clean, `1081-*.test.ts` 14/14. technical-analysis: `go build`/`go vet`/`go test ./...`/`golangci-lint run` clean, `dashboard/build.sh` green (35/35 + headless render, esbuild/playwright-core confirmed still load-bearing). pdf-extractor `lint-imports` 3/3 kept; stock-price `golangci-lint run` 0 issues. Full `bun test`: standing `FIX-MCP-SUITE-HEALTH-BASELINE` order-dependent red only — 3-run base-vs-head A/B (disposable `git worktree`) showed every failing file either pre-existing in base or a run-to-run flip on identical code (base 20/9files, head-run1 24/10files, head-run2 2/2files); zero deterministic net-new failures.

**Board:** `task_board.in_progress[FACTORY-GUARD-CI-DEADCODE-IMPL]` → `review` (`next_agent: qa`), `.head` reset to idle, same `orch-apply.sh` write.

**Simplicity gate:** PASS — every deletion is pure subtraction of independently zero-importer-verified code; check-3's Dockerfile-content refinement is the minimal signal that avoids the false positive (no new dependency, no broader per-symbol tooling).

**Zone note:** No MCP/gateway tool available this session (Read/Edit/Write/Bash only, confirmed at Step 0) — flipped the board row directly via `scripts/orch-apply.sh` (permitted, pure bash); could not release `task:FACTORY-GUARD-CI-DEADCODE-IMPL` or send Telegram (structural gap, flagged for the coordinating dev-team session). Mid-task, ~12 staged `git rm` deletions were found unstaged between two background test runs (index reverted to HEAD, files still gone from disk) — re-staged immediately, verified residual-check 0 before AND after commit; root cause not conclusively isolated (2 concurrent single-file peer commits landed on `main` in the same window) but files were never lost, only re-staged.

Zone health: no drift detected.

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
