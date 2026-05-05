---
name: send_telegram
type: tool
package: TODO — assign to appropriate package
related_tools: TODO
complexity: TODO — simple | moderate | complex
---

# send_telegram

Send a message to one of the three Telegram channels. channel='market' → user-facing market alerts/briefings (TELEGRAM_INFO_MARKET_GROUP_ID). channel='work' → dev/analysis status, fix-shipped, agent refresh asks (TELEGRAM_INFO_WORK_CHANNEL_ID). channel='bug' → analysis → dev bug reports (TELEGRAM_REPORT_BUG_CHANNEL_ID); bug messages are persisted in telegram_reports for the Dev Team to process.



## Arguments

- **channel** (enum: "market" | "work" | "bug") — **required**
  - `"market"` → User-facing alerts & briefings (TELEGRAM_INFO_MARKET_GROUP_ID). **EXCLUSIVE**: Only Alert Commander, Digest & Predict, QA Responder can send here. Enforced by policy in alert-policy.md.
  - `"work"` → Dev/analysis status, fix-shipped notices, agent refresh requests (TELEGRAM_INFO_WORK_CHANNEL_ID)
  - `"bug"` → Bug reports from analysis agents, persisted in telegram_reports for Dev Team processing (TELEGRAM_REPORT_BUG_CHANNEL_ID)

- **message** (string) — **required**
  - Content to send (1-4000 characters)
  - Plain text recommended (Markdown can cause parse errors)
  - Include stock codes, prices, risk scores, action required if applicable

## Return Type

`{ success: boolean, message_id?: string, error?: string }`

- `success: true` — message sent
- `message_id` — unique ID if stored (bug channel)
- `error` — reason if failed (rate limit, channel unreachable, etc.)

## Example Usage

### Alert Commander — Market Channel (position-danger alert)
```typescript
const result = await call_tool("vn-market", "send_telegram", {
  channel: "market",
  message: "🔴 POSITION DANGER: ACB\nStop-loss HIT at 26.500 VND\n5-day drop: 7.2% | Sentiment: -0.72\n⚠️ Action: Review stop-loss or exit position\nTime: 2026-05-04 14:35 UTC+7"
});
```

### Digest & Predict — Market Channel (daily briefing)
```typescript
const result = await call_tool("vn-market", "send_telegram", {
  channel: "market",
  message: "📊 MARKET DIGEST — 2026-05-04\nVN-Index: 1,285.5 (+0.8%)\nTop gainer: BID +2.1% | Top loser: MWG -1.5%\nKey event: FX deprecation signal, energy up\n🔗 Full analysis: [link]"
});
```

### Development — Work Channel (fix shipped)
```typescript
const result = await call_tool("vn-market", "send_telegram", {
  channel: "work",
  message: "✅ FIX SHIPPED: 1046b\nIssue: send_telegram rate limiter on MARKET channel\nStatus: Deployed, monitoring alert queue\nQA report: 8/8 tests passing"
});
```

### Bug Report — Bug Channel (analysis feedback)
```typescript
const result = await call_tool("vn-market", "send_telegram", {
  channel: "bug",
  message: "⚠️ BUG REPORT: Financial Analyst\nTool: get_bctc_full\nError: VPS timeout after 30s\nStock: FPT\nTime: 2026-05-04 10:15 UTC\n@ops please check VPS health"
});
```

## When to Use

- **Market channel**: Alerts from Alert Commander, briefings from Digest, answers from QA (policy-enforced)
- **Work channel**: All agents report status/progress; dev team reports fix-shipped, deploy status
- **Bug channel**: Agents report errors or system anomalies; Dev Team consumes for auto-fix loop

## Constraints & Policies

⚠️ **CRITICAL ENFORCEMENT:**
- Only `alert-commander.md`, `digest-predict.md`, `qa-responder.md` can send to `"market"` channel
- Enforced by `alert-policy.md`: section "Alert Commander Exclusivity"
- Other agents sending to market → BUG channel alert
- Rate limit: 10 alerts/day to market (cooldown_minutes: 0 means every trigger fires)

## Related Tools

- `log_agent_work` — Log agent internal processing (not user-facing)
- `post_agent_signal` — Share findings with other agents (signal bus)
- `submit_feedback` — Report improvement suggestions (BUG channel)

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| `rate_limit_exceeded` | Too many messages to market in short time | Queue or suppress low-confidence alerts |
| `channel_unreachable` | Telegram API down | Retry after 60s; log to work channel |
| `invalid_channel` | Typo in channel name | Use enum values: "market" \| "work" \| "bug" |
| `message_too_long` | >4000 characters | Truncate or split into 2 messages |
| `parse_error` | Markdown/special chars break Telegram parser | Use plain text; escape @ symbols |

## Notes

- Messages are persistent in sqlite (telegram_reports table for bug/work channels)
- Market channel messages are visible to user immediately (no persistence layer)
- Each agent can customize message format but should follow team style guide
- Use Vietnamese with diacritics for market channel (required by alert-commander.md)
- Include timestamp (UTC+7) for time-sensitive alerts
- Keep severity emoji consistent: 🔴 (danger), 🟡 (warning), 🟢 (opportunity), 📊 (info)

## Last Updated

Generated: 2026-05-04 (boilerplate)
Enriched: 2026-05-04 (v1 — all args, examples, constraints documented)
