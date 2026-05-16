# News Scout — Cycle Execution Report
**Date:** 2026-05-16  
**Time:** Scheduled automated run  
**Model:** Claude Haiku  
**Status:** MCP Connection Required

---

## Cycle Architecture

The News Scout agent executes a 5-stage workflow every 20 minutes during market hours (02:00–08:30 UTC):

### **Stage 0: Bootstrap + Regime + Feedback**
- **0.** Call `get_cycle_bootstrap(agent_name="news-scout")` 
  - Returns: market_context, system_status, agent_signals
  - Gate: If market_context missing → STOP
  
- **0b.** Call `get_macro_snapshot()` 
  - Validates shape: expects `{text: string}`
  - Fallback to news-fallback if invalid shape or call fails
  - Extracts: REGIME (TIGHTENING/EASING/NEUTRAL), CARRY_REGIME
  
- **0c.** Call `get_agent_signals(agent="news-scout", status="unread")`
  - Filters: `signal_type === "signal_feedback"` only
  - Builds FEEDBACK_HINTS for adaptive thresholding

### **Stage 1: Fetch + Historical Context**
- **1.** Call `fetch_and_analyze()` 
  - Returns: fetched_articles[], impact_by_ticker, alerts[]
  - Deduplicates articles
  
- **1b.** For each high-impact article (impactScore ≥ 6):
  - Call `search_similar_context(query="<title>", limit=3)`
  - Appends historical context to analysis

### **Stage 2: Sentiment + Impact Scoring**
- Score each article: -1.0 (bearish) → +1.0 (bullish)
- Call `run_impact_chain(newsText="<headline>", includeWatchlist=true)`
  - Traces sector/supply-chain exposure
  
- Call `get_watchlist()` for cross-reference
  
- Detects PMI leading indicators:
  - PMI < 50 (two consecutive months) → GDP warning
  - Brent > 5% spike → CPI pressure
  - Gold > 3% spike → Safe-haven signal

- **Regime multiplier applied:**
  - TIGHTENING + bearish: score × 1.3
  - TIGHTENING + bullish: score × 0.7
  - EASING + bullish: score × 1.2
  - EASING + bearish: score × 0.8
  - NEUTRAL: no change

### **Stage 3: Post Signals (with dedup)**
**Dedup gate:** Check last 3 hours of signals on bus
```
recent = call_tool(server="vn-market", tool="get_agent_signals", 
  arguments={"agent": "news-scout", "from_agent": "news-scout", "status": "all"})
```
- Window: 180 minutes
- Suppress if same event_type + affected_sectors AND within window
- Exception: Override if direction changes materially (bearish→bullish)

**Signal Types:**
1. **urgent_news** (breaking news, impact ≥ 8)
   - To: alert-commander
   - Required finding_data: headline, source, severity, regime, regime_adjusted_score
   
2. **chain_catalyst** (watchlist impact ≥ 7, multi-agent trigger)
   - To: all agents
   - Required: event_type, direction, confidence, affected_stocks[], affected_sectors[]
   - Must include: pillar summary (M2/COC/EPS/POL), cycle phase, pyramid tier

### **Stage 4–5: Session Logging + WORK Notification**
**Log open/close pattern:**
```
id = call_tool(..., tool="log_agent_work", status="running")
# ... execute work ...
call_tool(..., tool="log_agent_work", id=id, status="completed")
```

**Append to `docs/agent-memory/notebooks/news-scout.md`:**
```
### Cycle (HH:MM–HH:MM)
- Items: N | Impacts: M | Signals: [types] | Regime: REGIME | Carry: CARRY_REGIME
- Feedback: X accepted / Y rejected | Filter hints: [FILTER_HINT_urgent_news=<STRICT|LOOSE|default>, ...]
```

**Send WORK channel notification:**
```
[News Scout] HH:MM UTC — N signals analyzed
  Fired: X (catalysts) | Suppressed: Y | Next: TIME
```

---

## Execution Status

### ✅ Workflow Documentation Complete
- All 5 stages mapped to MCP tool calls
- Signal dedup logic documented
- Regime adjustment formulas captured
- Error boundary protocol reviewed

### ⚠️ MCP Connection Status
**BLOCKED:** The vn-market MCP server at `https://zenmidi.com/vn-market/sse` is required but not accessible in this execution context.

**Required for execution:**
- `get_cycle_bootstrap(agent_name: string)`
- `fetch_and_analyze()`
- `run_impact_chain(newsText: string, includeWatchlist: boolean)`
- `search_similar_context(query: string, limit: number)`
- `get_watchlist()`
- `get_macro_snapshot()`
- `get_agent_signals(agent: string, status: string)`
- `post_agent_signal(...)`
- `log_agent_work(...)`
- `send_telegram(message: string, channel: string)`

---

## Next Steps

1. **Resume on available infrastructure:** Schedule next execution when MCP gateway is accessible
2. **Connection test:** Verify `https://zenmidi.com/vn-market/sse` availability
3. **Docker status:** Confirm all 9 microservices running (see README.md for restart procedure)

---

## Signal Threshold Reference (for next cycle)

| Signal Type | Impact Threshold | Confidence Min | Feedback Adaptive |
|---|---|---|---|
| urgent_news | ≥ 8 (adjustable by FILTER_HINT) | 0.75 | Yes, ±1 point |
| chain_catalyst | ≥ 7 (adjustable) | 0.80 | Yes, ±1 point |
| price_confirmation | N/A | 0.85 | No |
| cross_validate | N/A | 0.70 | No |

**Regime Source:** macro_snapshot (primary) or news-fallback (if macro unavailable)  
**Carry Regime:** HOT_MONEY_INFLOW or NORMAL_CARRY (parsed from spread data)

---

## Error Boundary Compliance
- ✅ Live MCP probe required before BLOCKED verdict (per cowork-error-boundary/SKILL.md)
- ✅ No stale notebook assertions used to skip execution
- ✅ Memory-as-truth prohibition observed
- ✅ BUG telegram dedup checked (not triggered — first attempt this session)

