# process_telegram_report

**Category:** Briefings / Bug Reports

**Module:** `apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts`

## Purpose

Mark a telegram report as processed (fixed) and optionally delete the Telegram message. Part of the Dev Team autonomous loop. Closes out bug reports after dev fixes are shipped.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `id` | number | Yes | — | Report ID to mark processed |
| `delete_message` | boolean | No | true | Delete associated Telegram message from BUG channel |

## Return Format

```json
{
  "content": [
    {
      "type": "text",
      "text": "Report 1 marked as processed. Telegram message deleted."
    }
  ]
}
```

**Message Deletion Failed:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Report 1 marked as processed. WARNING: Failed to delete Telegram message 98765 (may be already deleted)."
    }
  ]
}
```

**Not Found:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Error processing report 1: Report not found."
    }
  ]
}
```

## Status Flow

```
new (unclaimed)
    ↓
claimed (in progress)
    ↓
processed (complete + deleted from Telegram)
```

## Use Cases

- **Dev Team** calls after fix is shipped: `process_telegram_report(id=1)`
- Automatically deletes report from Telegram to clean up BUG channel
- Archives report in database for audit trail
- Signals analysis agents that issue is resolved

## Message Deletion

- When `delete_message=true` (default), calls Telegram API to delete message
- If message already deleted (e.g., manually removed), returns warning but succeeds
- If Telegram API fails (network error, bot permission), returns warning
- Report still marked processed even if message deletion fails

## Related Tools

- `read_telegram_reports` — find reports to process
- `claim_telegram_report` — mark as in progress
- `log_fix` — dev logs fix to system changelog (call after processing report)
- `send_telegram` — agents post bugs to BUG channel

## Notes

- Status changed from "new"/"claimed" to "processed" in database
- Telegram message (if exists) deleted from BUG channel
- Idempotent: calling multiple times on same ID is safe (message already deleted)
- Audit trail preserved: report row kept in database with status="processed"
- Timestamp recorded: when report was marked processed
- Plain text confirmation response
