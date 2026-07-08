# dev-mcp-server -- Notebook

## 2026-07-08 — FACTORY-SCHEDULER-alert-confidence-literals → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

4 scheduler jobs persisted a frozen confidence literal (foreignFlowAlertJob 0.75, insiderCheckJob 0.85, bbAlertScanJob 0.65, taAlertScanJob 0.7) even though a real strength signal already existed (or was easy to add) right beside it. New `deriveConfidenceFromStrength()` (domain/services/alertConfidenceScorer.ts, pure linear interpolation base→ceiling, clamped) now drives all 4, fed by: foreignFlow's own `min(1,|totalNetVolume3d|/500k)`, insider's own `min(1,buyDays/10)`, and two NEW pure extractors — `computeBbBreakoutStrength` (band-penetration ratio) and `computeRsiExtremityStrength` (distance past 70/30 toward saturation, deliberately not `macd` which this job never otherwise reads). Base/ceiling pairs live in alertThresholds.ts (0.55–0.95 for the two HIGH-severity jobs, 0.55–0.85 for the two warning-severity TA scan jobs).

4 code commits (one job each) + 1 shared-test/doc commit + journal + board-flip, per instructions. Each job's test file got a new "two different magnitudes → two different confidences" test; 1 pre-existing literal assertion (1307 AC-1) recomputed 0.7→0.592; 1 (1309 AC-1) happened to still equal 0.65 exactly (floating-point-exact coincidence) so left untouched.

tsc clean. Targeted (5 files) 83/83 pass. Full `bun test` run twice: 14334/61/5 then 14342/53/4 (pass/fail/errors, 1178 files) — the count DIFFERING between two runs of identical code is itself evidence of pre-existing flakiness, not a regression; all failing files (19 total, VPS/RSS/network-timeout class) confirmed zero-import-overlap with the 8 changed/new source files, and `_deprecated/1302-technical-indicators.test.ts` confirmed via git-stash-to-baseline to fail identically pre-change.

Commits: c94c50e24/0bb264fa2/8d041fbb7/3978756bf (4 jobs) + b4e6fd54e (scorer tests+doc) + 7011746eb (journal) + 006cb3819 (board+head flip). Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (Docker Microservice Code-Change Close Gate — persisted signal/evidence confidence values change at runtime). `.head` synced in the same write (was stuck at claim-time `next_agent=developer`).

Zone health: tsc clean, tools unchanged, scheduler jobs unchanged (4 files edited in-place, no new/removed cron.schedule entries) | HEALTHY.

## 2026-07-08 — FACTORY-SCHEDULER-prediction-default-dedup → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

`predictionMarketJob.ts` Step 6 hardcoded volumeSpikeThresholdUsd=50000/probabilityShiftPct=5/minUniqueWallets=10 twice (config-load-succeeded try branch as per-field `?? literal`, config-load-failed catch branch as a plain object) — the catch branch could silently drift from the try branch's defaults over time. Extracted `DEFAULT_PREDICTION_SIGNAL_CONFIG` (named, provenance-commented) + `resolvePredictionSignalConfig(pm?)`; both branches now resolve through the one function (catch calls it with no arg). Chose a per-field `pm?.field ?? DEFAULT.field` merge over the backlog's example spread `{...DEFAULT, ...(pm??{})}` — the spread is unsafe if `pm` ever carried an explicit-`undefined` key (would clobber the default), the per-field form is provably identical to the old duplicated code in every case. `config.ts:604 PredictionMarketsConfig` already declares these 3 fields required/non-optional with matching defaults — nothing to change there.

New `FACTORY-SCHEDULER-prediction-default-dedup.test.ts` (7/7 pass): pins the literal default values, and proves the try-branch (`pm=undefined`) and catch-branch (no-arg) resolve identically, plus partial/full pm override cases.

tsc clean. Targeted+adjacent (8 prediction-related test files) 116/117 pass — 1 unrelated pre-existing flaky timeout (1345e Test 5, VN-Index cascade broadcast, passes 8/8 in isolation). Full `bun test`: 14344 pass/40 skip/58 fail/4 errors/1179 files (568.93s) then Bun 1.3.13 crash-at-teardown (known engine bug) — zero overlap between the 58 fail files and predictionMarketJob.ts/config.ts/predictionSignalDetector.ts, matches the same pre-existing VPS-push/RSS/insider/foreign-flow network-flaky class documented in the prior 2 entries. Server boot verified on PORT=3999 (3000 held by the live container): health/bctc-inspect/news-fetch-dashboard all 200, toolCount=183 unchanged.

Per explicit dispatch instruction: board flip stops at REVIEW/`next_agent=ops` (Close Gate Steps 1-4); qa does Step 5 RAW-verify and must set `next_agent=po` (NOT self-close to done_verified — that was a caught process deviation on the immediately-preceding sibling task); po performs the actual Step 6 DONE_VERIFIED flip.

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, server boot health 200 + dashboard routes 200 verified | HEALTHY.

## 2026-07-08 — FACTORY-INTERFACE-extract-finalizeBctc-usecase → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

