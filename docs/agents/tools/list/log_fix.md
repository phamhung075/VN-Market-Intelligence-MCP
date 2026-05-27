# log_fix

**Category:** Briefings / Changelog

**Module:** `apps/mcp-server/src/interface/mcp/tools/briefings/changelogTools.ts`

## Purpose

Dev Team logs a fix to the system changelog table. Analysis Team checks recent fixes before re-reporting issues, avoiding duplicate work and noisy Report Channel traffic.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `title` | string | Yes | — | Short description of fix (bắt buộc) |
| `detail` | string | No | "" | Detailed explanation of the change (tùy chọn) |
| `fix_type` | string | No | bugfix | Type of fix: 'bugfix', 'hotfix', 'feature', 'docs', 'refactor' |
| `files` | array | No | [] | List of modified file paths (relative) |
| `commit_hash` | string | No | — | Git commit hash (tùy chọn) |
| `related_feedback_id` | number | No | — | ID of related telegram_reports entry (tùy chọn) |
| `supersedes_alert_ids` | array | No | [] | Alert IDs made obsolete by this fix (Task 1005) |

## Return Format

```json
{
  "content": [
    {
      "type": "text",
      "text": "Fix logged successfully (id=42): Signal validation schema update (superseded 3/3 alerts)"
    }
  ]
}
```

**Error:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Lỗi khi ghi sửa lỗi: database constraint violation"
    }
  ]
}
```

## Fix Types

| Type | Purpose | Example |
|------|---------|---------|
| **bugfix** | Regular bug fix | "Fixed cascade rule matching regex" |
| **hotfix** | Urgent critical fix | "SQLite corruption recovery" |
| **feature** | New functionality | "Add recency weighting to RAG search" |
| **docs** | Documentation update | "Update tool documentation" |
| **refactor** | Code restructuring | "Simplify alert filtering logic" |

## Supersedes Alerts (Task 1005)

When `supersedes_alert_ids` provided:
- Each alert in list is marked with `resolution_notes = "Superseded by fix: <title>"`
- Visual indicator: alerts show as resolved, not live
- Report Analyzer sees these and doesn't surface as current issues
- Example: fix cascades rule logic, supersedes 3 old alerts

## Return Format Details

```
Fix logged successfully (id=<auto_id>): <title> [+ supersede summary]
```

Example with supersedes:
```
Fix logged successfully (id=42): Signal validation schema update (superseded 3/3 alerts)
```

## Use Cases

- **Dev Team Cron** logs fix after committing and deploying
- **Analysis Agent** calls `get_recent_fixes(10)` before reporting problem
- **Report Analyzer** sees superseded alerts and skips redundant reporting
- **System auditor** tracks fix history and patterns

## Related Tools

- `get_recent_fixes` — Analysis Team checks before reporting
- `process_telegram_report` → `log_fix` (typical workflow)
- `send_telegram` — announce fix to WORK channel

## Notes

- Title is mandatory; all other fields optional
- fix_type defaults to 'bugfix'
- Files list can be empty; useful for tracking changed modules
- commit_hash optional but recommended for traceability
- related_feedback_id links fix to original bug report
- supersedes_alert_ids prevents duplicate alert surfacing
- Changelog entry immediately queryable (no delay)
- Used by agents as-is before restarting analysis
- Vietnamese error messages; English titles recommended
