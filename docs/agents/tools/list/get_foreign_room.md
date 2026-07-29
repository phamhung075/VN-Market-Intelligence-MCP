# get_foreign_room

**Purpose:** Foreign investor room utilization and saturation suite for VN watchlist tickers.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Optional stock ticker (e.g. 'VCB'). When omitted, returns data for all tickers present in `vnstock_trading_stats` (the full traded universe touched by the fundamentals job — 100+ codes live, not just the watchlist). |
| `top_n` | `number` | Optional, default `10`. Max tickers to include inline in `tickers[]` when `code` is omitted. Effective limit is `min(top_n, actual ticker count)` — never a fixed universe-size assumption. Ignored when `code` is set (single-ticker response is never trimmed). |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape. Notable fields (FIX-GET-FOREIGN-ROOM-TOOL-RESULT-TOKEN-BUDGET, 2026-07-29):
- `tickers[]` — trimmed to `top_n` entries when `code` is omitted, ranked ROOM_LOCKED/FULL_ROOM_SELL-flagged first, then highest `|depletion_velocity_5d|` ("top-N by |net|"), then `room_utilization_pct`, then `market_cap_bn`.
- `tickers_rollup` — aggregate counts (`total_tickers`, `returned_tickers`, `room_locked_count`, `full_room_sell_count`, `foreign_restricted_count`, `avg_utilization_pct`) computed over the **full** universe, regardless of trimming.
- `more_available` (`boolean`) + `fetch_more.omitted_codes` (`string[]`) — present when tickers were trimmed; re-fetch any one of them individually via `code=<ticker>`.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_foreign_room", arguments={
  "code": ...,
  "top_n": 10
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
