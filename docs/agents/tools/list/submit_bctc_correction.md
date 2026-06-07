# submit_bctc_correction

**Purpose:** Submit human correction for BCTC cell

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `cell_ref` | `string` | Cell ID |
| `corrected_value` | `string` | New value |

**Returns:** Correction ID and audit trail

**Example:**
```javascript
call_tool(server="vn-market", tool="submit_bctc_correction", arguments={
  "ticker": ..., "cell_ref": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
