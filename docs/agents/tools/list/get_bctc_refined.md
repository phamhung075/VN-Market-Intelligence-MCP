# get_bctc_refined

**Purpose:** Fetch refined/validated BCTC data

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `year` | `number` | Fiscal year |

**Returns:** Validated financial data

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_refined", arguments={
  "ticker": ..., "year": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
