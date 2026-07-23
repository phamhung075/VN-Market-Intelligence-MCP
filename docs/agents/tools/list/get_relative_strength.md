# get_relative_strength

**Purpose:** VN-Index watchlist Mansfield relative-strength vs VN-Index for P1 Fear & Greed gauge.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `watchlist_tickers` | `array<string>` | Optional override of watchlist tickers (e.g. ['FPT','VCB']). If omitted, the TA service uses its server-configured WATCHLIST_TICKERS. |

**Returns:** (1) per-ticker rs_63d_pct / rs_126d_pct / rs_252d_pct — raw % outperformance vs index; (2) per-ticker Mansfield RS (63d/126d/252d) — normalized relative strength; (3) per-ticker composite_rs_score + composite_label (STRONG/NEUTRAL/WEAK); (4) market_rs_composite — gauge-ready scalar: mean composite RS (null when N<5, low_sample_warning=true)…

**Example:**
```javascript
call_tool(server="vn-market", tool="get_relative_strength", arguments={
  "watchlist_tickers": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
