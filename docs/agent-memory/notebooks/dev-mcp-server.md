# dev-mcp-server -- Notebook

## 2026-07-01 — TASK-EVIDENCE-HOP1-MCP → REVIEW

**Sprint:** BA-PREDICTION-EVIDENCE-REVIVAL (hop1, parallel-safe with hop2/agent-father)
**Session:** 3340d049-0aec-46e7-879f-6a71324b98f1 (dev-team cron dispatcher)

Three FRs per architecture brief §0-§1 corrected facts:

- **FR-1.1** — `evidenceTools.ts::get_evidence_summary` hardcoded `(evidence_type,"bullish",10)` LR lookup masked the live TRUSTED `foreign_flow_institutional/bearish/5d` row (n=18). Fixed via `getLikelihoodRatios(db, type, f.direction)`: prefer shortest-horizon row with `sample_size>=10` (TRUSTED); else largest-sample row honestly UNTRUSTED (no cross-horizon interpolation). Display now shows `horizon=Nd`. No hand-rolled SQL — reuses store fn, retires a pre-existing DDD violation.
- **FR-2.2** — `vpsProxyWatchdogJob.ts` extended with `readLatestInsiderTimestamp()` (5th source, `INSIDER_STALE_MS=4d`), closing the silent-empty-success gap (`insider_transactions` 0 rows across ~2mo of "success" runs — VPS proxy 502 to SSC portal). Observability-only; alert message notes the fix is decoupled to BACKLOG `FIX-VPS-SSC-INSIDER-502` (already filed by pm).
- **FR-1.2** — `baseRateComputationJob` cadence weekly→daily. RISK-1 two-file coupling closed in one commit: `cronConfig.ts:62` (`'7 19 * * 0'`→`'7 19 * * *'`) + `baseRateComputationJob.ts` (`WEEKLY_CADENCE_MS`→`DAILY_CADENCE_MS=86_400_000`, feeds `shouldSkipRecoveryReplay`).

Files: `interface/mcp/tools/macro/evidenceTools.ts`, `scheduler/vpsProxyWatchdogJob.ts`, `scheduler/cronConfig.ts`, `scheduler/macro/baseRateComputationJob.ts`, `docs/standards/cron-jobs.md`. Tests: 3 new FR-1.1 regression cases (`1124-evidence-tools-phase-bc.test.ts`), new `TASK-EVIDENCE-HOP1-MCP-watchdog-insider.test.ts` (5 cases), updated `readInsider` fresh-reader injection in 4 existing watchdog test files (313/1319/1351b/1557/1567), updated cadence-string assertions in `ARCH-CRON-recover-jitter.test.ts` + `1122-base-rate-computation-job.test.ts`.

Zone health: tsc clean (EXIT 0), 131/131 pass (15 targeted files, evidence+watchdog+cadence). Full-suite run showed 60 pre-existing failures + a Bun C++ panic — isolation-probed 3 of them (1146-get-insider-transactions, 1518-foreign-flow, 1875c-record-signal-outcome-routing) standalone → all GREEN, confirming full-suite parallel-run flakiness unrelated to this diff, not a regression. orch: `TASK-EVIDENCE-HOP1-MCP`→REVIEW/qa via orch-apply.sh (Stage0+1 PASS). toolCount unchanged (no new MCP tools), scheduler count unchanged (no new cron entries, cadence-only change) | HEALTHY

## 2026-07-01 — MONEY-RADAR-P0-T2-COMPOSITE → REVIEW

**Sprint:** MONEY-RADAR-P0 (design-complete brief, T2 of 4)
**Session:** 3340d049-0aec-46e7-879f-6a71324b98f1 (dev-team cron dispatcher)

