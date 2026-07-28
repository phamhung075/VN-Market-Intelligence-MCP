# dev-macro-indicators — Notebook

Zone: `apps/macro-indicators/` | Stack: Go 1.22 | DB: reads market.db (read-only)

**Runbook:** `docs/protocols/fail-loud-protocol.md` — SBV/FRED/computed staleness gates, fixture fallback tiers.

---

## Session 2026-07-08 round 2 (FACTORY-MACRO-delete-dead-ts-tree — po FOLD-IN, deletion executed)

**Task:** po expanded scope (STEP po-S2, whole-repo grep zero-external-importer) to fold the entire `__tests__/` tree into the same deletion, plus `docs/architecture/microservice/macro-indicators/testing.md` Go-only reconciliation.

**Independent re-verify (mandatory, whole-repo scope this time) before touching anything:** re-ran grep myself, did not trust po's report alone — confirmed zero live code importer of `_deprecated/`, `infrastructure/scrapers/`, `__tests__/`, or the toolchain files outside the deletion set. 2 residual hits are stale doc-comments (not imports) pre-dating this task: `apps/mcp-server/src/infrastructure/microservices/clients.ts` (JSDoc pointing at an already-nonexistent `src/application/dtos.ts`) and `macro_investment_clock.go` (comment pointing at `src/domain/services.ts`, a path that never had `_deprecated/` in it — pre-existing typo, not one of po's counted 3).

**Deleted:** `src/_deprecated/`, `src/infrastructure/scrapers/`, whole `__tests__/`, `package.json`, `tsconfig.json`, `bun.lock` (git rm), `node_modules/` (untracked/gitignored, `rm -rf`, 32M).

**Verification before flip (all green):** `go build ./...`, `go vet ./...`, `golangci-lint run` (0 issues), `go test ./...` (33 files / 8 pkgs / 288 top-level tests / 543 incl. subtests, 0 fail). Fence-A/B/C checked via real `go list -f '{{.Imports}}'` import graph. G12 sandbox: primitive 18/18 PASS, module 2/2 PASS. `docker build` verify-only, no deploy.

**Commit:** 39be5019a (46 files, +110/-5532). Decision journal: STEP dev-macro-indicators-S2. History preserved at git tag `macro-pre-delete`.

Zone health: HEALTHY (Go service unchanged, RAW metric path untouched) | FACTORY-MACRO-delete-dead-ts-tree → REVIEW (next_agent: qa)

---

## Session 2026-07-09 (FACTORY-MACRO-split-sandbox — 831L god-file split + 6-comparator collapse)

**Task:** BOUNDED-1 idle-capacity pickup. Split `cmd/sandbox/main.go` (831L, no header) into 4 files; collapse the 6 structurally-identical `executeMacroXxx` comparators into one helper; add dispatch-logic test coverage (zero pre-existing).

**Split:** main.go (103L, flags+loop) / discovery.go (86L) / primitives.go (366L, justified) / module.go (250L, justified). Collapsed all 8 diff-builders into `compareFields(label, []fieldDiff)`; `formatVal` preserves original formatting so FAIL "reason" text is byte-identical pre/post-split.

**Root-cause fix mid-task:** `apps/macro-indicators/.gitignore`'s unanchored `sandbox` pattern also matched the `cmd/sandbox/` directory — silently excluded new files from git. Anchored to `/sandbox`.

**Parity verification:** `git stash` clean pre-split tree, ran sandbox binary before/after against full 20-scenario suite + 2 forced-mismatch probes — byte-identical output (msg/scenario/reason) incl. exit codes. `go build`/`go vet`/`go test`/`golangci-lint` all GREEN.

**Docker routing:** `cmd/sandbox` is a standalone CLI, never compiled into the deployed image — routed `next_agent: qa` directly, no ops/Close Gate.

**Commit:** 60c9a880a (6 files, +865/-735). Decision journal: STEP dev-macro-indicators-S3.
Zone health: HEALTHY (Go service unaffected, sandbox parity confirmed) | FACTORY-MACRO-split-sandbox → REVIEW (next_agent: qa)

---

## Session 2026-07-09 round 2 (FACTORY-MACRO-split-repositories — 905L god-file split, live-deployed → ops)

**Task:** BOUNDED-1 idle-capacity pickup. Split `pkg/infrastructure/repositories.go` (905L, 6 adapters) into per-adapter files; factor the repeated "open ro → defer Close → fetch" shape into a shared `openReadOnly` helper.

**Split:** repositories_fixture.go / repositories_market_index.go / repositories_commodity.go / repositories_sbv_rate.go / repositories_carry_yield.go (shared `openReadOnly`). 4/5 files >120L — size-justification headers added.

**Parity verification (beyond `go test`):** Throwaway harness (`cmd/verify_repos_tmp`, never committed) seeding a real fixture SQLite DB and calling constructors + all 9 port methods through real `DB_PATH` wiring. Ran post-split and `git stash`'d pre-split: all values byte-identical. `go build`/`go vet`/`go test`/`golangci-lint` all GREEN.

