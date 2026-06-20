# submit_bctc_correction

**Purpose:** Submit human correction for BCTC cell (bctc-analyst)

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `report_id` | `string` | Financial report UUID |
| `row_id` | `number` | bctc_table_rows.id — the row to correct |
| `new_value` | `number` | The corrected numeric value |
| `correction_source` | `string` | Source of correction (default: 'human_ui') |

**Returns:** Correction ID and audit trail

**Example:**
```javascript
call_tool(server="vn-market", tool="submit_bctc_correction", arguments={
  "report_id": ..., "row_id": ..., "new_value": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
