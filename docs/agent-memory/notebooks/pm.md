# PM — Notebook

## c312 VN-MACRO-TOOLING sprint decomposition · 2026-06-14T180000Z

ARCHITECT brief FINAL (ARCH-VN-MACRO-TOOLING, commit 675891163d) + BA spec FINAL (REQ_VN-MACRO-TOOLING, commit 11d318ea) → decomposed into **20 atomic PM tasks** across 5 execution waves. Key innovation: **explicit probe-gating model** (PROBE-1..4 in WAVE-1 run in parallel, determine parse strategy for WAVE-2 Zone A parsers before code is written). No parser code written before live payload captured in `scripts/probes/vmt-N-sample.json` (GA-7 probe-first methodology honored).

**Task structure:**
- **WAVE-1 (6 tasks, parallel, 0 deps each):** 4 VPS-fetch probes (ops-vps-crawls, each ~1-2h) + Zone D vpsFetch.go adapter (dev-macro-indicators, critical blocker for all Zone A) + Zone C survey_distribution stub (dev-mcp-server, independent)
- **WAVE-2 (4 tasks):** Zone A parsers not gated on probes OR gated on vpsFetch-D only: VMT-1a (total+hs_attribution), VMT-2 (full BOP, but gated on PROBE-2), VMT-3a (PMI—not geo-blocked), VMT-5a (policy_rates+SJC+fx_coupling)
- **WAVE-3 (4 tasks):** Zone A parsers gated on probe results: VMT-1b (bloc_split, gated PROBE-1), VMT-3b (GSO, gated PROBE-3), VMT-4 (CPI, gated PROBE-3), VMT-5b (interbank+OMO, gated PROBE-4)
- **WAVE-4 (5 tasks):** Zone B thin HTTP proxy handlers (each depends on corresponding Zone A endpoint being live): VMT-7a..7e (MCP handlers for 5 tools)
- **WAVE-5 (1 task):** Zone B registration + gateway discoverability + skill switch-on acceptance gate: VMT-7-REGISTER

**Probe-gate dependency model** (load-bearing for avoid-F1-parser failures):
- PROBE-1 (Customs FDI-bloc) → gates only VMT-1b `bloc_split` field; VMT-1a proceeds without probe
- PROBE-2 (SBV BOP format—PDF vs Excel, E&O sign convention) → gates VMT-2 full parser
- PROBE-3 (GSO monthly release—table structure, CPI baskets) → gates VMT-3b + VMT-4; VMT-3a (PMI) NOT gated
- PROBE-4 (SBV interbank 1w tenor, OMO outstanding) → gates only VMT-5b fields; VMT-5a proceeds without probe

**Handoff files created:** TASK_PROBE-1.md through TASK_PROBE-4.md (4 probe specs), TASK_VMT-D-VPSFETCH.md (Zone D critical), TASK_VMT-6-CREDIT-FLOW-EXTEND.md (Zone C stub). orch-state.json .task_board.active_sprints[VN-MACRO-TOOLING].tasks updated with 20 atomic tasks, wave assignments, dependency edges, file lists per task.

**Key design decisions honored:** (1) DDD Fence-A: Zone D VpsFetchPort is domain port interface, not direct infra import; (2) Honest is_estimate: VMT-6 ships survey_distribution.is_estimate=true with note "VIRA/VARA no machine-readable source confirmed"; (3) IRS deferred (DD-6): irs.is_estimate=true permanent, no blocker; (4) No parallel file conflicts: each task touches disjoint files (WAVE-1/2/3 fully parallelizable).

**WIP limit decision:** Recommend dispatch all 6 WAVE-1 tasks in parallel (ops gets 4 probes, dev-macro-indicators gets Zone D, dev-mcp-server gets Zone C). WIP count = 6 (under soft limit 10). After WAVE-1 returns + container rebuild (post Zone D commit), WAVE-2 unblocks with 4 Zone A tasks to dev-macro-indicators (WIP=4 for single dev).

