# review_market_message

**Category:** Briefings / Message Quality

**Module:** `apps/mcp-server/src/interface/mcp/tools/briefings/marketMessageTools.ts`

## Purpose

Label a MARKET channel message as signal or noise. QA team uses this to classify unreviewed messages, feeding quality metrics and filtering logic for the message distribution system.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `id` | number | Yes | — | Row ID of message to review (from `get_unreviewed_market_messages`) |
| `verdict` | enum | Yes | — | Classification: 'signal' (keep and distribute) or 'noise' (discard) |
| `note` | string | No | — | Optional free-text note explaining verdict (max 500 chars) |

## Return Format

```json
{
  "content": [
    {
      "type": "text",
      "text": "Message 1234 labelled as 'signal'. Note saved."
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
      "text": "Message 1234 not found."
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
      "text": "Error reviewing message 1234: database constraint violation"
    }
  ]
}
```

## Verdict Types

| Verdict | Meaning | Action |
|---------|---------|--------|
| **signal** | Valid market insight; distribute to users | Mark reviewed; include in briefings |
| **noise** | False positive, spam, or low-value | Mark reviewed; exclude from distribution |

## Quality Metrics

Based on reviewer verdicts:
- **Signal rate** = signal / (signal + noise)
- **Noise rate** = noise / (signal + noise)
- **Reviewer agreement** = consistency across multiple reviewers
- Used for agent calibration and message filter tuning

## Use Cases

- **QA Responder** reviews daily batch of unreviewed messages
- **Market Analyst** marks false alerts as noise for feedback to alert engine
- **Content Manager** maintains message quality standards
- **System auditor** tracks verdict patterns to identify agent drift

## Related Tools

- `get_unreviewed_market_messages` — list messages awaiting review
- `get_market_message_digest` — grouped view of unreviewed messages
- `batch_review_market_messages` — label multiple messages in one call

## Notes

- verdict is mandatory; note is optional
- Note field trimmed to 500 characters
- Verdict recorded with reviewer identity (audit trail)
- Marks message as reviewed (verdict != NULL)
- Can be called multiple times for same ID (overwrites prior verdict)
- Error messages in English for debugging
- Updates `verdict` and `note` columns in `market_messages` table
- Returns confirmation text in plain Vietnamese/English
