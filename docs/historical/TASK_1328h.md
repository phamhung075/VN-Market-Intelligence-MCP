---
sprint: 1328
branch: task/1328h-three-channel-strategy
size: M
depends_on: [1328d, 1328f, 1328g]
blocks: [1328i]
---

## TLDR
Implement three-channel Telegram strategy: WORK reports agent status/activity, BUG reports anomalies, MARKET sends user-facing alerts. Each channel has clear purpose. Update all cowork agent files to follow this pattern.

## [PM] Planning Context

### Acceptance Criteria
- [ ] WORK channel receives agent cycle summaries (what each agent did, signals fired/suppressed)
- [ ] BUG channel receives anomalies only (errors, timeouts, deduplication, missing data)
- [ ] MARKET channel receives high-conviction alerts with full conviction breakdown
- [ ] Alert format follows 5-section narrative (Why/Confirms/Kinh/Next/Risk) with complete sentences
- [ ] All cowork agents updated to use three-channel strategy
- [ ] No agent sends to MARKET except Alert Commander (exclusive sender of main alerts)
- [ ] Digest & Predict can send to MARKET (briefings, digests)
- [ ] QA Responder can send to MARKET (/ask answers)

### Files to read first
- `cowork-workspace-team-claude-desktop/05-alert-commander.md` (current messaging pattern)
- `cowork-workspace-team-claude-desktop/06-digest-predict.md` (briefing pattern)
- `cowork-workspace-team-claude-desktop/07-qa-responder.md` (answer pattern)
- `.claude/knowledge/alert-policy.md` (firing rules context)
- `.claude/knowledge/telegram-commands.md` (current channel definitions)

### Files to modify
- `cowork-workspace-team-claude-desktop/01-news-scout.md` — Add WORK status reporting, BUG anomaly reporting
- `cowork-workspace-team-claude-desktop/02-financial-analyst.md` — Add WORK status reporting, BUG anomaly reporting
- `cowork-workspace-team-claude-desktop/04-market-watcher.md` — Add WORK status reporting, BUG anomaly reporting
- `cowork-workspace-team-claude-desktop/05-alert-commander.md` — Update to three-channel pattern + full conviction + risk disclosure
- `cowork-workspace-team-claude-desktop/06-digest-predict.md` — Confirm MARKET briefing + WORK status
- `cowork-workspace-team-claude-desktop/07-qa-responder.md` — Confirm MARKET answer + WORK status
- `cowork-workspace-team-claude-desktop/unified-agent.md` — Confirm WORK coordination messages

### Files to create
- `cowork-workspace-team-claude-desktop/CHANNEL_STRATEGY.md` — Document three-channel pattern for reference

### Dependencies
- 1328d (conviction scorer must complete for MARKET alerts to show breakdown)
- 1328f, 1328g (suppression tracking must exist for WORK status messages)

### Knowledge needed
- Current alert policy (3-AND, 4-AND rules)
- Cowork agent coordination
- Vietnamese message formatting (full diacritics, complete sentences)

---

## [Architect] Brownfield Findings

**Current Messaging Pattern (lines in agent files):**
- Alert Commander: Sends to MARKET when conviction high enough
- Digest Writer: Sends to MARKET (briefings, digests, predictions)
- QA Responder: Sends to MARKET (/ask answers)
- Other agents: No explicit messaging (silent work)

