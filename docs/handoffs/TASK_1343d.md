# Task 1343d — VPS Skip Endpoint + fetch-bctc.sh Integration

**Sprint:** 1343 — BCTC PDF Pipeline Recovery

**Owner:** Developer

**Status:** Ready for implementation

**Size:** S (1–1.5h)

---

## Problem Statement

The VPS proxy script `fetch-bctc.sh` runs every 6h to download PDFs for `bctc_vps_queue` items with status='pending'. When a PDF is not found (SKIP event), the script doesn't report back to MCP:

1. `fetch-bctc.sh` processes queue item with `attempts=0`
2. PDF fetch fails (404 or missing on remote server)
3. Script exits without updating MCP
4. `bctc_vps_queue.attempts` stays 0 forever
5. **Next 6h cycle:** same item retried infinitely

**Root Cause:** No feedback channel from VPS back to MCP for SKIP events. Attempts counter doesn't increment.

---

## Solution Design

**1343d-I: Add MCP Endpoint for SKIP Events**

Create new MCP tool: `POST /api/bctc-skip`

```typescript
// src/interface/mcp/tools/financial-reports/bctcSkipTool.ts (new file)

export function registerBctcSkipTool(server: McpServer): void {
  server.tool(
    "bctc_skip_queue_item",
    "Mark a BCTC queue item as SKIPPED (PDF not found). Increments attempts.",
    {
      action_code: {
        type: "string",
        description: "Stock ticker (e.g. 'FPT')"
      },
      period_year: {
        type: "number",
        description: "Financial report year (e.g. 2025)"
      },
      period_quarter: {
        type: "string",
        description: "Quarter: 'Q1', 'Q2', 'Q3', 'Q4'"
      },
      skip_reason: {
        type: "string",
        description: "Reason for skip (e.g. '404 not found', 'malformed URL')"
      }
    },
    async (params: {
      action_code: string;
      period_year: number;
      period_quarter: string;
      skip_reason?: string;
    }) => {
      const db = getDb();
      const { action_code, period_year, period_quarter, skip_reason } = params;

      const result = db
        .prepare(
          `
        UPDATE bctc_vps_queue
        SET status = 'skipped', attempts = attempts + 1, last_attempt = datetime('now')
        WHERE action_code = ? AND period_year = ? AND period_quarter = ?
      `
        )
        .run(action_code, period_year, period_quarter);

      if (result.changes === 0) {
        return {
          success: false,
          message: `Queue item not found: ${action_code} ${period_year} ${period_quarter}`
        };
      }

      return {
        success: true,
        message: `Marked as skipped: ${action_code} ${period_year} ${period_quarter} (reason: ${skip_reason || 'unknown'})`,
        updates: {
          status: 'skipped',
          attempts_incremented: true
        }
      };
    }
  );
}
```

**Register in server startup** (`src/interface/mcp/server.ts`):

```typescript
import { registerBctcSkipTool } from "./tools/financial-reports/bctcSkipTool.js";

export function registerFinancialReportsTools(server: McpServer): void {
  // ... existing tools ...
  registerBctcSkipTool(server);
}
```

---

**1343d-II: Update fetch-bctc.sh on VPS**

Modify VPS script to call skip endpoint when PDF fetch fails:

```bash
#!/bin/bash
# fetch-bctc.sh (update existing script on VPS)

MCP_HOST="${MCP_HOST:-http://127.0.0.1:3000}"

# ... existing PDF fetch logic ...

process_queue_item() {
  local action_code=$1
  local period_year=$2
  local period_quarter=$3
  local source_url=$4

  # Try to fetch PDF from source_url
  pdf_path="/tmp/${action_code}_${period_year}_${period_quarter}.pdf"

  if curl -f -s -o "$pdf_path" "$source_url" 2>/dev/null; then
    # Success: PDF downloaded
    echo "[OK] Fetched: $action_code $period_year $period_quarter"
    # Upload to MCP or local storage
    return 0
  else
    # FAILURE: PDF not found - report SKIP back to MCP
    echo "[SKIP] PDF not found for $action_code $period_year $period_quarter"

    # Call MCP endpoint to mark as skipped
    curl -X POST "$MCP_HOST/api/bctc-skip" \
      -H "Content-Type: application/json" \
      -d "{
        \"action_code\": \"$action_code\",
        \"period_year\": $period_year,
        \"period_quarter\": \"$period_quarter\",
        \"skip_reason\": \"PDF fetch failed (404 or invalid URL)\"
      }" 2>/dev/null

    return 1
  fi
}

# Main loop: fetch all pending items
while IFS='|' read -r action_code period_year period_quarter source_url; do
  process_queue_item "$action_code" "$period_year" "$period_quarter" "$source_url"
done < <(
  sqlite3 /data/market.db \
    "SELECT action_code, period_year, period_quarter, source_url FROM bctc_vps_queue WHERE status='pending' LIMIT 100;"
)
```

---

## Integration Flow

1. **bctcQueueEnricherJob** (1343c) populates `bctc_vps_queue.source_url` with PDF URLs from HOSE discovery
2. **VPS cron** (every 6h) runs updated `fetch-bctc.sh`:
   - Fetches PDFs from `source_url`
   - Success → uploads PDF (existing logic)
   - Failure → calls `POST /api/bctc-skip` to MCP
3. **MCP tool handler** increments `attempts` and sets status='skipped'
4. **Next cycle:** skipped items are not retried (status filter prevents re-processing)

---

## Acceptance Criteria

- [ ] New MCP tool implemented: `bctc_skip_queue_item()`
- [ ] Tool registered in `registerFinancialReportsTools()`
- [ ] Test added: `src/__tests__/1343d-bctc-skip-tool.test.ts`
  - Test 1: Mark queue item as skipped + verify attempts incremented
  - Test 2: Invalid queue item returns error
  - Test 3: Skip reason is logged
- [ ] VPS script updated: `fetch-bctc.sh` calls skip endpoint on PDF fetch failure
- [ ] Integration test: Queue item status transitions `pending` → `skipped` on 404
- [ ] Test baseline: +1 test file (+3 assertions)

---

## Technical Notes

**Endpoint Details:**
- Method: `POST /api/bctc-skip`
- Content-Type: `application/json`
- Body: `{ action_code, period_year, period_quarter, skip_reason? }`
- Response: `{ success: boolean, message: string, updates: {...} }`

**Status Transitions:**
- Normal: `pending` → (PDF fetched) → `completed`
- SKIP: `pending` → (404 or error) → `skipped`, attempts++
- Retry limit: once status='skipped', item no longer matched by `WHERE status='pending'`

**VPS SSH Access:**
- Location of fetch-bctc.sh on Vinahost VPS: (provided by ops)
- Test connectivity before merging: `ssh admin@vps.vinahost.vn 'ls -la /opt/bctc/fetch-bctc.sh'`

---

## Blockers

None. Can be implemented independently.

---

## Next Task

→ 1343e (Integration test + QA verification)
