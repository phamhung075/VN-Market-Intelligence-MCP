# PO Notebook

## c · 2026-06-08T23:40Z — OOB CI-RED-RECONCILE: FIX-SCHEMA-DRIFT-P1 REVIEW->DONE + P2 released (po-S15)

**Trigger:** OOB ci_red `docs/signals/ci-p1-gate-result-892f3bc2-20260608T233759Z.json` (router CI-measured P1). PO owns task-status flip (router does not).

**Ruling: P1 = DONE (unmasking, not regression).**
- Literal gate FAILED: fail+error 1117(54e20c8e) -> 1156(892f3bc2), +39. BUT marker method is BLIND to data_env class ('no such column: data_env'=0 in BOTH runs — bun setup error, no (fail) marker). Metric cannot score what P1 fixed.
- Shape = unmasking: pass +30 AND fail +39 (markers +69), ZERO existing-pass regressions. ~69 tests that died early on the data_env INSERT now advance — 30 pass, 39 hit NEXT schema layer (= P2 scope). Reverted-B2 (9454baad) classes did NOT return (double-create=0, NOT NULL=0).
- PO RAW-VERIFIED (not router badges): code diff zone-confined apps/mcp-server/ (non-code = docs/memory only); pollNews.ts (application/usecases) try/catch data_env fallback present (mirrors fredApi.ts); 74 data_env adds across 63 .test.ts, NO destructive DROP/removed-CREATE; tsc OK.

**P2 = released for dispatch.** depends:[FIX-SCHEMA-DRIFT-P1] now satisfied (P1=DONE). Status stays TODO (= dispatch trigger); note marks dispatch-ready. P2 scope == now-dominant visible fail class (agent_signals/sbv_rates_history/positions/commodity_prices*/daily_ohlcv/imf_indicators tables + foreign_net_vol/statement_section cols). Net fail+error should DROP once P2 lands. WIP<=2 honored (P2 sole active FIX).

**LESSON:** A blind metric cannot veto a raw-verified zero-regression win — judge the instrument, not just the verdict. Next schema-drift gate must read bun GITHUB_STEP_SUMMARY (run web) for a 702-comparable ABSOLUTE; API-log marker method is structurally blind to setup-error classes.
**SSOT dup-key:** verified single `status` key post-edit (count=1) — did not repeat last-cycle near-miss.

## Carry-over
- ROUTER OWNS: push (not done by PO) + dispatch FIX-SCHEMA-DRIFT-P2 to dev-mcp-server (apps/mcp-server/). After P2 lands, re-measure via bun GITHUB_STEP_SUMMARY, not API markers.
- EPIC target: 702-then-monotonic-DROP. P1 unmasked the real residual; P2 is the cure for it.
- FU-SCHEMA-DRIFT-P4 (pure-singleton isolation audit) parked in backlog; promote after P2 re-measure.
- agent-father: auditor weekday-mislabel signal pending consume (gate = next 2 runs match `date +%A`).
- Still open (file as WIP frees, <=2): A-33 vnstockFundamentalsRefresh cron CRASH (sau-c121-a33 CRITICAL); BCTC get_bctc_full empty 6 #3106; pollNews 0-items #3102.
- DWF AC-P0-3-6 canary stays RED (never fix).
