# get_bctc_report_id

**Purpose:** Look up `financial_reports.id` (`report_id`) for a ticker + optional year/quarter,
restricted to `refine_status='DONE'`. Closes the ESC-5 / deep-dive gap: `get_bctc_full(code)`
never returns `report_id`, so `get_bctc_page_text` / `get_bctc_page_image` / `get_bctc_refined` /
`list_flagged_bctc_cells` / `submit_bctc_correction` — all of which REQUIRE `report_id` as
input — were otherwise unreachable (root cause of the 30-cycle bctc-analyst ESC-5 dark-escalation,
task BCTC-REPORT-ID-LOOKUP-TOOL).

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Stock ticker code, e.g. VCB (required) |
| `year` | `number` | Fiscal year filter (optional — omit to search all years) |
| `quarter` | `"Q1"\|"Q2"\|"Q3"\|"Q4"` | Quarter filter (optional — omit to search all quarters) |

**Returns:**
```json
{
  "action_code": "VCB",
  "refine_status_filter": "DONE",
  "report_id": "<most recent matching report_id, or null>",
  "report_ids": ["..."],
  "count": 1,
  "matches": [
    { "report_id": "...", "period_year": 2026, "period_quarter": 1, "period_type": "Q1",
      "sort_key": "2026-Q1", "refine_status": "DONE", "published_at": "..." }
  ],
  "existing_refine_status": null
}
```
Never errors on zero matches — `report_id` is typed-absent (`null`), not an `{ error }` shape.
When `count=0`, `existing_refine_status` is a diagnostic: the most recent report's ACTUAL
`refine_status` (e.g. `PENDING`) for this ticker/period, or `null` when no report was filed at all —
lets a caller (e.g. bctc-analyst ESC-5) distinguish "not yet refined" from "no report exists".

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_report_id", arguments={
  "code": "VCB",
  "year": 2026,
  "quarter": "Q1"
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern. Consumer:
`docs/agents/bctc-analyst/flow/main.md` § ESC-5 Step 5d.
