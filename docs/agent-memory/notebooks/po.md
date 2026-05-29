# PO Notebook

## Cycle 2026-05-29T22:57Z — DECISION: DPI-2b live-input wiring (carry/yield not-recomputing)

**Trigger:** dev-macro-indicators completed DPI-2 (computedAt = time.Now()) but surfaced a scope blocker — the carry/yield regime INPUTS are still frozen fixtures in `usecases.go` (4.7 VND deposit / 5.33 Fed / 8.2 earning yield). Fresh timestamp on frozen inputs = cosmetic; carry permanently FII_OUTFLOW_RISK only because frozen 5.33>4.7. Textbook false-green vs user GOAL "carry/yield NOT RECOMPUTING".

**Did NOT rubber-stamp — verified live sources exist before deciding (per-input feasibility):**
- VND deposit → `sbv_rates.max_deposit_rate_pct` source='sbv' (SBV cron, mcp-server fetchers/sbv.ts). LIVE-WIRE.
- Fed funds → `fred_series_daily` series='EFFR' latest (fetchFredEffrIorb). mcp-server uses SAME 5.33 as documented fallback. LIVE-WIRE.
- Earning yield → `tracked_indicators` indicator='market_earning_yield' latest (marketEarningYieldJob → computeMarketEarningYield). LIVE-WIRE.

**Verdict: ALL THREE live-wirable, ZERO documented-gaps.** All in shared market.db the Go service already reads read-only (DPI-1 adapter). Fixtures (4.7/5.33/8.2) = literally mcp-server's documented fallbacks. No new HTTP fetcher. Pattern = exact mirror of DPI-1 SBVRateSQLiteAdapter (proven 3x: VN-Index, commodity, SBV-FX).

**Action:** created DPI-2b (`docs/handoffs/DPI-2b.md`, owner dev-macro-indicators). New CarryYieldInputsSQLiteAdapter + port + composition-root inject + Execute() resolve-with-fixture-fallback. Fixtures KEPT as explicit safe-degrade (NOT deleted — re-inlining a literal would re-hardcode). AC-6 regime-flip DV = anti-false-green proof; AC-7 live re-probe cross-checked vs direct DB read. Updated TASKS.md (DPI-2 annotated, DPI-2b registered) + SPRINT_GOAL success-metric #2 (timestamp alone insufficient) + owner chain.

**NEXT:** dev-macro-indicators implements DPI-2b. PIPELINE: continue.

## Carry-over
- DATA-PIPELINE-INTEGRITY ARMED: DPI-1/2 in REVIEW (await ops rebuild + QA), DPI-2b NEW (dev-macro-indicators), DPI-3/4 not yet started (dev-mcp-server). Rebuild order: mcp-server (3+4) FIRST, then macro-indicators (1+2+2b). DPI-2b rebuilds with 1/2 (same container). DoD = live re-probe all 4 surfaces + DPI-2b AC-6/AC-7.
- Architect's DPI-1 design is the proven template for DPI-2b adapter; no new arch brief needed (PO judged in-scope of established pattern). If dev hits a port-shape question, escalate to architect.
- BCTC-TABLE-BOUNDARY: code GREEN, infra-BLOCKED on live verify. Not touched this incident.
- SELF-IMPROVE-GATE X-1, BCTC-LAYOUT-FIRST still OPEN.
