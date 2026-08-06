# get_bctc_refined

**Purpose:** Fetch refined/validated BCTC data

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `report_id` | `string` | Financial report ID from financial_reports.id |
| `fields` | `'ids' \| 'full'` (optional, default `'full'`) | Projection. `'full'` (unchanged) returns every column including `markdown` — required by bctc-analyst narrative passes and the ESC-5 confidence gate. `'ids'` returns only `{ report_id, total_units, units:[{unit_id, window_status}] }` (no markdown read from DB) — for refine_bctc_md's resume skip-set build (FIX-GET-BCTC-REFINED-NO-PROJECTION-PARAM). |

**Returns:**
- `fields:'full'` (default): `{ report_id, units: Array<{ unit_id, page_numbers, markdown, flags, confidence, window_status, refined_at }>, total_units }`, or `{ error }` when no refined units exist.
- `fields:'ids'`: `{ report_id, total_units, units: Array<{ unit_id, window_status }> }` — always this structured shape, including `units: []` when the report has zero pushed units yet (never the `'full'` path's `{ error }` shape).

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_refined", arguments={
  "report_id": ...
})

// resume skip-set build (no markdown read):
call_tool(server="vn-market", tool="get_bctc_refined", arguments={
  "report_id": ...,
  "fields": "ids"
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
