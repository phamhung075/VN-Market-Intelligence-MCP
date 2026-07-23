# get_money_radar_composite

**Purpose:** Money Radar — market-wide capital-flow / smart-money-rotation composite score, with a divergence engine (D1 index-vs-breadth, D2 price-vs-OBV, D3 crowd-vs-foreign, D4 unconfirmed breakout).

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| — | — | No parameters |

**Returns:** score (null when coverage_pct<0.5 — never zero-filled), delta_5d (null when <6 accrued history points), divergence{flag,severity,detectors,null_reason?} (flag=UNKNOWN — never GREEN — when a detector's axis is null), coverage_pct, source_tier (min contributing tier, honest floor), is_estimate, null_reason, and components (per-component normalized [-1,1] values…

**Example:**
```javascript
call_tool(server="vn-market", tool="get_money_radar_composite", arguments={})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
