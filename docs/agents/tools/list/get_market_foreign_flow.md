# get_market_foreign_flow

**Purpose:** Market-wide foreign flow aggregate (SUM across all tracked tickers from daily_ohlcv). Distinct from `get_foreign_flow` which returns per-ticker flow. Coverage: watchlist tickers only, not full exchange — `ticker_count` per session is returned so callers can evaluate coverage. Source tier: 2.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `days` | `integer` | No | `1` | Number of most-recent trading sessions to aggregate (1–30, default 1 = latest only) |
| `top_n` | `integer` | No | `5` | Number of top net-buyer and net-seller tickers to include for the latest session (1–20, default 5) |

**Returns:** Formatted text with market-wide buy/sell/net volumes per session plus top-N net buyers and sellers for the latest session. Wrapped in `{ source_tier: 2, coverage_note: "...", text: "...", latest_date: "...", sessions_returned: N }`.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_market_foreign_flow", arguments={
  "days": 5,
  "top_n": 5
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