**First dispatch set (WAVE-1 READY NOW):** ops-vps-crawls: [PROBE-1, PROBE-2, PROBE-3, PROBE-4]; dev-macro-indicators: [VMT-D-VPSFETCH]; dev-mcp-server: [VMT-6-CREDIT-FLOW-EXTEND]. All independent, no blockers, ready to go. NEXT: main terminal routes to dev-team Step 3 (dispatcher) for WAVE-1 fan-out spawn.

---

## c314 VN-MACRO-TOOLING WAVE-4 VMT-7 Zone-B handler sequencing + per-handler contracts · 2026-06-14T210000Z

SCOPE: Sequence 6 unsequenced VMT-7 tasks (serial_dispatch_order=null, merge_gate=null from architect handoff). **WAVE-4 Zone B MCP handler thin proxies + WAVE-5 registration gate.** All 6 tasks created in orch-state.json backlog (VMT-7a-e handlers + VMT-7-REGISTER).

**Parallelization Decision (verified against live tree):**
- **VMT-7a–7e are FULLY PARALLELIZABLE** → all share serial_dispatch_order=1 (same tier, no file conflicts):
  - VMT-7a: tradeBalanceTools.ts (separate file, new)
  - VMT-7b: bopTools.ts (separate file, new)
  - VMT-7c: macroIndicatorsVnTools.ts (separate file, new)
  - VMT-7d: cpiComponentsTools.ts (separate file, new)
  - VMT-7e: liquidityStateTools.ts (separate file, new)
  - None touch index.ts directly (that is VMT-7-REGISTER's exclusive job)
  - Result: dev-team can spawn all 5 in parallel (WIP≤2 enforced by dispatcher, will pipeline 2-at-a-time)
- **VMT-7-REGISTER serialized behind all 5** → serial_dispatch_order=2, merge_gate=[all 5 task IDs]
  - Touches shared files tools/macro/index.ts + registry.ts (barrel + registration)
  - Cannot start until VMT-7a–7e merged

**Per-Handler Live Contracts Attached (Zone-A response DTO shapes derived from dtos_vmt_*.go):**

1. **VMT-7a-TRADE-BALANCE-HANDLER** → get_vn_trade_balance / POST /trade-balance
   - Zone-A DTO: TradeBalanceResponse (dtos_vmt_trade.go)
   - Key fields: export_total_mn_usd, import_total_mn_usd, trade_balance_mn_usd, hs_exports[], hs_imports[], bloc_split (BlocSplitDTO)
   - Critical: bloc_split.fdi.is_estimate=true PERMANENT (Decision A), bloc_split.domestic.is_estimate=true PERMANENT
   - Sample: scripts/probes/vmt-3-sample.json (sheets 14.XK, 15.NK)

2. **VMT-7b-BOP-HANDLER** → get_vn_bop / POST /bop
   - Zone-A DTO: BOPResponse (dtos_vmt_bop.go)
   - Key fields: quarter, period, current_account (9 sub-fields), capital_account_mn_usd, financial_account (4 sub-fields), errors_omissions_mn_usd, fx_incidence, offshore_parked, overall_balance_mn_usd, reserve_assets_mn_usd
   - Critical: fx_incidence.is_estimate=false (primary source), offshore_parked.is_estimate=true ALWAYS, errors_omissions follows BPM6 sign (negative=outflows)
   - Sample: scripts/probes/vmt-2-sample.json (Q4-2025 live)

3. **VMT-7c-MACRO-INDICATORS-HANDLER** → get_vn_macro_indicators / POST /macro-indicators-vn
   - Zone-A DTO: MacroIndicatorsGSOResponse (dtos_vmt_macro.go)
   - Key fields: period, iip[] (4 IIPSectorDTO: all_industry, manufacturing, mining, electricity with yoy_pct, ytd_yoy_pct, mom_pct), is_estimate=false
   - Critical: iip[].is_estimate=false (primary PROBE-3 source), exactly 4 sectors (fail-closed if parsed count differs)
   - Sample: scripts/probes/vmt-3-sample.json (May-2026 live)
   - Note: HTTP path is /macro-indicators-vn (not /macro-indicators); MCP tool is get_vn_macro_indicators

4. **VMT-7d-CPI-COMPONENTS-HANDLER** → get_cpi_components / POST /cpi-components
   - Zone-A DTO: CPIComponentsResponse (dtos_vmt_cpi.go)
   - Key fields: period, headline (CPIBasketDTO), baskets[] (11+ CPIBasketDTO), weights_is_estimate=true, weights_note
   - Critical INVARIANT: weight_pct MUST be null on ALL baskets + headline (non-negotiable, weights from PDF only); weights_is_estimate=true PERMANENT
   - Sample: scripts/probes/vmt-3-sample.json (CPI section, May-2026 data)

5. **VMT-7e-LIQUIDITY-STATE-HANDLER** → get_vn_liquidity_state / POST /liquidity-state
   - Zone-A DTO: LiquidityStateResponse (dtos_vmt_liquidity.go)
   - Key fields: policy_rates (PolicyRatesDTO with refi/discount/lombard + is_estimate), sjc_gold_gap (SJCGoldGapDTO), fx_coupling (FXCouplingDTO), irs (LiquidityStateIRSDTO), omo (OMOOutstandingDTO), interbank_1w (InterbankRateDTO)
   - Critical INVARIANTs (load-bearing):
     - irs.is_estimate=true PERMANENTLY (DD-6 invariant, HNX OTC not machine-readable)
     - interbank_1w.is_estimate=true PERMANENTLY (architect Decision B invariant, dttktt unreachable)
     - interbank_1w.rate_1w_pct=null ALWAYS (never non-null)
     - interbank_1w.blocked_reason="dttktt.sbv.gov.vn unreachable from Vinahost VPS (100% packet loss)"
     - omo.is_estimate=false on successful HTML parse, true on failure (fail-closed)
   - Sample: scripts/probes/vmt-4-sample.json (OMO section, 2026-06-12 live)

6. **VMT-7-REGISTER** (serial_dispatch_order=2, merge_gate=[all 5 handlers])
   - Wires 5 new exports into tools/macro/index.ts (barrel, additive)
   - Wires 5 new registerXxxTool() calls into registry.ts registration sequence
   - Acceptance gate: tsc --noEmit clean + manual curl test to gateway call_tool for each tool (expect 200 with correct DTO shape)

**WIP transition:** After WAVE-2 Zone A tasks all merge, WAVE-4 (VMT-7a–7e parallelizable handlers) ready to spawn. Router dispatches all 5 to dev-mcp-server in ONE batch (WIP=5 but dev-team enforces WIP≤2 so actual flow is 2-at-a-time pipeline). After all 5 merge and tests pass, VMT-7-REGISTER unblocks as final merge gate.

**Board hygiene (PM strict discipline):** 6 tasks added to backlog, all with load-bearing dispatch_contract field (Zone-A DTO shapes derived from live dtos_vmt_*.go files, not schema comments). No schema-comment contracts; all are DTO-read-first (GA-7 honored). Commit covers ONLY docs/data/orch/orch-state.json + docs/agent-memory/notebooks/pm.md (explicit path only). Next: router RAW-verifies contract shapes before dispatching to dev-mcp-server.

---

## Archive: Earlier Cycles (c313–c189)

Cycles c313 (WAVE-2 contracts), c311 (ARCH-CRON decomposition), c310 (DOCLANG Phase 1 closure), c309 (DOCLANG decomposition), c308 (ARCH-CRON initial), c307 (FIX-MCP-CRASH-LOOP decomposition), c306 (QUE-REFERENCE-PAGE), c305 (OHLCV-CONTAM closure), c304 (FE-CORPEVENTS), c303 (CONTAM-8 approved), c301 (REAUDIT-001), c300 (SHIP-WAVE-REAUDIT). See git history commits 675891163d...5d121989 (2026-06-14 and prior).

Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).

