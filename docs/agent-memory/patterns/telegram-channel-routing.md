# Pattern: Telegram Channel Routing Violation

**First observed**: 2026-04-24
**Triggered by**: news-scout sending ops diagnostic to MARKET channel

---

## The Pattern

An analysis agent calls `send_telegram(channel="market")` for a system/ops/diagnostic message instead of routing it to WORK or BUG. This violates Alert Commander exclusivity.

## Root Cause

Agent prompts that say "NEVER send Telegram — Alert Commander does that" are too vague. Agents interpret the rule as "don't send market alerts" — not "never call send_telegram(channel='market') at all." When a new situation arises (e.g., VPS stale data detected in Step 5), the agent has no explicit routing table and improvises.

## Canonical Routing Table (enforce in all analysis agents)

| Message type | Correct action |
|---|---|
| VPS service stopped / pipeline stale | `send_telegram(channel="work")` + `submit_feedback` |
| Source fetch error / rate limit breach | `submit_feedback` only (BUG channel) |
| Bootstrap failure | `send_telegram(channel="work")` + `submit_feedback` + STOP |
| Any ops/system/diagnostic | `channel="work"` ONLY |
| Market alert (price, news impact) | `post_agent_signal` to alert-commander — NEVER send_telegram directly |
| `channel="market"` | Alert Commander (05), Digest Writer (06), QA Responder (07) ONLY |

## Prevention Checklist

When writing or reviewing an analysis agent prompt (01/02/04):

- [ ] RULES section: does it say `NEVER call send_telegram(channel="market")`? (not just "never send Telegram")
- [ ] Every step that calls `get_system_status` or `get_vps_service_health`: does it have an explicit routing table?
- [ ] No step creates freeform Telegram messages without a channel= constraint
- [ ] QA string-search: `grep 'channel="market"'` in agent file must return zero hits

## Fix Procedure

1. In the RULES section: replace vague "NEVER send Telegram" with `NEVER call send_telegram(channel="market")`
2. In the system health step: add explicit routing table (see `01-news-scout.md` Step 5 as reference)
3. Run: `grep -n 'channel="market"' .claude/agents/0{1,2,4}-*.md` — must return zero hits

## Affected Agents (verified 2026-04-24)

| Agent | Gap | Fix applied |
|---|---|---|
| `01-news-scout.md` | Step 5 no routing rule; RULES vague | YES |
| `04-market-watcher.md` | Step 0-c summary ambiguous | YES |
| `02-financial-analyst.md` | Step 5 clean (submit_feedback only) | N/A |
| `05-alert-commander.md` | Correct owner of channel="market" | N/A |
