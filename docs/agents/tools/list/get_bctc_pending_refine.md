# get_bctc_pending_refine

**Purpose:** List BCTC financial reports pending agentic refine processing, with pre-partitioned windows.

Default behavior: returns oldest reports in queue (text_status='COMPLETE', refine_status IN ('PENDING','PARTIAL','FAILED'), confirm_status != 'CONFIRMED'). Optional parameters allow targeted fetch by ticker or exact report ID.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | `number` | No | Max results (1–100). Ignored when `report_id` is supplied. |
| `ticker` | `string` | No | Filter by ticker symbol (`action_code`). Ignored when `report_id` is supplied. |
| `report_id` | `string` | No | Fetch one specific report by primary key (returns array of 0 or 1). Takes precedence over `ticker`. **Bypasses queue-eligibility filters** (text_status/refine_status) — for force-re-verify; `confirm_status` guard (CONFIRMED exclusion) is still enforced. |

**Query branches:**

- `report_id` supplied: `WHERE id = ? AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')` — skips queue filters intentionally (RF-3).
- `ticker` supplied: standard queue predicate + `AND action_code = ?`.
- Default (no params): standard queue predicate unchanged; excludes data-quality PARTIALs (all units DONE).

**Returns:** `Array<{ id, filename, page_count, text_status, confirm_status, refine_status, windows[] }>` ordered by `parsed_at ASC`.

**Examples:**
```javascript
// Default: oldest pending report
call_tool(server="vn-market", tool="get_bctc_pending_refine", arguments={})

// Capped default
call_tool(server="vn-market", tool="get_bctc_pending_refine", arguments={
  "limit": 5
})

// Ticker filter
call_tool(server="vn-market", tool="get_bctc_pending_refine", arguments={
  "ticker": "CTG"
})

// Direct fetch by report ID (bypasses queue status filters)
call_tool(server="vn-market", tool="get_bctc_pending_refine", arguments={
  "report_id": "c6b17c36-1f4f-48bc-a367-b48afc163ceb"
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
