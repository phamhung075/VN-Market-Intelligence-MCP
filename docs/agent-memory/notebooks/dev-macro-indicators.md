# dev-macro-indicators — Notebook

Zone: `apps/macro-indicators/` | Stack: Go 1.22 | DB: reads market.db (read-only)

**Runbook:** `docs/protocols/fail-loud-protocol.md` — SBV/FRED/computed staleness gates, fixture fallback tiers.

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

---

## Session 2026-07-30 (FU-SBV-EFFECTIVE-DATE-COLUMN — BOUNDED-1 pickup, DECLINED: wrong zone, 2nd occurrence of same class)

**Task:** BOUNDED-1 idle-capacity auto-pickup, labeled zone `apps/macro-indicators`. Same SBV-zone-mislabel class as 2026-07-28's FIX-SBV-FETCHER-ZERO-VALUE-EMIT (see above) — origin brief `docs/architecture-briefs/2026-06-04-data-serve-integrity.md` L86 explicitly named this as a follow-up but the backlog mint carried the same wrong zone forward.

**Finding:** `sbv_rates` CREATE TABLE + all ALTER-column migrations (incl. the exact try/catch pattern this task needs to reuse) live in `apps/mcp-server/src/infrastructure/db/schema-macro.ts` L141-176. The sole writer `storeSbvSnapshot()`/`fetchSbvRates()` is `apps/mcp-server/src/infrastructure/fetchers/sbv.ts`; 4h cron wiring `apps/mcp-server/src/scheduler/macro/sbvRatesJob.ts`; VPS push script `vps-scripts/fetch-sbv.sh` (repo-root) → `pushSbvRatesHandler.ts`. `apps/macro-indicators/` (`pkg/infrastructure/repositories_sbv_rate.go` `SBVRateSQLiteAdapter.GetRate`) is read-only SELECT, zero write path. No code touched — implementing would violate `zone_restricted: apps/macro-indicators/` + `not_my_job`.

**Action:** No code change. Corrected `docs/data/orch/orch-state.json` via `scripts/orch-apply.sh` (exit 0, conservation 727/727): moved row `in_progress`→`backlog` with `zone: apps/mcp-server/`, `owner_agent: dev-mcp-server`, full root_cause/generic_mandate trace embedded; `.head` reset to idle/router. Corrected `docs/data/orch/archive/backlog-detail.json`'s stale `apps/macro-indicators` zone label (direct atomic write, item-count-preserved 442/442). Decision journal: `sprint-DATA-SERVE-INTEGRITY-dev-macro-indicators.md` STEP dev-macro-indicators-S1 (path per dispatcher instruction).

**Recurrence flag for PO:** this is the SECOND SBV-titled backlog row mislabeled `zone: apps/macro-indicators` for the same reason (macro-indicators is a CONSUMER of sbv_rates, not the write-path OWNER — both trace to the 2026-06-04 data-serve-integrity brief). Recommend a one-time audit of remaining SBV-titled rows in `backlog-detail.json` for the same mislabel before a 3rd BOUNDED-1 misroute burns another cycle.

**Task lock:** `task:FU-SBV-EFFECTIVE-DATE-COLUMN` NOT released by this agent — INV-GATEWAY-1 reserves task_claim/task_release to the dev-team dispatcher session (owner_client_session=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae) that holds it on my behalf. Flagging here for that session to release.

Zone health: HEALTHY (no code changed, Go service unaffected) | FU-SBV-EFFECTIVE-DATE-COLUMN → returned to BACKLOG, re-zoned apps/mcp-server/ (not a dev-macro-indicators task)

---

## Session 2026-07-31 (FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER — S3 hand-dispatch, size-lint sole remaining CI offender)

**Task:** `usecases_vmt_liquidity_resolvers.go` (224L, cap 120L) had a real package doc comment but not the literal `size-justification:` token, no baseline entry → `--check` new-offender, this was the SOLE remaining size-lint CI offender (confirmed via `gh run view 30608987675 --log-failed`).

**Action:** Added `// size-justification: 231L — ...` inside the first 10 lines (option a, per task's own preference order) naming why PolicyRatesResolver (VMT-5a) + omoResolver (VMT-5b) — two sibling composition-root-logic-gate extractions of the same refactor — share one file; declared count matches the real post-edit `wc -l` exactly (224L→231L after the 7-line insert). Did NOT run `--update` (would launder unrelated offenders repo-wide). `git diff` confirms only the target `.go` file changed — `scripts/audits/size-lint-justification.sh` and `docs/data/size-lint-baseline.json` untouched.

**Verification:** `go build`/`go vet`/`go test ./pkg/application/...` all green. Local `--check` exits 0. CI-plane VERIFIED (not just local): pushed commit `e02e20192`, `gh run view 30611631146 --json jobs -q '.jobs[]|select(.name=="size-lint")|.conclusion'` == `success` on the exact pushed headSha `e02e201925f0cdeec81e95ea30c77e4a0afe4082`.

**Commit:** `e02e20192` (1 file, +7L). Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-macro-indicators.md` STEP dev-macro-indicators-S2.

Zone health: HEALTHY (comment-only change, build/vet/test green, CI size-lint job confirmed green on pushed SHA) | FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER → REVIEW (next_agent: qa)
