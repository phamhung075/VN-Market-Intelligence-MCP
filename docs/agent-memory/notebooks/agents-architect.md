# agents-architect — Notebook

## 2026-06-30T17:50:58Z

**Brief:** `docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md`

CCATO-GATE: "narrative claim-vs-truth re-probe" × "blocks before publish" = empty across all 6 existing gates; verified on fb-post-2026-06-30.md (VNM line 28 + foreign-flow line 10 cleared all gates). Root cause: NO_TA self-reported at main.md:176-177, fb-data-integrity-gate.sh checks only present numbers. Tier-1 fix: shared `claim-truth-gate` skill + `narrative-truth-gate.sh` re-probe engine (reads `docs/data/claim-tool-map.json` SSOT; exits non-zero on contradiction; PASS-on-null avoids honest-NULL false positive). Wiring: fb-market-poster STEP 4d; CHEF Rule AF-3 in Step 6.7; market-watcher Step 4f; alert-commander Step 4a-pre; digest-predict P-5.5. TNB extends Step 2 to call same library (backstop). Self-heal: FAIL → self-correct in-cycle → emit narrative_contradiction signal → recurring≥2 → anomaly-task-bridge → po sprint. Tier-1 = scripts/+flow .md only; Tier-4 agent_id fix (evidenceTools.ts:413) = dev-mcp-server.

**Signal dropped:** `docs/signals/narrative-quality-ccato-gate-20260630T175058Z.json` → po

---

## 2026-07-01T07:52:40Z

**Brief:** `docs/architecture-briefs/2026-07-01-money-radar.md`

MONEY-RADAR: Capital-flow / smart-money-rotation subsystem with DIVERGENCE as headline signal. Grounded in workflow w97chja81 (4 mapper agents, 303k tokens). Non-negotiable constraints baked: `get_price_history` returns close+volume ONLY (no H/L verified live VCB 76 bars) → Phase 0 ships only the 4 depth-AND-field-independent oscillators (OBV, rel-vol z(20), up/down ratio, degraded VWAP labeled proxy). Reuse-first: 8 LIVE tools (foreign-flow suite, carry, credit, volatility, macro) wired into composite; tự-doanh is the ONE new Phase-1 crawl (CafeF/Vietstock via VPS, reuses cafef.ts). Centerpiece: divergence detectors D1 (index-vs-breadth), D2 (price-vs-OBV distribution), D3 (crowd-vs-foreign) all Phase 0; D3 gains full prop-desk form Phase 1. Honest-NULL: coverage_pct<0.5→null+null_reason; divergence null-axis→UNKNOWN never GREEN; credit-flow Tier-4 defaults excluded. CCATO tie-in: source_tier/is_estimate/null_reason feed the narrative-truth gate — divergence=UNKNOWN degrades to "không đủ dữ liệu", never fabricated rotation narrative. Phase-0 DoD: composite returns real non-null score live; D2 fires on real example; dashboard.money-radar.tsx renders honest-NULL pattern. Zone routing: oscillators→dev-technical-analysis Go:5003; composite+detectors→dev-mcp-server; tự-doanh crawl→dev-vps-crawls+dev-mcp-server; frontend→dev-frontend reusing GaugeCard+FreshnessBadge.

**Signal dropped:** `docs/signals/money-radar-20260701T075240Z.json` → po

---

## 2026-07-03T16:08:21Z

**Brief:** `docs/architecture-briefs/2026-07-03-severity-override-surfacing.md`

SEVERITY-OVERRIDE-SURFACING: PNJ (non-watchlist VN30) diamond-fraud prosecution detected by news-scout (#8371, confidence=0.95) reached zero persistent surfaces. Root cause = 3 independent scope leaks, not one gate: (A) CHEF's chef.md Step 0 GATHER never ingests bus-only `legal_risk`/`chain_catalyst`/`urgent_news` as a named input category at all (absence-of-ingestion, not just watchlist filter); (B) fb-market-poster main.md:232 explicit "relevant watchlist tickers" text; (C) system-map.json's alert-commander sender_rules text omits the CRITICAL override that already exists code-side (legal_risk always fires, no watchlist gate) — doc drift, likely source of the "alert-commander is watchlist-scoped" read; alert-commander's own notebook is 5+ weeks stale (cron-liveness flagged separately, out of scope). Predicate: legal_risk riskType∈{prosecution,asset_freeze} (0.95 tier only) OR price_anomaly move_sigma≥4.0 & impact≥6 (reused existing bar); chain_catalyst/crisis_velocity already market-wide, no change. Primary surface: unified-agent CHEF daily dish (guaranteed 3x/day, durable narrative) — NOT alert-commander (already correct on paper but ephemeral+liveness-suspect). Secondary echo: fb-market-poster's existing Legal-risk bullet, widened. New shared skill `.claude/skills/severity-override-gate/SKILL.md` (mirrors claim-truth-gate pattern) wired into CHEF+fb-market-poster. Dedup via `record_signal_outcome(...,"surfaced_marketwide",...)` + recommend extending news-scout's existing 180-min "materially different direction" exception pattern to the 360-min legal_risk gate for tier-escalation.

**Signal filed:** `docs/data/orch/orch-state.json` `.signal_queue.rows[]` id=`arch-severity-override-surfacing-20260703` (type=repair_task_request) → po. Backlog task id: `FEAT-SEVERITY-OVERRIDE-SURFACING`.