**Issues Found:**
- Only 3 agents send to MARKET. Other agents (News Scout, Financial Analyst, Market Watcher) have no user-facing output
- No agent reports to WORK channel what they're doing (causes "silent system" perception)
- No agent reports anomalies to BUG channel (errors are lost)
- Suppressed signals are silent (users don't know signals were analyzed but failed firing rules)

**Reuse Patterns:**
- Message format template exists in `telegramTools.ts` (lines 15-40)
- Vietnamese formatting functions exist in `textUtils.ts` (diacritics, truncation)
- MCP `send_telegram()` tool already supports channel parameter

**Design Decisions:**
- Layer assignment: All messaging logic stays in interface/mcp (no domain changes)
- Each agent responsible for its own reporting (not centralized)
- Use caveman ultra mode for WORK messages (compact status)
- Use full narrative format for MARKET alerts (complete info)
- BUG channel only for errors/anomalies (dev team can filter)

**Scan Clean:** True ✓ (messaging is interface layer, no DDD violations expected)

---

## Implementation Guide

### Three Channels, Clear Ownership

**WORK Channel (Telegram: TELEGRAM_INFO_WORK_CHANNEL_ID)**
- **What:** Agent activity reports
- **Who sends:** All 7 cowork agents (every cycle)
- **Format:** Caveman ultra mode (compact, 3-5 lines per agent)
- **Content:** Agent name, timestamp, signals analyzed/fired/suppressed, next trigger

Example:
```
[News Scout] 14:35 UTC — 4 signals analyzed
  Fired: 2 (VNM bullish earnings, VCB sentiment)
  Suppressed: 2 (VNH conviction 45%, BID 52%)
  Next run: 14:50 UTC
```

**BUG Channel (Telegram: TELEGRAM_REPORT_BUG_CHANNEL_ID)**
- **What:** Errors, timeouts, deduplication, missing data
- **Who sends:** Any agent that finds problem
- **Format:** Problem type + severity + impact + status
- **Content:** Stack trace (if available), impact assessment, retry plan

Example:
```
[Financial Analyst] ⚠️ BCTC Fetch Error
  Stock: VCB
  Error: congbothongtin.ssc.gov.vn timeout (30s)
  Impact: Conviction delayed 5-10 min
  Status: Retrying (2/3)
```

**MARKET Channel (Telegram: TELEGRAM_INFO_MARKET_GROUP_ID)**
- **What:** User-facing market analysis results
- **Who sends:** Alert Commander (main), Digest & Predict (briefings), QA Responder (answers)
- **Format:** 5-section narrative (Why/Confirms/Kinh/Next/Risk) with full conviction + complete risks
- **Content:** Actionable trading recommendation + reasoning + risks

Example: See TASK_1328h.md [Architect] section below

---

## Agent Updates Required

### 1. News Scout (01-news-scout.md)

**Add after Step 5: Session Log (line ~160):**
```markdown
### Step 5b: Report to WORK Channel (new)

After session ends, send brief status to WORK:
\`\`\`
[News Scout] {TIMESTAMP} UTC — {N} signals analyzed
  Fired: {X} ({catalysts})
  Suppressed: {Y} ({reasons})
  Next: {NEXT_RUN_TIME}
\`\`\`

Example:
\`\`\`
[News Scout] 14:35 UTC — 5 signals analyzed
  Fired: 2 (VNM earnings beat, BSR margin spike)
  Suppressed: 3 (GEX sentiment low, REE macro weak, PVD duplicate)
  Next: 14:50 UTC
\`\`\`

### Step 5c: Report Anomalies to BUG (new)

If error occurs during cycle, report immediately:
\`\`\`
[News Scout] ⚠️ {SEVERITY}
  Issue: {PROBLEM}
  Impact: {WHAT_STOPS_WORKING}
  Status: {RETRYING/BLOCKED}
\`\`\`

Example:
\`\`\`
[News Scout] ⚠️ Network Error
  Issue: VNExpress timeout (45s wait, giving up)
  Impact: Earnings news delayed 10 min
  Status: Retrying next cycle
\`\`\`
```

### 2. Financial Analyst (02-financial-analyst.md)

**Add Step 5b and 5c (same pattern as News Scout)**

### 3. Market Watcher (04-market-watcher.md)

**Add Step 5b and 5c (same pattern as News Scout)**

### 4. Alert Commander (05-alert-commander.md)

**CRITICAL UPDATE: Rewrite Step 4 to use three-channel strategy**

Current (line ~60): "Send Decision"
Replace with:

```markdown
### Step 4: Route Decision to Appropriate Channel

Signals flow to different destinations based on conviction + rules:

#### 4a: MARKET Channel (User-Facing Alerts)

**When to send:** Conviction ≥70% AND firing rule met (3-AND or 4-AND) AND not duplicate

Format: 5-section narrative (complete sentences, no truncation)

\`\`\`
{EMOJI} {CODE} — {ACTION} [{CONVICTION}% xác tín]

WHY?
{Catalyst description, 1-2 sentences}
Tin tức: {News headline or source}

CONFIRMS? {N}/{TOTAL} tín hiệu:
• Giá: {conviction}% — {Full explanation why}
• Khối lượng: {conviction}% — {Full explanation why}
• Tin tức: {conviction}% — {Full explanation why}
• Vĩ mô: {conviction}% — {Full explanation why}
• Ngành: {conviction}% — {Full explanation why}
• Kinh Dich: {conviction}% — {Full explanation why}

KINH DICH:
{Hex name} — {Meaning in Vietnamese}
Thời gian: {Days to reversal} ngày
Hex kế: {Next hexagram}

NEXT?
{Reassessment trigger in complete sentence}
Thời gian: {Days} ngày

RISK:
• {Full risk statement 1 in complete sentence}
• {Full risk statement 2 in complete sentence}
• {Full risk statement 3 in complete sentence}

POSITION:
{Position impact or action recommendation in complete sentence}
\`\`\`

Send via: `send_telegram(channel="market", message=...)`

#### 4b: WORK Channel (Agent Activity Log)

For every cycle, report to WORK:

\`\`\`
[Alert Commander] {TIMESTAMP} UTC — {N} signals reviewed
  Fired: {X} alerts ({conviction} conviction min)
  Suppressed: {Y} ({reasons: conviction low / duplicate / insufficient conditions})
  Next: {NEXT_RUN_TIME}
\`\`\`

Send via: `send_telegram(channel="work", message=...)`

#### 4c: BUG Channel (Errors Only)

If error occurs, report immediately:

\`\`\`
[Alert Commander] ⚠️ {SEVERITY}
  Issue: {Error description}
  Impact: {Which signals blocked}
  Status: {Retrying / Blocking}
\`\`\`

Send via: `send_telegram(channel="bug", message=...)`
```

### 5. Digest & Predict (06-digest-predict.md)

**No major changes, but confirm:**
- Line ~70: Briefing/digest sends to MARKET (already done)
- Add WORK status reporting (same as Alert Commander 4b pattern)
- Can send to MARKET because role is specifically "digest & predict" (exception to Alert Commander exclusivity)

### 6. QA Responder (07-qa-responder.md)

**No major changes, but confirm:**
- Line ~80: Answer sends to MARKET (already done)
- Add WORK status reporting (same pattern)
- Can send to MARKET because role is specifically answering /ask queue (exception to Alert Commander exclusivity)

### 7. Unified Agent (unified-agent.md)

**Add messaging for coordination:**
- WORK: "Unified coordinator cycle started — running quality review"
- WORK: "Unified coordinator complete — X alerts verified, Y suppressed"

---

## New File: CHANNEL_STRATEGY.md

Create `cowork-workspace-team-claude-desktop/CHANNEL_STRATEGY.md`:

```markdown
# Three-Channel Telegram Strategy for Cowork Agents

## Channels Overview

### WORK Channel (agents ↔ dev team)
**Purpose:** Agent activity logs, status reports, coordination
**Audience:** Development team only
**Frequency:** Every agent cycle (15 min market / 60 min off-hours)

Format (caveman mode):
\`\`\`
[Agent Name] HH:MM UTC — {N} signals analyzed
  Fired: {X} ({conviction}% min)
  Suppressed: {Y} ({reason})
  Next: HH:MM UTC
\`\`\`

### BUG Channel (agents → dev team)
**Purpose:** Errors, anomalies, timeouts, missing data
**Audience:** Development team only
**Frequency:** Whenever problem detected

Format:
\`\`\`
[Agent Name] ⚠️ {SEVERITY}
  Issue: {Problem description}
  Impact: {What stops working}
  Status: {Retrying/Blocked}
\`\`\`

### MARKET Channel (agents → users)
**Purpose:** Market analysis results, alerts, briefings, answers
**Audience:** Users making trading decisions
**Frequency:** When conviction high OR daily briefing time

Format (full narrative, complete sentences):
\`\`\`
{EMOJI} {CODE} — {ACTION} [{CONVICTION}% xác tín]

WHY? {2-sentence catalyst + news source}

CONFIRMS? {N}/{TOTAL} signals aligned with full explanations

KINH DICH: {Hex name + meaning + timing + next hex}

NEXT? {Complete reassessment trigger in 1-2 sentences + timing}

RISK: {3 complete risk statements, no truncation}

POSITION: {Action recommendation or impact}
\`\`\`

## Agent Sending Rights

- **Alert Commander:** MARKET (main alerts), WORK (status), BUG (errors)
- **Digest & Predict:** MARKET (briefings), WORK (status), BUG (errors)
- **QA Responder:** MARKET (answers), WORK (status), BUG (errors)
- **News Scout:** WORK (status), BUG (errors) — NO MARKET (analysis incomplete)
- **Financial Analyst:** WORK (status), BUG (errors) — NO MARKET
- **Market Watcher:** WORK (status), BUG (errors) — NO MARKET
- **Unified Agent:** WORK (coordination) only

## Message Quality Standards

### MARKET Messages (User-Facing)
- ✅ Full conviction breakdown (all 6 dimensions with explanations)
- ✅ Complete risk disclosure (no ellipsis, no truncation)
- ✅ 5-section narrative format (Why/Confirms/Kinh/Next/Risk)
- ✅ Proper Vietnamese with full diacritics (normalized to NFC)
- ✅ No abbreviations that hide information

### WORK Messages (Agent Status)
- ✅ Caveman ultra mode (compact, 3-5 lines per agent)
- ✅ Clear metrics (count of signals fired/suppressed)
- ✅ Next run time
- ✅ Reason for suppressions if any

### BUG Messages (Problem Reports)
- ✅ Severity level (⚠️ warning, 🔴 critical)
- ✅ Clear description of problem
- ✅ Impact on analysis
- ✅ Current status (retrying, blocked, investigating)

## Examples

### Market Alert (MARKET Channel)
See full example in task 1328h handoff section.

### Agent Status (WORK Channel)
\`\`\`
[News Scout] 14:35 UTC — 5 signals analyzed
  Fired: 2 (VNM earnings 80%, BSR margin 75%)
  Suppressed: 3 (GEX conviction 48%, REE macro 52%, PVD duplicate)
  Next: 14:50 UTC
\`\`\`

### Error Report (BUG Channel)
\`\`\`
[Financial Analyst] ⚠️ Network Error
  Issue: BCTC portal timeout (45s, giving up)
  Impact: Conviction delayed for VNM, VCB, BID (BCTC unavailable)
  Status: Retrying next cycle (14:50 UTC)
\`\`\`
```

---

## Verification

✅ All 7 agents configured for three-channel strategy
✅ MARKET alerts use 5-section narrative format
✅ Full conviction breakdown shown in all MARKET messages
✅ Complete risk disclosure (no ellipsis)
✅ WORK messages sent every cycle (status tracking)
✅ BUG messages for any anomalies (error visibility)
✅ Alert Commander remains exclusive MARKET sender for main alerts
✅ Exception agents (Digest, QA) can send to MARKET per their role
✅ No agent sends to MARKET without full information
