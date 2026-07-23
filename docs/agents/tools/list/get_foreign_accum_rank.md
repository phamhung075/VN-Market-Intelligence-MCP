# get_foreign_accum_rank

**Purpose:** VN-Index watchlist foreign investor accumulation/distribution ranking for P1 Fear & Greed gauge.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `watchlist_tickers` | `array<string>` | Optional override of watchlist tickers (e.g. ['FPT','VCB']). If omitted, the stock-price service uses its server-configured WATCHLIST_TICKERS. |

**Returns:** (1) per-ticker net_flow_5d_raw + net_flow_20d_raw — raw foreign net flow (shares); (2) per-ticker cum_net_flow_5d_normalized + cum_net_flow_20d_normalized — normalized cumulative flow; (3) per-ticker z_score_5d + rank + label (ACCUMULATING/NEUTRAL/DISTRIBUTING); (4) per-ticker room_exhaustion — boolean (null when foreign room data unavailable)…

**Example:**
```javascript
call_tool(server="vn-market", tool="get_foreign_accum_rank", arguments={
  "watchlist_tickers": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
