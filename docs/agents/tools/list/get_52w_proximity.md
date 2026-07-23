# get_52w_proximity

**Purpose:** VN-Index watchlist 52-week high/low proximity + MA50/MA200 for P1 Fear & Greed gauge.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `watchlist_tickers` | `array<string>` | Optional override of watchlist tickers (e.g. ['FPT','VCB']). If omitted, the TA service uses its server-configured WATCHLIST_TICKERS. |

**Returns:** (1) per-ticker high_52w / low_52w — rolling 252-session extremes; (2) per-ticker pct_from_52w_high / pct_from_52w_low — % drawdown from high / rally from low; (3) per-ticker above_ma50 + above_ma200 — boolean position relative to moving averages; (4) per-ticker proximity_label (AT_HIGH/NEAR_HIGH/MID_RANGE/NEAR_LOW/AT_LOW) + new_high_today…

**Example:**
```javascript
call_tool(server="vn-market", tool="get_52w_proximity", arguments={
  "watchlist_tickers": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
