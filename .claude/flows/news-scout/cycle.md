# News Scout — Cycle Flow

**Tools:** `.claude/tools/package/news-scout.md`

## Input
Bootstrap (market context 24h, system status, agent signals)

## Output
`urgent_news` + `chain_catalyst` signals on bus | WORK status | ledger entries (05:00 UTC)

---

## Error Boundary

If ANY tool call fails after 1 retry:
1. `send_telegram(channel="bug", message="[news-scout] Step N failed: {one-line error}")`
2. Append to session log: `"Cycle HH:MM — BLOCKED at step N: {error}"`
3. **EXIT immediately.** Do NOT investigate, write incident docs, or diagnose infrastructure.

Your job = fetch news → analyze → post signals → log. Blocked = report + EXIT.

---

## How to Call Tools

ALL tools use the MCP gateway. Every tool call in this flow means:

```
mcp__claude_ai_gateway__call_tool(
  server: "vn-market",
  tool: "<tool_name>",
  arguments: { ... }
)
```

If any tool call fails → read error message → apply fail-loud protocol (`.claude/knowledge/fail-loud-protocol.md`).

---

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `news-scout`)

```
call_tool(server="vn-market", tool="get_cycle_bootstrap", arguments={ "agent_name": "news-scout" })
```

If bootstrap fails or `market_context` missing → send BUG → STOP.

**0b. Regime extraction** (from bootstrap `market_context`, zero extra tool calls)
Parse `get_macro_snapshot` text block already in bootstrap:
```
REGIME      = "Global Liquidity: X"       → TIGHTENING | EASING | NEUTRAL
CARRY_REGIME = "VND Carry Spread" line    → HOT_MONEY_INFLOW | NEUTRAL | FII_OUTFLOW_RISK
```
If `get_macro_snapshot` not in bootstrap context → call it once:
```
call_tool(server="vn-market", tool="get_macro_snapshot", arguments={})
```

**1. Fetch news**

```
call_tool(server="vn-market", tool="fetch_and_analyze", arguments={})
```

Returns: `fetched_articles[]`, `impact_by_ticker`, `alerts[]`
Filter duplicates → extract title/source/published_date/content.

**1b. Historical context** — call once per high-impact item (impactScore ≥ 6):

```
call_tool(server="vn-market", tool="search_similar_context", arguments={
  "query": "<article title or main theme>",
  "limit": 3
})
```

- If results returned: prepend to analysis context — "N similar past events: <title> (<date>), ..."
- If no results (LanceDB empty): skip, continue without historical context
- Non-fatal: if tool errors, log and continue

**2. Sentiment + impact**

Score each article: -1.0 (bearish) to +1.0 (bullish).

For watchlist hits, trace impact chain:
```
call_tool(server="vn-market", tool="run_impact_chain", arguments={
  "ticker": "<TICKER>",
  "event": "<headline summary>",
  "impact_score": 8
})
```

Get watchlist for cross-referencing tickers:
```
call_tool(server="vn-market", tool="get_watchlist", arguments={})
```

PMI leading indicator detection:
- Extract Vietnam Manufacturing PMI value from news (S&P Global, published 2nd–3rd of each month)
- If PMI < 50 AND previous month PMI also < 50 → set `gdp_warning_signal=true` in signal `finding_data`
  → Post `chain_catalyst` with `event_type="macro"`, `direction="bearish"`, note: "PMI < 50 hai tháng liên tiếp — cảnh báo GDP quý tới (lead: 6-8 tuần)"
- If PMI > 52 after prior < 50 → set `gdp_recovery_signal=true`, post bullish `chain_catalyst`
- Store last PMI value in session log for next cycle comparison

Commodity → CPI → Policy chain:
- Brent crude: if price up >5% vs prior month → append to `chain_catalyst`: `"Dầu tăng mạnh → áp lực CPI → SBV có thể thắt chặt"`, set `cpi_pressure_risk=true`
- Gold spike >3% in week → append `"Vàng tăng — tín hiệu dân cư tìm nơi trú ẩn, thoát VND asset"` to `urgent_news` for banking/BVH watchlist stocks