New `get_money_radar_composite` MCP tool (#185, market-wide, no ticker arg) per brief §4 schema. REUSE-FIRST: wires `get_foreign_flow`-family (queryMarketWideForeignFlow), `get_foreign_accum_rank`/`get_volatility_indicators`/`get_carry_trade_signal` (macro snapshot)/T1 oscillators via cross-service HTTP clients, `get_foreign_room`+`get_breadth_thrust` usecases in-process, `get_credit_flow_signal` in-process.

Key deviation (documented in code + decision journal): T1 Go `/ta/money-flow-oscillators` OBV is a single cumulative-all-bars snapshot with no history param — no slope derivable from the endpoint. OBV *slope* (needed for D2 + the composite's obv_slope component) is recomputed locally from `daily_ohlcv` close+volume using the identical formula, aggregated as (#tickers-rising − #tickers-falling)/#resolved across the watchlist. The 3 other T1 fields (rel_vol_z_20, up_down_vol_ratio, degraded_vwap) ARE consumed via the new `computeMoneyFlowOscillators` HTTP client.

Fusion = coverage-gated tier-weighted mean (T1=1.0/T2=0.9/T3=0.7/T4=0.3), non-null components only (HN-1), score=null when coverage<0.5 (HN-2). D1-D4 divergence detectors each UNKNOWN when either axis is null; overall flag never GREEN unless all 4 resolve non-fired (HN-4). credit_flow_direction fully EXCLUDED whenever is_estimate=true (HN-3) — extended `getCreditFlowSignalHandler` return with additive `direction`+`is_estimate` fields (non-breaking, MCP wire unaffected). degraded-VWAP component key self-labeled `degraded_vwap_proxy_z` (HN-5). `source_tier` = min tier across non-null contributors (HN-7). New forward-accruing `money_radar_score_history` table (mirrors `market_breadth_history` NFR-BR-1/2 pattern) backs `delta_5d` (null <6 accrued rows).

Files: `domain/services/market-data/moneyRadarCalculator.ts` (new, pure), `infrastructure/db/moneyRadarStore.ts` (new), `application/usecases/getMoneyRadarComposite.ts` (new orchestrator), `interface/mcp/tools/market-data/moneyRadarTools.ts` (new), `infrastructure/microservices/clients.ts` (+computeMoneyFlowOscillators), `infrastructure/db/schema-market-data.ts` (+money_radar_score_history DDL), `interface/mcp/tools/sector/creditFlowTools.ts` (+direction/is_estimate), `interface/mcp/tools/registry.ts` (+registerMoneyRadarTools #185). Regenerated `docs/data/tool-registry.json` + `docs/data/project-stats.json` (toolCount 182→183, `bun scripts/gen-tool-registry.ts` + `gen-project-stats.ts`).

Zone health: tsc clean (EXIT 0). New suite 20/20 pass (`MONEY-RADAR-P0-T2-COMPOSITE.test.ts`: DoD-1..4, HN-3/5/7, 11 pure calculator cases). tool-registry-parity 8/8 pass post-regen. Full-suite run: same pre-existing 60-fail/Bun-C++-panic pattern seen in prior TASK-EVIDENCE-HOP1-MCP cycle this session — re-isolated 1146/RAPID-B2/1518/1875c/251-mcp-tools/credit-flow suites standalone → all GREEN, confirms unrelated flakiness not a regression. orch: `MONEY-RADAR-P0-T2-COMPOSITE`→REVIEW/qa (dev-team loop owns SSOT flip — I am orch-state-blind). Deviation: no per-ticker mode (brief DoD is market-wide only); Phase-1 tự-doanh deliberately NOT stubbed as a permanently-null component (would deflate coverage_pct for a leg that can't resolve until Phase 1 crawl ships) | HEALTHY

## 2026-07-01 — TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST (final unit, sprint FIX-BCTC-BANK-SUMMARY-MAPPING)

**Session:** 3340d049-0aec-46e7-879f-6a71324b98f1 (dev-mcp-server, spawned directly, W1-W4 already committed by prior units)

AC-6 SPIKE on `finalizeBctcRefineTool.ts`: BLOCK-4 (pre-existing FU-LF-VALIDATION-STATUS-REFLOW, e74dd0e1, unrelated to this sprint) already re-validates truthfully per finalize call, but its own 1%/5% relative-diff identity math can DIVERGE from the canonical FR-5 serve-path guard (W1's `bctcIdentityGuard.ts`) on a compensating-liabilities fixture — proved RED (wrote `validation_status='passed'` for a guard-corrupt row) then GREEN by wiring `checkBctcIdentityGuard` into BLOCK-4 (forces `failed` + notes cite the guard reason) and BLOCK-5 (forces `extraction_confidence=0`, was previously boostable to ~1.0 by section-completeness alone regardless of corruption). Confirm-clean fixture proves CTG's OWN real live numbers (total_assets=0 vs huge liabilities) already correctly triggered "failed" pre-fix via validateFinancialReport's garbage threshold — but the confidence-masking half of the bug DID hit CTG's real numbers (0.5625 stayed unforced pre-fix). Live probe (docker exec, read-only) also found the container's baked code already has W1+W4 but NOT W2/W3 — independently corroborates "old image, don't run live" from the dispatch brief.

Authored `scripts/migrations/reingest-bctc-report.ts` (AC-10, NOT executed against the live report) — refuses to call finalize when 0 DONE windows have markdown (CTG's live state: all 56 units FAILED — calling now would wipe the 55 existing rows to zero), otherwise calls the live `finalize_bctc_refine` MCP tool over `/mcp` Streamable-HTTP (zero logic duplicated). Smoke-tested all 4 decision branches inside the container against scratch DBs (never the real market.db).

New test `TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST.test.ts` (4 tests, 18 expect) — RED→GREEN proven by reverting the source fix via `git stash` mid-session and re-running (3/4 failed, confirming genuine defect incl. on CTG's real numbers).

Zone health: tsc clean, 1240/1240 targeted BCTC-suite pass (115 files), full suite 13940 pass / 67 fail / 10 errors / 1 pre-existing Bun-C++-panic-at-teardown (same class as W2's prior full-suite note — none of the 67 fails touch bctc/finalize/validation) | HEALTHY
