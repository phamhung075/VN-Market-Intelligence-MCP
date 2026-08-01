# dev-macro-indicators — Notebook

Zone: `apps/macro-indicators/` | Stack: Go 1.22 | DB: reads market.db (read-only)

**Runbook:** `docs/protocols/fail-loud-protocol.md` — SBV/FRED/computed staleness gates, fixture fallback tiers.

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

---

## Session 2026-08-01 (FIX-MACRO-INDICATORS-EMPTY-COLUMNS — BOUNDED-1 pickup, DECLINED: wrong zone, 3rd occurrence of same class)

**Task:** BOUNDED-1 idle-capacity auto-pickup, labeled zone `apps/macro-indicators/`. Same zone-mislabel class as the two 2026-07-28/07-30 SBV occurrences (see above) — `apps/macro-indicators` matched by domain-keyword/table-name, not by verified write-path owner.

**RAW-verify:** `sqlite3 data/live/market.db` — table has exactly 1 row (`UNIQUE(country)`, id=675, country=vietnam); only `cpi=5.46`/`gdp_growth=7.4`/`interest_rate=4.5` set, the other 9 columns NULL, `fetched_at` fresh (today) despite that.

**Finding:** Traced every writer. `apps/mcp-server/src/domain/services/macro/macroIndicatorFetcher.ts` storeIndicators() — dead (writes `country='VN'`, comment self-flags unwired). `apps/mcp-server/src/infrastructure/fetchers/tradingEconomics.ts` storeMacroIndicators()/fetchMacroIndicatorsWithFallback() — dead, zero call sites outside its own barrel re-export (grep-confirmed), and only ever handles 3 of 12 fields anyway. The one LIVE cron, `macroIndicatorRefreshJob.ts`, writes `interest_rate` for real (Go `/snapshot` sbvRefinancingRate) but its `cpi`/`manufacturing_pmi` path (`parseCpiFromExternal`/`parsePmiFromExternal` reading `GET /macro/external sources.tradingEconomics`) is doubly dead: live-curled my own Go `/external` handler (`handlers_external.go`) and confirmed the live response has no `tradingEconomics` key at all (only `vn-market`/`commodity-prices`/`macro-signals`); separately mcp-server's client calls `POST` against that `GET`-only route (405). `gdp_growth`/`inflation_rate` are hardcoded `null` in that INSERT, COALESCE-preserved only (explains the misleadingly-fresh `fetched_at` on a frozen value — same class as the known usdVnd frozen-value anti-pattern). The other 7 columns never appear in any live INSERT column list. The only writer covering all 12 columns, `macroPushHandler.ts`'s VPS-push allowlist, is fed by `vps-scripts/fetch-tradingeconomics.sh` — SSH-confirmed live on the VPS: 500+ consecutive hourly `SKIP: TE_API_KEY not configured` cycles since deploy — and `fetch-gso.sh`, whose browser automation was deliberately removed (VPS too lite), pushing only empty payloads. Both credential/infra-blocked, not a code bug. `apps/macro-indicators/` (my zone) has ZERO write access to `market.db` by design (init.md: reads-only) — structurally cannot implement any part of this fix. Bonus finding: 2 of the 9 empty columns (`trade_balance`, `current_account`) DO have a live alternate source already in my own zone (VMT-6/7 `POST /trade-balance` / `POST /bop`, real NSO/GSO data) never wired into `macro_indicators` — flagged as dev-mcp-server's concrete actionable path (no new credential needed for those 2).

**Action:** No code change (either zone). Corrected `docs/data/orch/orch-state.json` via `scripts/orch-apply.sh` (exit 0, conservation 770/770): moved row `in_progress`→`backlog` with `zone: apps/mcp-server/`, `owner_agent: dev-mcp-server`, full root_cause/generic_mandate trace embedded (incl. the trade_balance/current_account actionable path + the credential-blocked TE/GSO finding); `.head` reset to idle/router. Corrected `docs/data/orch/archive/backlog-detail.json` (direct atomic write, item-count-preserved 442/442) with the same trace + `related: [FIX-SBV-FETCHER-ZERO-VALUE-EMIT, FU-SBV-EFFECTIVE-DATE-COLUMN]`. Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-macro-indicators.md` STEP dev-macro-indicators-S3.

**Recurrence flag for PO (3rd time):** this is the THIRD backlog row mislabeled `zone: apps/macro-indicators/` for the identical structural reason — `apps/macro-indicators` is a CONSUMER/reader of `market.db`, never a write-path owner, by explicit agent-definition design. Both prior occurrences (2026-07-28, 2026-07-30) already recommended a one-time audit of remaining `apps/macro-indicators`-tagged backlog rows against actual write-path ownership; neither recommendation was actioned before this one burned a third BOUNDED-1 cycle. Re-recommending now, more strongly: run the audit before a 4th occurrence.

**Task lock:** `task:FIX-MACRO-INDICATORS-EMPTY-COLUMNS` NOT released by this agent — INV-GATEWAY-1 reserves task_claim/task_release to the dev-team dispatcher session (owner_client_session=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae) that holds it on my behalf.

Zone health: HEALTHY (no code changed, Go service unaffected) | FIX-MACRO-INDICATORS-EMPTY-COLUMNS → returned to BACKLOG, re-zoned apps/mcp-server/ (not a dev-macro-indicators task)
