# Decision Journal — Sprint MONEY-RADAR-P0 · dev-mcp-server

**Sprint goal:** Money Radar (Radar Dòng Tiền) — fusion + DIVERGENCE layer over 9 live money-flow tools. Phase-0-first: no new crawls, real non-null readings day one (C1: close+volume only, 76 live bars).
**Agent:** dev-mcp-server
**Started:** 2026-07-01T00:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-01T00:00:00Z
**task-id:** MONEY-RADAR-P0-T2-COMPOSITE
**what-done:** Implemented `get_money_radar_composite` MCP tool — wires 8 reuse tools + T1 oscillators into brief §4 schema; D1-D4 divergence detectors; HN-1..HN-7 guards; 20 TDD tests green.
**what-considered:**
- OBV slope source: reuse Go T1 `obv` field directly (rejected — single cumulative-all-bars snapshot, no history param, no slope derivable) vs local recompute from daily_ohlcv using identical formula (chosen).
- credit-flow HN-3: hard-down-weight vs full exclusion when is_estimate — chose full exclusion (value=null, weight=0) as the strictest honest reading of "never enter as real."
- delta_5d: new forward-accruing `money_radar_score_history` table (chosen, mirrors market_breadth_history NFR-BR-1/2 pattern) vs no history (would violate schema's explicit delta_5d field).
**why-decision:** Reuse-first mandate (C2) forbids rebuilding LIVE tools but T1's OBV has no slope capability — local recompute is additive, not a rebuild, and keeps the Go endpoint as source of truth for rel_vol_z_20/up_down_vol_ratio/degraded_vwap (3 of 4 T1 fields consumed via cross-service HTTP).
**why-change:** creditFlowTools.ts extended (additive `direction`+`is_estimate` return fields) — needed structured HN-3 gate; MCP wire protocol unaffected (extra object fields ignored by SDK transport).

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-11T11:40:00Z
**task-id:** WATCHLIST-DB-SYSMAP-DRIFT-FIX
**what-done:** Refactored WATCHLIST_SEED to derive from system-map.json SSOT (was a 2nd hardcoded array); one-time transactional resync of the LIVE serving DB (41->33 rows, exact SSOT match).
**what-considered:**
- Resync script importing seedWatchlist.ts dynamically (matches carry-forward-bctc precedent) vs self-contained duplicate of the derivation logic — chose duplicate: the image bakes src/ at build time (unlike docs/data/), so a dynamic import would silently compute against STALE pre-rebuild code if run before the ops swap.
- sector->domain mapping: first-"/"-segment keyword match (chosen, deterministic/simple) vs full-string multi-keyword scan (rejected — ambiguous precedence on multi-clause sectors like "Food / Beverage / Retail").
- HIGH_VOL_TICKERS (4 of 7 now orphaned post-resync): left untouched (functionally inert no-op for absent codes) rather than pruning — pruning would silently change alert-threshold POLICY, out of this task's scope.
**why-decision:** SSOT-derivation must survive a rebuild without re-diverging; resync must be correct regardless of deploy-timing race.
**why-change:** none — matches handoff's root-cause pre-analysis exactly. Found live table (41 rows) diverged further than PM's pre-verify (52) — re-confirmed directly before applying, per hazard note.
