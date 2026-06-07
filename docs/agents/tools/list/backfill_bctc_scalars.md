# backfill_bctc_scalars

**Purpose:** Back-fill missing scalar values in BCTC table

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `year` | `number` | Fiscal year |

**Returns:** Operation result with count of cells filled

**Example:**
```javascript
call_tool(server="vn-market", tool="backfill_bctc_scalars", arguments={
  "ticker": ..., "year": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
