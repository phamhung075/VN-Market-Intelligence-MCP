# Cowork Refactory Expert — Notebook

**Last updated:** 2026-07-11T00:00:00Z | **Sprint:** ANALYSIS-QUALITY-CONVERGENCE

## Session: FR-1-REMAINING-5-FLOWS (Lane A, atomic with FR-2 CHEF leg)

**Task:** Wire 4 new indicator tools into 5 cowork flows (non-CHEF)
**Tools:** get_roc_momentum, get_relative_strength, get_52w_proximity, get_insider_sentiment

**Flows edited:**
1. market-watcher/cycle.md — Step 2 "Market indicators" (additive 4-tool block)
2. news-scout/stage-sentiment.md — L27-34 get_market_sentiment_index (added get_insider_sentiment)
3. bctc-analyst/stage-analyze.md — E1+E3 pre-pass fetch (per-TICKER insider_sentiment_context)
4. bctc-analyst/stage-consolidate.md — Step 5 trick_summary (cite insider_sentiment_context)
5. digest-predict/daily-predict.md — P-3 market indicators context (additive 4-tool block)
6. market-analyst/main.md — L74-80 P0 indicator tools (additive 4-tool block)

**Wiring pattern (from CHEF reference):**
- All via mcp__gateway__call_tool(server="vn-market", tool="<bare-name>")
- Honest-NULL/[SKIP] degrade per architecture brief §0.4
- CHEF anti-fabrication rule AF-1/AF-2 (numeric tokens) already in CHEF Step 6.7 only
- No gates/AF blocks added to these 5 flows (BA scoped FR-2 to chef.md only)
- Sign convention: pct_from_52w_high negative values allowed (-100% to 0%)

**Design notes:**
- bctc-analyst: insider_sentiment fetch is market-wide aggregate (not per-BCTC document) → placed in stage-analyze pre-pass, reused in stage-consolidate Step 5 narrative
- All 5 flows: honest-NULL expected today for insider_sentiment (per AC-10: FIX-VPS-SSC-INSIDER-502 traces to upstream 502; designed PASS state, not wiring bug)
- digest-predict: P-3 block expanded (already had 2 tools, added 4)
- market-analyst: top-down framework now enriched with momentum/strength/52w/insider context

## Known patterns / preferences

- Additive-only edits (no restructuring — NFR-3)
- Honest-NULL/[SKIP] degrade when unavailable (no fabrication guardrail AF-3 needed for these flows)
- Cowork flows use gateway call_tool wrapper; verify bare tool names match docs/data/tool-registry.json

---

## Session: CCATO-T3-FLOW-WIRING-6PT

**Coordination:** session_3dce23eb-6a30-4f92-aec0-51c1393dc399  
**Board Row:** IN_PROGRESS (PM commit d6e7ca903 — QA flips after build)  
**Date:** 2026-07-11

### Task Summary
Wired `.claude/skills/claim-truth-gate/SKILL.md` into 6 narrative-producing flows at exact anchor points (per architecture brief Lane B §5). Identical skill invocation across all 6 flows; real-time flows receive time-sensitivity override; other 4 are hard gates.

### Flows Wired (6/6 complete)
1. fb-market-poster/flow/main.md — STEP 4d (before STEP 5 write) — hard gate
2. unified-agent/flow/chef.md — Step 6.7 Rule AF-3 (pre-publish) — hard gate
3. market-watcher/flow/cycle.md — Step 4f (before WORK alert) — time-override
4. alert-commander/flow/stage-dispatch-log.md — Step 4a-pre (before dispatch) — time-override
5. digest-predict/flow/daily-predict.md — P-5.5 (before P-6 notebook) — hard gate
6. tran-ngoc-bau/flow/audit-market.md — Step 2 Backstop (after verify) — audit flag

### Round-2 Fixes (QA CHANGES_REQUESTED → APPROVED)

**DEFECT A — digest-predict/flow/daily-predict.md — P-5.5 gate repositioned**
- Was: P-5.5 gate ran AFTER create_prediction_claim() persisted all claims
- Now: P-5.5 gate runs BEFORE create_prediction_claim(), per-ticker
- Behavior: PASS → persist claim; FAIL first → self-correct; FAIL second → DROP ticker (honest-gap only, no claim filed)
- Result: False claims no longer persisted to prediction-claims system

**DEFECT B — market-watcher/flow/cycle.md — Step 4f gate repositioned**
- Was: Step 4f gate ran AFTER post_agent_signal() dispatch (after line 147)
- Now: Step 4f gate runs BEFORE post_agent_signal(), per-anomaly (before line 147)
- Behavior: Gate on payload.title/detail; time-sensitivity override preserved (2nd FAIL → honest-gap + proceed)
- Result: All anomaly signals gated before leaving market-watcher boundary
