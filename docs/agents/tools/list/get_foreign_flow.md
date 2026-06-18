# get_foreign_flow

**Purpose:** Retrieve and analyze foreign investor flow history for a VN stock. Returns direction (net_buy / net_sell / neutral), severity (LOW/MEDIUM/HIGH), consecutive streak days, net volume over 3d and 5d windows, and a daily history table. Source tier: 2 (aggregator — HOSE/HNX data via Vinahost VPS proxy).

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `code` | `string` | Yes | — | Stock ticker, e.g. `'VNM'`, `'VCB'`, `'HPG'` |
| `days` | `integer` | No | `10` | Number of calendar days of history to fetch (2–30) |

**Notes:**
- `_testFallback` is an internal test-only parameter — do not use in production.
- If foreign flow data has not been collected yet (all volumes are 0), returns a clear no-data message.
- Holding ratio column is omitted (VPS API does not provide this field).
- `source_note` field on response indicates path: `'primary'`, `'fallback:cache'`, or `'fallback:none'`.

**Returns:** Formatted text with signal summary (direction, severity, consecutive days, net vol 3d/5d) and daily history table. Wrapped in `{ source_tier: 2, text: "..." }`.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_foreign_flow", arguments={
  "code": "VCB",
  "days": 10
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
