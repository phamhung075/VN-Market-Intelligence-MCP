# read_telegram_reports

**Category:** Briefings / Bug Reports

**Module:** `apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts`

## Purpose

Read bug reports from the BUG Telegram channel. Part of the Dev Team autonomous loop. Returns unprocessed reports by default; analysis agents call this before reporting new bugs to avoid duplicates.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `status` | enum | No | new | Report status filter: 'new', 'processed', or 'all' |
| `limit` | number | No | 20 | Max reports to return (1-50) |
| `unclaimed_only` | boolean | No | true | If true, skip reports already claimed by another agent |

## Return Format

```json
[
  {
    "id": 1,
    "message_id": 98765,
    "text": "Signal validation failing: invalid schema for chain_catalyst signals",
    "from_agent": "alert-commander",
    "priority": "high",
    "status": "new",
    "created_at": "2026-05-05T14:30:00Z"
  },
  {
    "id": 2,
    "message_id": 98766,
    "text": "RAG search returning empty results for 'oil prices' queries",
    "from_agent": "report-analyzer",
    "priority": "medium",
    "status": "new",
    "created_at": "2026-05-05T12:15:00Z"
  }
]
```

**Dev Team Exit Signal (status=new, no unclaimed reports):**
```
Không có báo cáo mới. Vòng lặp kết thúc.
```

## Report Fields

| Field | Type | Definition |
|-------|------|-----------|
| **id** | number | Internal report ID (primary key) |
| **message_id** | number | Telegram message ID (for deletion) |
| **text** | string | Bug description from analysis agent |
| **from_agent** | string | Name of reporting agent |
| **priority** | string | low, medium, high, critical |
| **status** | string | new (unclaimed), claimed (in progress), processed (fixed) |
| **created_at** | ISO string | When bug was reported |

## Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| **new** | Unclaimed; waiting for dev team | Dev picks up and starts work |
| **claimed** | Dev team working on it | Dev continues investigation/fix |
| **processed** | Fixed; message deleted from Telegram | Report archived |

## Use Cases

- **Dev Team Cron** calls `read_telegram_reports()` at cycle start → picks up new bugs
- **Dev Team** calls `claim_telegram_report()` to mark as claimed (prevents duplicate work)
- **Dev Team** calls `process_telegram_report()` after fix → deletes Telegram message
- **Analysis Agent** calls before reporting → checks if bug already known

## Filter Examples

| Call | Result |
|------|--------|
| `read_telegram_reports(status="new")` | New, unclaimed reports (typical use) |
| `read_telegram_reports(status="new", unclaimed_only=false)` | All new reports including claimed |
| `read_telegram_reports(status="all")` | All reports (new + claimed + processed) |
| `read_telegram_reports(status="processed", limit=10)` | Recently fixed bugs (audit trail) |

## Related Tools

- `claim_telegram_report` — mark report as claimed (in progress)
- `process_telegram_report` — mark report as processed + delete Telegram message
- `send_telegram` — agents send bugs to BUG channel
- `log_fix` — dev team logs fix to changelog

## Notes

- Default returns NEW + UNCLAIMED (typical Dev Team workflow)
- `unclaimed_only=true` filters out reports already claimed by another agent (prevents double-work)
- Exit signal "Không có báo cáo mới" triggers Dev Team loop termination
- Status values: new → claimed → processed (one-way flow)
- JSON array format (empty array = no matching reports)
- Order by created_at DESC (newest first)
- Max 50 reports per call for performance