Apply regime multiplier to `impact_score` before posting:
- `TIGHTENING + bearish` → score × 1.3 | `TIGHTENING + bullish` → score × 0.7
- `EASING + bullish` → score × 1.2 | `EASING + bearish` → score × 0.8
- `NEUTRAL` → no change
- `CARRY_REGIME=HOT_MONEY_INFLOW` + carry spread parsed > 3% → set `hot_money_risk=true` for FII-related news

**3. Signals**

Watchlist hit (breaking news) → post signal:
```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "news-scout",
  "to_agent": "alert-commander",
  "signal_type": "urgent_news",
  "stock_code": "<TICKER>",
  "payload": { "title": "<headline>", "detail": "<summary>", "impact_score": 7 },
  "ttl_minutes": 120,
  "chain_depth": 0,
  "finding_data": {
    "headline": "<news headline text>",
    "source": "<cafef|vnexpress|reuters|...>",
    "severity": "<low|medium|high|critical>",
    "regime": "<TIGHTENING|EASING|NEUTRAL>",
    "regime_adjusted_score": 7.0,
    "hot_money_risk": false,
    "cpi_pressure_risk": false
  }
})
```

Crisis / macro catalyst (triggers enrichment chain):
<!-- regime is read from bootstrap macro snapshot by alert-commander, not from signal finding_data.
     ChainCatalystFindingDataSchema is strict (no .passthrough()) — extra fields are silently stripped.
     Include regime context in payload.detail instead. -->
```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "news-scout",
  "to_agent": "all",
  "signal_type": "chain_catalyst",
  "stock_code": "<TICKER or omit>",
  "payload": { "title": "<headline>", "detail": "<summary> | regime=<REGIME> regime_adj_score=<N>", "impact_score": 9 },
  "ttl_minutes": 120,
  "chain_depth": 0,
  "finding_data": {
    "event_type": "<credit_policy|trade_war|earnings|macro|legal|crisis|sector_event>",
    "direction": "<bullish|bearish|neutral>",
    "confidence": 0.8,
    "affected_stocks": ["<TICKER1>", "<TICKER2>"],
    "affected_sectors": ["<sector1>"],
    "headline": "<news headline text>",
    "source": "<cafef|vnexpress|reuters|...>",
    "hot_money_risk": false,
    "gdp_warning_signal": false
  }
})
```

**4. Session log**

```
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "action": "news-scout-cycle",
  "context": { "items": N, "impacts": M, "signals_fired": X, "regime": "<REGIME>" }
})
```

Append to `docs/agent-memory/sessions/YYYY-MM-DD-news-scout.md`:
```
### Cycle (HH:MM–HH:MM)
- Items: N | Impacts: M | Signals: [types] | Regime: REGIME | Carry: CARRY_REGIME
```

**5. WORK channel**

```
call_tool(server="vn-market", tool="send_telegram", arguments={
  "message": "[News Scout] HH:MM UTC — N signals analyzed\n  Fired: X (catalysts) | Suppressed: Y | Next: TIME",
  "channel": "work"
})
```

**6. BUG on error**

Before sending to BUG: check recent fixes to avoid duplicate reports.
```
call_tool(server="vn-market", tool="get_recent_fixes", arguments={ "limit": 20 })
```
If issue already fixed (matching title/module in recent fixes) → **skip, do not re-report**.

```
call_tool(server="vn-market", tool="send_telegram", arguments={
  "message": "[News Scout] ⚠️ SEVERITY\n  Issue: ... | Impact: ... | Status: Retrying/Blocked",
  "channel": "bug"
})
```

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## Batch 2 Sentiment Log (05:00 UTC daily)
Per ticker from `get_watchlist()` → if `docs/analysis-briefs/{TICKER}.md` does not exist → create it first:
```markdown
# {TICKER} — Analysis Ledger {YEAR}
**Sector**: {domain} | **Exchange**: {exchange}

## [Report Analyzer] Fundamentals & Valuation

## [News Scout] Headlines & Sentiment

## [Market Watcher] Price, Volume, Technicals

## [Unified Agent] Quarterly Syntheses
```
Then append to `docs/analysis-briefs/{TICKER}.md` [News Scout]:
```
YYYY-MM-DD | {sentiment description} | YoY: {comparison or "no prior data"}
```
Only when `|sentiment_score| ≥ 0.1` OR neutral (document absence) | one line | skip weekends/holidays
