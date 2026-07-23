# get_roc_momentum

**Purpose:** VN-Index watchlist ROC-12-1 momentum factor for P1 Fear & Greed gauge.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `watchlist_tickers` | `array<string>` | Optional override of watchlist tickers (e.g. ['FPT','VCB']). If omitted, the TA service uses its server-configured WATCHLIST_TICKERS. |

**Returns:** (1) per-ticker roc_12_1 — 12-month minus 1-month return (skip-month momentum); (2) per-ticker z_score + decile (1=bottom, 10=top) + label (MOMENTUM_LEADER/NEUTRAL/LAGGARD); (3) factor_return_buckets — 10-decile return spread showing factor efficacy; (4) momentum_factor_z — gauge-ready scalar: median z-score across deciles (null until 13 bars)…

**Example:**
```javascript
call_tool(server="vn-market", tool="get_roc_momentum", arguments={
  "watchlist_tickers": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