---

## c315 MERGE-GATE board update — FIX-BCTC-ENRICH-SILENT-0ROWS · 2026-06-15T185000Z

MERGE-GATE BOARD UPDATE (user directive): **FIX-BCTC-ENRICH-SILENT-0ROWS** (P0, multi-zone BCTC enrich silent-0-rows) merges to main via dev-team :07 merge-gate (2026-06-15T18:30Z).

**Merged commits verified:**
- **68d54c7b** (dev-pdf-extractor LEAD): Layout 6+7 for B02-TCTD Roman-numeral section codes + single-digit sub-codes in apps/pdf-extractor/infrastructure/text_table_extractor.py. Root cause: Layouts 1–5 only matched \d{2,}, so every VCB/CTG bank-form line parsed None → silent 0-rows. 856/856 unit tests pass. Generic, no allowlist. DJ journal: docs/agent-memory/decisions/sprint-KINHDICH-HOVER-DETAIL-dev-pdf-extractor.md
- **989654f2** (dev-mcp-server co-owner): 0-row gate in apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts — reads ACTUAL bctc_table_rows + bctc_md_tables counts; if both 0 marks the bctc_vps_queue row enrich_failed (NOT done) + logger.error + sendTelegramBug. Generic, no per-ticker case. 55/55 tests pass. DJ journal: docs/agent-memory/decisions/sprint-2026-06-15-dev-mcp-server.md