**Docker routing:** Confirmed `cmd/server/main.go` imports `pkg/infrastructure` and constructs all 6 adapter types — this IS the live-deployed service. Routed `next_agent: ops` for Docker Close Gate.

**Commit:** c3962350d (6 files, +1026/-905). Decision journal: STEP dev-macro-indicators-S4.
Zone health: HEALTHY (build/vet/test/lint all green, served values verified byte-identical pre/post-split) | FACTORY-MACRO-split-repositories → REVIEW (next_agent: ops)

---

## Session 2026-07-24 (FACTORY-MACRO-split-or-justify-over-cap — sjc_fx split + cohesive-file justify + main.go shim move)

**Task:** BOUNDED-1 auto-pickup. Split-vs-justify triage per task spec (a)/(b)/(c).

**Split:** `adapters_vmt_sjc_fx.go` (504L) → SJCGoldFXAdapter DB adapter stays (167L, justified) + new `parsers_vmt_sbv_policy_rates.go` (372L, justified — SBV policy-rates HTML parse/fetch/TLS + DB fallback), same package, no import-graph change.

**Justify (no split):** `usecases.go` (585L, cohesive ComputeMacroUseCase) + 5 VMT parser files (`parsers_vmt_bop/cpi/gso_indicators/sbv_interbank_omo/trade.go`) — honest size-justification headers added, matching the existing `repositories_*.go` header convention (grepped for exact format).

**Move:** `cmd/server/main.go`'s 9 composition-root adapter shim types → new sibling `cmd/server/adapters.go` (still `package main`, Fence-C preserved). Had to also patch `.golangci.yml`'s fence-c depguard file-allowlist (filename-scoped to `main.go`, not the whole `cmd/server/` dir) to admit `adapters.go` — a real lint failure caught post-move, not in the original task spec.

**Behavior-unchanged verification:** comment-stripped + sorted diff between original committed files and post-split pairs. Caught + fixed one real regression: a Unicode non-breaking-space (U+00A0) byte inside two string literals (`extractFirstNumber`, `ParseVNRate`) got silently normalized to ASCII space during file copy — restored via targeted byte-level patch, re-verified byte-identical after fix.

**Verification (all green):** `go build`/`go vet`/`go test ./...`/`golangci-lint` clean. G12 sandbox: primitive 18/18 PASS, module 2/2 PASS.

**Commit:** a87079574 (11 files, +781/-626). Decision journal: `sprint-FACTORY-MACRO-split-or-justify-over-cap-dev-macro-indicators.md` STEP S1-S2. `rebuild_required=true` but USER-GATED per task constraint — rebuild-verify PENDING-USER-GATED.

Zone health: HEALTHY (build/vet/test/lint/sandbox all green; caught+fixed one byte-level encoding regression during self-verification) | FACTORY-MACRO-split-or-justify-over-cap → REVIEW (dev-team dispatcher closeout)

---

## Session 2026-07-28 (FIX-SBV-FETCHER-ZERO-VALUE-EMIT — BOUNDED-1 pickup, DECLINED: wrong zone)

**Task:** BOUNDED-1 idle-capacity auto-pickup, labeled zone `apps/macro-indicators/`. Live investigation found the label was wrong.

**Finding:** `apps/macro-indicators/` (Go pilot) only READS `sbv_rates` (`SBVRateSQLiteAdapter.GetRate`, safe-degrade, no writes anywhere in the Go tree). All 3 `storeSbvSnapshot` call sites are in `apps/mcp-server/`: `pushSbvRatesHandler.ts` (VPS-push handler — BUGGY, defaults 6 optional rate fields to 0 when the VPS payload omits them, tripping `storeSbvSnapshot`'s own zero-overwrite guard and rejecting the whole snapshot incl. the valid FX rate; also ignores the `{skipped}` return), `sbvRatesJob.ts` (4h cron — already correctly fail-closed), `intelligenceCycleJob.ts` step A2 (best-effort, missing the same pre-flight guard). No code touched — implementing would violate `zone_restricted: apps/macro-indicators/` + `not_my_job`.

**Action:** No code change (either zone). Corrected `docs/data/orch/orch-state.json` task_board: moved row out of `in_progress` back to `backlog` with `zone: apps/mcp-server/`, `owner_agent: dev-mcp-server`, full trace embedded; `.head` reset to idle/router. Corrected `docs/data/orch/archive/backlog-detail.json`'s stale `apps/macro-indicators/` zone label. Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-macro-indicators.md` STEP dev-macro-indicators-S1.

Zone health: HEALTHY (no code changed) | FIX-SBV-FETCHER-ZERO-VALUE-EMIT → returned to BACKLOG, re-zoned apps/mcp-server/ (not a dev-macro-indicators task)