`buildFinalizeBctcRefineHandler` (~1100L, own header already said "DDD layer: application") lived in `finalizeBctcRefineTool.ts` (interface). Extracted the 5 named BLOCK-1..5 seams to `application/usecases/finalizeBctcRefine/{backfillScalarColumns,deriveRatioColumns,revalidateBalanceIdentity,recomputeExtractionConfidence,recomputeBctcEval}.ts` (each ≤120L per function; BLOCK-1's ~300L raw body decomposed into 4 sub-helpers to fit) plus the remaining orchestration (CONFIRMED guard, parse loop, DT-2/3/4, BEQ-7, the single atomic `db.transaction`, BAL-1c/1d) into `finalizeBctcRefine.ts`. Interface file now keeps only Zod schema + validation + response-wrap + `server.tool` registration (1349L → 102L).

Key judgment call: every original return point used the byte-identical `{content:[{type:"text",text:JSON.stringify(X)}]}` wrapper, so the application layer now returns the plain result object `X` and the interface wraps it exactly once — provably a no-op formatting factor, not a behavior change. Call order and the single transaction boundary preserved exactly; `safeDivideLocal` absorbed verbatim into `deriveRatioColumns.ts` (deliberately not unified with `ratioComputer.ts`'s own private copy — pure relocation, not a dedup pass).

tsc clean. Targeted finalizeBctcRefine-related suite (22 files, incl. `FACTORY-INTERFACE-source-confidence-10-mask.test.ts` re-exported `resolveSourceConfidence`) 293/293 pass. Full `bun test`: ~14337-14348 pass/40 skip/54-65 fail/1179 files across 2 runs (run-to-run variance itself is the known flaky-network-test signature) then Bun 1.3.13 crash-at-teardown (known engine bug, non-authoritative). Failing-file set grepped both runs: zero bctc/finalize overlap except `1405b-bctc-vps-fixes.test.ts` (bctcQueueEnricherJob/logVpsPush/vn-news-fetch — unrelated to finalize; re-ran in isolation 12/12 pass, confirms pre-existing parallel-load flake not caused by this change). eslint clean on all 8 touched files. Server boot verified on PORT=3999: health 200 toolCount=183, `/api/bctc-inspect` + `/dashboards/news-fetch/` both 200. Gate 2d scheduler cron.schedule grep=3 (matches the immediately-preceding 2 sibling entries' documented current baseline — the flow doc's "76" note is stale text, not a live regression).

Commit: 56ee74725 (8-file extraction). Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (BLOCK-1..5 recompute logic runs against the live named-volume DB at runtime).

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, server boot health 200 + dashboard routes 200 verified | HEALTHY.

## 2026-07-08 — FACTORY-DOMAIN-extract-bctc-parsing-lib → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

findValue was re-implemented 3x with genuinely DIFFERENT signatures — balanceSheetExtractor's 2-arg version had a row-code guard (skip whole-multiples-of-10 in [10,990]) and no ASCII fallback; income/cashFlow's 4-arg version had an ASCII diacritic-stripped fallback pass and no guard. New `financial-reports/lib/lineScan.ts` reconciles both into one canonical `findValue(lines, pattern, {rowCodeGuard?, fallback?})` — each of the 3 call sites passes only the option it originally had, reproducing pre-migration behavior exactly (not a silent widening). Also relocated `findValueByCode` (balanceSheet-only), generalized `applyMultiplier`→`scaleNumericFields` (generic recursive leaf-scaler — verified BalanceSheet/CashFlowStatement are 100% numeric fields against bctc-schema.ts, so recursion is provably equivalent to the old field-by-field code; incomeStatementExtractor never had applyMultiplier — deliberately excludes eps/dilutedEps from scaling, left untouched), and relocated bctcScalarAggregator's own `detectDivisor` (row-based, distinct from the 3 extractors' own per-statement magnitude-inference blocks which use different thresholds/probe-fields and were deliberately NOT unified).

New `financial-reports/lib/vasPatterns.ts` holds the 3 canonical VAS total-assets/liabilities/equity patterns (balanceSheetExtractor's, pure relocation). Deliberately did NOT wire bctcMagnitudeValidator's own inline total-assets/liabilities/equity label regexes to import these — that file matches already-cleaned bctc_table_rows labels (+ English fallback), not raw OCR text; sharing the fuzzy OCR pattern would silently widen its BLOCK-severity fraud-detection matching. Documented with a pointer comment only, zero logic change.

Migrated one extractor at a time (5 commits): lib creation + balanceSheetExtractor, then cashFlowExtractor, then incomeStatementExtractor, then bctcScalarAggregator, then the bctcMagnitudeValidator doc-only comment — each file's own targeted test suite run green before moving to the next.

tsc clean throughout. eslint clean on all 7 touched/created files. Per-file targeted suites matched pre-change baselines exactly: 186/186, 93/93, 121/121, 147/147, 17/17. Combined 42-file BCTC suite: 411 pass/4 skip/0 fail both before and after — byte-identical. Full `bun test` run twice (14334/40/68/7 then 14332/40/70/11, 1179 files, ~600s, Bun 1.3.13 crash-at-teardown both times — known engine bug): both failing-file sets are 100% the documented pre-existing VPS-proxy/RSS/news-poll/insider/foreign-flow/telegram-timeout flaky class, zero overlap with the 5 changed files; `1405b-bctc-vps-fixes.test.ts` re-ran isolated 12/12 pass (same verdict as the S10 sibling entry). Server boot verified PORT=3999: health/bctc-inspect/news-fetch-dashboard all 200, toolCount=183 unchanged, scheduler cron.schedule grep=3 unchanged.

Commits: 7f65dfccd (lib+balanceSheet) / b66575d40 (cashFlow) / 0ebca40ae (incomeStatement) / c34955bb1 (bctcScalarAggregator) / 4f15363da (bctcMagnitudeValidator doc) / b065b1151 (board REVIEW flip, next_agent=ops, rebuild_required=true).

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, server boot health 200 + dashboard routes 200 verified | HEALTHY.
