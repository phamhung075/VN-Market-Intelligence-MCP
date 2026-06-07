# dev-mcp-server -- Notebook

## c392 · 2026-06-07 (TSU-DEV-U2-PARITY: Final Count Verification) — REVIEW

**Task:** TSU-DEV-U2-PARITY — TOOL-SURFACE-UPGRADE sprint (terminal task)
**Deliverables:** Final parity verification after all U3 deregistrations + U6 description updates committed. Re-ran `gen-tool-registry.ts` (output: 157 tools, 12 groups). Ran parity test 8/8 GREEN (24 assertions). Confirmed /health toolCount=157. project-stats.json toolCount=157 (no change needed). All 5 deregistered tools absent from registry. Four-count convergence: generator=157, /health=157, parity-source-extraction=157, project-stats=157. Delta=0. tsc: clean. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.
**Note:** Full bun test suite triggers Bun v1.3.13 WriteFailed crash (RSS 1.09GB, pre-existing memory pressure) — unrelated to task. Parity test isolated run 8/8 GREEN.

Zone health: parity 8/0, tsc clean, 157 tools (SSOT, 5 deregistered tools absent confirmed), scheduler 76 cron.schedule | HEALTHY

---

## c391 · 2026-06-07 (TSU-DEV-U6: TSH Leftover Pair Description Updates) — COMMITTED

**Task:** TSU-DEV-U6 — TOOL-SURFACE-UPGRADE sprint  
**Deliverables:** 10 tool descriptions updated across 6 files — all 5 TSH leftover pairs clarified per architect verdict (KEEP ALL SEPARATE, description-only). Pairs: get_patterns/get_technical_indicators (already had cross-refs, confirmed), trigger_bctc/price/news_vps_fetch (added script names + return shapes + sibling refs + "NO tickers" for news), get_market_summary/generate_market_summary (cache-first vs force-regen semantics + cross-refs), get_insider_signals/get_insider_transactions (classifier+input-required vs DB+SSC+streak). `docs/data/tool-registry.json` regenerated (157 unchanged).  
**Tests:** 17 new GREEN (TSU-DEV-U6 test file, source-text scan pattern). Parity 8/8 GREEN. tsc: clean. tools=157, sched=76. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: 17/0 (U6), parity 8/0, tsc clean, 157 tools (SSOT), 76 cron.schedule — description-only, no logic change | HEALTHY

---

## c390 · 2026-06-07 (TSU-DEV-U3: 5 Deregister + 7 Integrate Description Updates) — COMMITTED

**Task:** TSU-DEV-U3 — TOOL-SURFACE-UPGRADE sprint  
**Deliverables:** 5 tools deregistered (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day) — server.tool() blocks replaced with no-ops, handlers retained. 7 tool descriptions updated (mark_alert_outcome, get_market_foreign_flow, diagnose+reset circuit breaker, get_label_accuracy_report, get_public_contracts, list_flagged_bctc_cells, submit_bctc_correction). `docs/data/tool-registry.json` + `project-stats.json` regenerated (162→157). cowork-refactory-expert signal row appended to orch-state.json signal_queue.  
**Tests:** 12 new GREEN (TSU-DEV-U3 test file). tool-registry-parity 8/8 GREEN (T-U2-5 confirmed 157). tsc: clean. tools=157, sched=76. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: bun test 12/0 (U3 suite) + 8/0 (parity), tsc clean, 157 tools (162-5 deregistered), scheduler 76 cron.schedule | HEALTHY

---

## c389 · 2026-06-07 (TSU-DEV-U5: Foreign Flow Null Holding Ratio) — COMMITTED

**Task:** TSU-DEV-U5 — TOOL-SURFACE-UPGRADE sprint  
**Deliverables:** `foreignFlowAnalyzer.ts`: added `is_holding_ratio_fabricated: boolean` to `ForeignFlowSignal`; gate holdingRatioChange5d computation + reasoning append when all holdingRatio=0. `foreignFlowTools.ts`: `formatForeignFlowOutput` gates Holding Ratio column + `Holding ratio change (5d)` line via `hasRealHoldingData = !signal.is_holding_ratio_fabricated`; tool description updated (removed "holding ratio change" mention). `companyProfileTools.ts`: `foreign_holding_ratio` emits null when `current_holding_ratio === 0` (DSI invariant).  
**Tests:** 10 new GREEN (TSU-DEV-U5 test file). tsc: clean. tools=157 (SSOT), sched=76. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: bun test 10/0 (U5 suite), 0 regression, tsc clean, 157 tools (SSOT), scheduler 76 cron.schedule | HEALTHY

---

### Baselines (FIX-PROJECT-STATS-GENERATED 2026-06-07)
tools=157 (post-U3), sched=76 | Generator: `bun scripts/gen-project-stats.ts` post tool/cron change
Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
