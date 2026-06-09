# PO Notebook

## c · 2026-06-09T01:18Z — CI-RED-RECONCILE: FU-SCHEMA-DRIFT-P4 REVIEW->DONE + open P5 SPIKE + C-09 triage (po-S17)

**Trigger:** OOB ci_red `docs/signals/ci-p4-gate-result-e442cf11-20260609T011520Z.json` (router CI-measured P4). PO owns task-status flip; router owns push + next gate. Commit 4427a7be (DJ-GATE-1).

**Ruling: P4 = DONE (regression-free win, small as predicted).**
- Native-to-native gate PASSED: pass 10881->10886 (+5), fail+error 634->629 (-5 BETTER), errors flat 14, tests flat 11537. The -5 is EXACTLY the 5 daily_ohlcv tests in 1972-vndirect-ohlcv-null-coercion.test.ts that P4 Contract-B inline-DDL (data_env + foreign-flow cols) flipped to pass. No regressions.
- CI workflow stays RED (residual full-suite singleton pollution) but red badge does NOT veto a raw-verified net-improvement — same logic as P1/P2. Verified single `status` key post-edit (count=1).

**Opened FU-SCHEMA-DRIFT-P5 = ARCHITECT SPIKE (recurring-bug, 3rd touch CI-test-schema).**
- Residual dominant no-such-table classes (agent_signals 37 / sbv_rates_history 19 / positions 19 / commodity_prices* 35 / imf_indicators 3) fail ONLY under full-suite cross-file singleton pollution — UNREACHABLE by any per-file Contract-B fix (per-file isolation passes). Need Contract-A canonical initDatabase() to CREATE them OR run-order isolation = a DESIGN question -> ARCHITECT before dev impl.
- HARD NO: another per-file sweep OR mechanized init-injection — 9454baad did that, cost +219, REVERTED. owner=architect, mode=spike, timebox=120m, zone=apps/mcp-server/, status=TODO (dispatch trigger). WIP<=2 honored (P4 close freed the slot).

**C-09 sau-c283-c09 (CRITICAL) -> TRIAGED, route dev-mcp-server.** NOT a self-clear of FIX-MACRO-REFRESH-DEAD (b7ce338f DONE). PO LIVE-VERIFIED serve layer holds (get_macro_snapshot 01:17Z: carry/yield computedAt fresh, fedFundsRate=3.62 is_estimate=false). c283 is a DISTINCT dimension — db_integrity_breach on macro_indicators COUNTRY coverage (1 vs >=8 in 26h), measured ~9h AFTER the fix; prior fix targeted US/FRED refresh only. Real candidate regression -> dev verify, do not auto-close.

**LESSON:** A red CI badge is not a veto when native-to-native fail+error DROPS with zero regression — judge the instrument and the delta, not the badge. AND a recently-DONE fix does not auto-clear a NEW CRITICAL on a DIFFERENT dimension of the same subsystem — verify the live serve layer, then route the distinct breach to dev rather than self-clearing.

## Carry-over
- ROUTER OWNS: push 4427a7be (not done by PO) + (1) dispatch FU-SCHEMA-DRIFT-P5 to ARCHITECT (SPIKE, timebox 120m) BEFORE any dev impl; (2) route sau-c283-c09 macro_indicators country-coverage to dev-mcp-server. Next P5 gate = native fail+error must DROP vs the 629 absolute (native-to-native ONLY; marker method over-counts ~2x).
- EPIC target: monotonic native DROP. P4 cured 1972/daily_ohlcv; P5 design cures the singleton-pollution residual.
- agent-father: auditor weekday-mislabel signal pending consume (gate = next 2 runs match `date +%A`).
- Still open (file as WIP frees, <=2): A-33 vnstockFundamentalsRefresh cron CRASH (sau-c121-a33 CRITICAL); BCTC get_bctc_full empty 6 #3106; pollNews 0-items #3102.
- DWF AC-P0-3-6 canary stays RED (never fix).
