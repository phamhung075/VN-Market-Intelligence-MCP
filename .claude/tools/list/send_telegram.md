# send_telegram

**Category:** Briefings / Communication

**Module:** `apps/mcp-server/src/interface/mcp/tools/briefings/telegramTools.ts`

## Purpose

Send a message to one of three Telegram channels for different communication purposes. Unified endpoint with channel discriminator to route alerts, work status, and bug reports to appropriate teams.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `channel` | enum | Yes | — | Target channel: 'market' (user alerts), 'work' (dev/analysis status), 'bug' (dev bug reports) |
| `message` | string | Yes | — | The message text to send (1-4000 chars, plain text recommended) |

## Channels

| Channel | Env Var | Audience | Purpose |
|---------|---------|----------|---------|
| **market** | TELEGRAM_INFO_MARKET_GROUP_ID | Trading team / users | Market alerts, briefings, signals |
| **work** | TELEGRAM_INFO_WORK_CHANNEL_ID | Dev + analysis team | Task status, fix shipped, agent refresh asks |
| **bug** | TELEGRAM_REPORT_BUG_CHANNEL_ID | Dev team | Bug reports from analysis agents |

## Return Format

```json
{
  "content": [
    {
      "type": "text",
      "text": "Message sent to MARKET channel."
    }
  ]
}
```

**Bug Channel Success:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Message sent to BUG channel. message_id: 12345"
    }
  ]
}
```

**Duplicate Bug Report (suppressed):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "BUG report suppressed — duplicate category already open within 4h. No action needed."
    }
  ]
}
```

**Blocked from MARKET (diagnostic content):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Diagnostic content blocked from MARKET channel. Use channel='work' for pipeline/VPS status messages."
    }
  ]
}
```

## Message Guidelines

### MARKET Channel

- User-facing market alerts and briefings
- Plain text, Vietnamese format
- No Markdown or emojis
- No pipeline diagnostics or system notifications
- Blocked patterns: "pipeline issue", "service stopped", "VPS error", "stale market"

### WORK Channel

- Dev/analysis team status updates
- Task completion announcements
- Agent refresh requests
- Pipeline diagnostics (allowed here, not in MARKET)
- Service health notifications

### BUG Channel

- Analysis team bug reports for dev team
- Structured problem descriptions
- Severity indicators
- Automatically persisted to `telegram_reports` table
- Duplicate detection: suppresses if same category open <4h

## Persistence

- **BUG messages**: Always persisted to `telegram_reports` table with status='new'
- **MARKET messages**: Optionally persisted with `persist: { from_agent, message_type }` param (internal)
- **WORK messages**: Not persisted (ephemeral status updates)

## Use Cases

- **Market Watcher** sends alerts to MARKET channel when >2σ price moves
- **News Scout** posts urgent news signals to MARKET
- **Dev Team Cron** posts fix completion to WORK channel
- **Alert Commander** sends critical risk warnings to MARKET
- **Report Analyzer** sends bugs to BUG channel
- **System auditor** sends diagnostics to WORK channel

## Related Tools

- `read_telegram_reports` — read bug reports from BUG channel
- `process_telegram_report` — mark bug as processed
- `send_alert_digest` — send formatted alert summaries

## Notes

- Plain text only; Markdown parsing disabled (`parseMode=""`)
- Max message length 4000 characters
- MARKET channel has diagnostic spam guard (blocks pipeline/VPS messages)
- BUG channel auto-deduplicates within 4-hour window
- Failed sends return env var name for troubleshooting
- Message text trimmed to 4000 chars if exceeded
- No emojis in any channel (system requirement)
