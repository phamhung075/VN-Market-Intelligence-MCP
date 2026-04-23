# Telegram Channel Violations Audit — 2026-04-23

**Issue**: Reports being sent to MARKET channel instead of BUG channel.

**Root Cause**: Agent specs had violations allowing non-Alert-Commander agents to send to MARKET.

---

## Violations Found & Fixed

### 1. ❌ Financial Analyst (02-financial-analyst.md)

**Violation**:
- Line 115: `send_telegram(channel="market", message="New BCTC available: {filename}")`
- Line 189: `NEVER send Telegram except new BCTC notification via send_telegram(channel="market")`

**Impact**: BCTC filing notifications were being sent to user group (MARKET) instead of dev team (BUG).

**Fix Applied**:
- ✅ Line 115: Removed direct telegram send. Changed to: "log finding (Alert Commander + digest will pick up via data layer)"
- ✅ Line 189: Updated rule to: "NEVER send Telegram to MARKET — all findings routed via post_agent_signal + submit_feedback. Alert Commander owns MARKET channel exclusively."

---

### 2. ❌ Digest & Predict (06-digest-predict.md)

**Violation**:
- Line 180: `send_telegram(channel="market", message=...)`
- Contradicts Lines 290-291 which state: "Digest & Predict sends digest and /ask-style MCP access does NOT grant MARKET write"

**Impact**: Daily digest was being sent to MARKET channel, violating Alert Commander exclusivity.

**Fix Applied**:
- ✅ Line 180: Removed `send_telegram(channel="market")` call
- ✅ Updated Step 2 instructions: Digest saved via `generate_market_summary()` to database layer. Data flows through DB, not direct telegram.
- ✅ Added note: "Do NOT send directly to MARKET — Alert Commander owns MARKET channel. Digest data flows through database layer."

---

### 3. ❌ System Auditor (system-auditor.md)

**Violation**:
- Line 202: `Use mcp__claude_ai_vn-market-mcp__send_telegram with channel: "report"`

**Impact**: Legacy channel name "report" is no longer valid. Valid channels are: "market", "work", "bug" only.

**Fix Applied**:
- ✅ Line 202: Changed `channel: "report"` → `channel: "bug"`
- ✅ Updated header: "Telegram Report Channel" → "Telegram BUG Channel"
- ✅ Clarified env var: `TELEGRAM_REPORT_BUG_CHANNEL_ID`

---

## Audit Results — All Agents

| Agent | Channel(s) | Status | Notes |
|-------|-----------|--------|-------|
| 01-news-scout | work (errors only) | ✅ OK | Rule: "NEVER send Telegram" — Alert Commander's job |
| 02-financial-analyst | BUG (feedback only) | ✅ FIXED | Removed BCTC→MARKET, enforce signal-based flow |
| 04-market-watcher | work (errors only) | ✅ OK | Only sends heartbeat to work on errors |
| 05-alert-commander | market (alerts) | ✅ OK | Correct — exclusivity rule: owns MARKET channel |
| 06-digest-predict | BUG (feedback only) | ✅ FIXED | Removed digest→MARKET, save to DB layer |
| 07-qa-responder | market (/ask only) | ✅ OK | Documented exception for /ask answer replies |
| system-auditor | bug | ✅ FIXED | Updated legacy "report" → "bug" channel |
| unified-agent | work | ✅ OK | Correct — dev status only. NEVER market except /ask fallback (documented) |
| code-janitor | work | ✅ OK | Reports to work channel only |
| ops | work | ✅ OK | Infrastructure notifications to work |

---

## Architecture Rule (Enforced)

Per CLAUDE.md + alert-policy.md:

```
MARKET channel (user-facing):
  ✅ Alert Commander (05) — alert notifications
  ✅ QA Responder (07) — /ask answer replies
  ❌ ALL other agents forbidden

BUG channel (dev reports):
  ✅ Any analysis agent via submit_feedback()
  ✅ System Auditor via send_telegram(channel="bug")

WORK channel (internal coordination):
  ✅ Unified-agent, code-janitor, dev status, error reports
  ✅ Agent coordination signals, heartbeats
```

---

## Verification Checklist

- [x] Financial Analyst: No BCTC→MARKET sends
- [x] Digest & Predict: No digest→MARKET sends
- [x] System Auditor: Using "bug" channel, not "report"
- [x] All 10 agents audited for channel violations
- [x] Alert Commander exclusivity enforced in specs
- [x] QA Responder documented exception for /ask

---

## Related Code Review (Scheduler Jobs)

**Note**: Scheduler-side jobs (server-side cron, not agent specs) also use `sendTelegramMarket()`:
- `weatherCheckJob.ts` — weather alerts to MARKET
- `taAlertNotifierJob.ts` — technical analysis alerts
- `franceSummaryJob.ts` — morning/evening briefings

These appear to be legitimate uses of MARKET channel (briefing system), but should be cross-checked against the alert policy. Separate audit recommended if changes are needed.

---

**Status**: Agent spec violations fixed. All 10 agent specs now compliant with three-channel architecture.

**Commit**: Ready for review and merge.
