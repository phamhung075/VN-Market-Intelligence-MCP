# claim_telegram_report

**Category:** Briefings / Bug Reports

**Module:** `apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts`

## Purpose

Mark a telegram report as claimed (in progress). Part of the Dev Team autonomous loop. Prevents duplicate work when multiple agents are processing reports concurrently.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `id` | number | Yes | — | Report ID to claim |

## Return Format

```json
{
  "content": [
    {
      "type": "text",
      "text": "Report 1 claimed successfully."
    }
  ]
}
```

**Already Claimed:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Report 1 already claimed by developer"
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
      "text": "Report 1 not found."
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

- **Dev Team Cron** calls `claim_telegram_report(1)` after picking up new bug
- Prevents race condition: 2+ devs working on same bug simultaneously
- Audit trail: shows which developer claimed which report

## Related Tools

- `read_telegram_reports` — find new unclaimed reports
- `process_telegram_report` — mark as processed + delete Telegram message
- `send_telegram` — agents post bugs to BUG channel

## Notes

- Idempotent: calling multiple times on same ID is safe
- Claim doesn't expire; must explicitly `process_telegram_report` to complete
- Status stored in `telegram_reports` table (claimed_by, claimed_at)
- Call before fixing to prevent concurrent work on same bug
