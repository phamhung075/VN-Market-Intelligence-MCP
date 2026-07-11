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