**Board mutation (atomic temp→rename):**
1. Move FIX-BCTC-ENRICH-SILENT-0ROWS: in_progress → review lane
2. Record commit SHAs: 68d54c7b 989654f2
3. Set done_verified: PENDING + reason: "ops must REBUILD BOTH pdf-extractor + mcp-server containers, then re-trigger runBctcReparseJob for VCB/CTG bank tickers, then RAW-verify: (a) get_bctc_full(VCB) returns real VARIED rows vs the NAMED-VOLUME market.db (vn-market-intelligence-mcp_market_data — NEVER host ./data decoy); (b) a 0-row extraction's queue row shows status=enrich_failed not done; (c) non-regression — VCB 2025Q4 (112 rows) + FPT 2026Q1 (145 rows) still parse. done_verified is a LIVE RAW probe, NEVER a badge."
4. Set rebuild_required: BOTH pdf-extractor AND mcp-server

**Follow-on task minted (PREEXISTING defect surfaced during live-verify):**
- **FIX-BCTC-FPT-BT5-BALANCE-GATE** (P1, backlog, dev-pdf-extractor lead): FPT corporate-form (B01-DN, 3-digit codes) real-OCR extraction fails the BT-5 balance gate with delta = 43 TRILLION VND. Test: apps/pdf-extractor/__tests__/.../test_extract_tables_bt3d_real_ocr.py::test_extract_tables_usecase_real_ocr_path. Last touched 9a5527bd (2026-06-13), predates Layout 6+7. Suggested: id FIX-BCTC-FPT-BT5-BALANCE-GATE, route_to dev-pdf-extractor, priority P1 (real served-metric accuracy per /goal#1 plausibility — a 43T VND balance imbalance is wrong data, not just empty data), generic mandate, lane = backlog (NOT in_progress — respect WIP≤2). NOT blocked by FIX-BCTC-ENRICH (different root: B01-DN 3-digit parsing vs B02-TCTD bank-form silent-0). Minted as async follow-on; architect may spike later if BCTC area >2 fix cycles.

**Decision Journal Gate (DJ-GATE-1):**
- ✅ Appended docs/agent-memory/decisions/sprint-2026-06-15-pm.md: pm-S1 (FIX-BCTC move + rationale), pm-S2 (FIX-BCTC-FPT-BT5 follow-on + rationale). Each STEP ≤12L; required before board flip valid.

**WIP impact:**
- FIX-BCTC-ENRICH now: review lane (rebuild-required, WIP-gated → ops job not PM)
- ARCH-CRON-SCHEDULER-RELIABILITY: stays in_progress (architect design, not coding)
- Active coding lanes: 1 (within cap)

**Commit discipline (explicit-stage + RULE 1-3):**
- Staged: docs/data/orch/orch-state.json (task board: move lane + set rebuild_required + new backlog task)
- Staged: docs/agent-memory/decisions/sprint-2026-06-15-pm.md (journal entries)
- Staged: docs/agent-memory/notebooks/pm.md (this notebook entry)

**NEXT:** Router dispatches ops (REBUILD containers) + QA (live-probe after rebuild).
