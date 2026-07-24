# get_bctc_pending_refine

**Purpose:** List BCTC financial reports pending agentic refine processing, with pre-partitioned windows.

Default behavior: returns oldest reports in queue (text_status='COMPLETE', refine_status IN ('PENDING','PARTIAL','FAILED'), confirm_status != 'CONFIRMED'). Optional parameters allow targeted fetch by ticker or exact report ID.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | `number` | No | Max reports per page (1–100, **default 20**). Ignored when `report_id` is supplied. |
| `offset` | `number` | No | Row offset for pagination (default 0). Ignored when `report_id` is supplied. |
| `ticker` | `string` | No | Filter by ticker symbol (`action_code`). Ignored when `report_id` is supplied. |
| `report_id` | `string` | No | Fetch one specific report by primary key (returns array of 0 or 1). Takes precedence over `ticker`. **Bypasses queue-eligibility filters** (text_status/refine_status) — for force-re-verify; `confirm_status` guard (CONFIRMED exclusion) is still enforced. |

**Query branches:**

- `report_id` supplied: `WHERE id = ? AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')` — skips queue filters intentionally (RF-3).
- `ticker` supplied: standard queue predicate + `AND action_code = ?` + `LIMIT ? OFFSET ?`.
- Default (no params): standard queue predicate unchanged; excludes data-quality PARTIALs (all units DONE); `LIMIT ? OFFSET ?`.

**Pagination (FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW):** `limit` defaults to 20 (max 100) so the inline JSON payload never overflows the MCP inline response limit — an omitted `limit` previously meant NO SQL LIMIT clause at all, and an unbounded row set (each with a pre-partitioned `windows[]`) is what produced a 235K-char payload that the bridge spilled to a file path instead of returning data. To page through **every** pending-refine row (no data lost vs. the old unbounded dump): call with `offset=0`, then `offset += limit` on each subsequent call, until a call returns **fewer than `limit`** rows — that page is the last one.

**Returns:** `Array<{ id, filename, page_count, text_status, confirm_status, refine_status, windows[] }>` ordered by `parsed_at ASC`.

**Examples:**
```javascript
// Default: first page (20 oldest pending reports)
call_tool(server="vn-market", tool="get_bctc_pending_refine", arguments={})

// Explicit small page (fleet-cron single-report pattern)
call_tool(server="vn-market", tool="get_bctc_pending_refine", arguments={
  "limit": 1
})

// Page 2 (rows 21-40)
call_tool(server="vn-market", tool="get_bctc_pending_refine", arguments={
  "limit": 20,
  "offset": 20
})

// Ticker filter (also paginated)
call_tool(server="vn-market", tool="get_bctc_pending_refine", arguments={
  "ticker": "CTG"
})

// Direct fetch by report ID (bypasses queue status filters AND pagination)
call_tool(server="vn-market", tool="get_bctc_pending_refine", arguments={
  "report_id": "c6b17c36-1f4f-48bc-a367-b48afc163ceb"
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
