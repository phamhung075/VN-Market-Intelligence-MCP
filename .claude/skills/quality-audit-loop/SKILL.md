---
name: quality-audit-loop
description: Weekly quality audit — review messages, track agent accuracy, improve signals
type: reusable-skill
usage: Unified Coordinator (unified-agent.md)
---

# Quality Audit Loop Skill

**Purpose:** Feedback loop to improve agent signal quality over time.

## Input (Triggered Daily/Weekly)

```
{
  period: "daily",  // or "weekly"
  since_days: 7,
  review_focus: "accuracy"  // or "message_quality", "all"
}
```

## Process

### Step 1: Collect Unreviewed MARKET Messages
```
Call: get_unreviewed_market_messages(limit=50)
Returns: all MARKET messages since last review, grouped by date/agent

Example output:
- 2026-04-23 (5 messages):
  - Alert Commander: "🔴 VCB — SELL [80%]..."
  - Digest & Predict: "Weekly summary: ROE down..."
  - News Scout: "Urgent: Tax audit..."
- 2026-04-22 (3 messages):
  - Market Watcher: "Price anomaly HPG..."
```

### Step 2: Label Each Message (signal or noise)
```
For each message:
  1. Read content + context (stock, action, conviction)
  2. Assess: "Did this message provide useful insight?"
  3. Label: review_market_message(id, verdict="signal" or "noise")

Criteria for 'signal':
✓ Conviction >= 70%
✓ Evidence provided (Why/Confirms/Kinh sections)
✓ Actionable (user knows what to do)
✓ Not redundant (didn't repeat yesterday's message)

Criteria for 'noise':
✗ Conviction < 50%
✗ No evidence trail
✗ Generic (could apply to any stock)
✗ Contradicted within 24h

Example:
- Message: "🔴 VCB — SELL [80%] Tax audit + ROE down..."
  → Label: SIGNAL (clear evidence, high conviction, actionable)

- Message: "FPT up 1.5% today"
  → Label: NOISE (no context, no conviction, not actionable)
```

### Step 3: Compute Agent Accuracy Report
```
Call: get_label_accuracy_report(since_days=7)
Returns: per-agent signal/noise ratio

Example:
Agent | Signal % | Noise % | Total | Hit Rate |
-----|----------|---------|-------|----------|
Alert Commander | 88% | 12% | 42 | 88% (35 signal, 7 noise)
Digest & Predict | 72% | 28% | 25 | 72% (18 signal, 7 noise)
News Scout | 65% | 35% | 20 | 65% (13 signal, 7 noise)
QA Responder | 95% | 5% | 19 | 95% (18 signal, 1 noise)

Insight: Alert Commander is performing well. News Scout has 35% noise rate — needs improvement.
```

### Step 4: Identify Patterns (What Worked? What Failed?)
```
Analysis:
1. Alert Commander (88% signal):
   - ✓ Pre-fire validation working (few false positives)
   - ✓ Conviction threshold appropriate
   - Continue: narrative_formatter + pre_fire_validation

2. News Scout (65% signal):
   - ✗ 35% noise rate = too many weak signals
   - ✗ Impact chain analysis may be too sensitive
   - Fix: Raise urgency threshold to >= 8 (currently 7)
   - Fix: Add signal_intelligence check (policy/broker validation missing)

3. QA Responder (95% signal):
   - ✓ Excellent, but low volume (19 messages)
   - Continue as-is

Recommendation:
- ESCALATE Alert Commander (increase max alerts/day from 10 → 15?)
- TUNE News Scout (raise urgency to >= 8, add signal_intelligence)
```

### Step 5: Generate Weekly Improvement Report
```
Send to WORK channel:

Subject: Weekly Signal Quality Report — Week 04/23
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AGENT ACCURACY (last 7 days):
  Alert Commander: 88% signal (35/42) ✓ Excellent
  QA Responder:    95% signal (18/19) ✓ Excellent
  Digest & Predict: 72% signal (18/25) ~ Good
  News Scout:      65% signal (13/20) ⚠ Needs tuning

ALERTS FIRED:
  Total: 42 (Alert Cmd) + 25 (Digest) + 20 (News) + 19 (QA) = 106
  Labeled signal: 88 (83% of total)
  Labeled noise: 18 (17% of total)

IMPROVEMENTS:
  ✓ Alert Commander pre-fire validation reducing false positives
  ⚠ News Scout urgency threshold too low (7 → recommend 8)
  ⚠ Signal intelligence validation missing from News Scout

NEXT WEEK:
  → Tune News Scout: urgency >= 8 + add signal_intelligence skill
  → Monitor: Digest & Predict (72% — watch for weak signals)
  → Keep: Alert Commander + QA Responder (excellent)

Wireframe: 83% signal rate. Target: 85%+ by end of month.
```

## Output

```
{
  period: "weekly",
  report_date: "2026-04-23",

  agent_stats: {
    "alert-commander": { signal_pct: 88, noise_pct: 12, total: 42, trend: "↑ +3%" },
    "digest-predict": { signal_pct: 72, noise_pct: 28, total: 25, trend: "→ flat" },
    "news-scout": { signal_pct: 65, noise_pct: 35, total: 20, trend: "↓ -5%" },
    "qa-responder": { signal_pct: 95, noise_pct: 5, total: 19, trend: "↑ +2%" }
  },

  total_signals_reviewed: 106,
  total_signal_labeled: 88,
  total_noise_labeled: 18,
  overall_signal_rate: 0.83,

  findings: [
    "Alert Commander: pre-fire validation effective",
    "News Scout: 35% noise rate driven by low urgency threshold",
    "Digest: moderate performance, monitor for weak signals"
  ],

  recommendations: [
    "Tune News Scout urgency to >= 8 (currently 7)",
    "Add signal_intelligence validation to News Scout",
    "Monitor Digest & Predict for quality trend",
    "Consider increasing Alert Commander max alerts/day"
  ],

  actions_taken: [
    "Sent feedback to WORK channel",
    "Logged findings in docs/agent-memory/quality-trends.md"
  ]
}
```

## Usage In Agent

### **Unified Coordinator** (Weekly cycle, Sunday 20:00 VN)
```python
# Step 1: Collect messages from past 7 days
unreviewed = get_unreviewed_market_messages(limit=100)

# Step 2: Review each message
for msg in unreviewed:
    verdict = determine_signal_or_noise(msg.content, msg.conviction)
    review_market_message(msg.id, verdict=verdict)

# Step 3: Generate accuracy report
accuracy_report = quality_audit_loop(period="weekly", since_days=7)

# Step 4: Send report to WORK channel
send_telegram(channel="work", message=accuracy_report.formatted_report)

# Step 5: If problems detected, post actionable feedback
if accuracy_report.needs_agent_tuning:
    submit_feedback(
        agent="all",
        category="signal_quality",
        title=f"Weekly audit: {accuracy_report.findings}",
        priority="high"
    )
```

## Rules

1. **Review all messages** — Don't skip; completeness drives feedback accuracy
2. **Label objectively** — 'Signal' if user could act on it; 'Noise' if generic/weak
3. **Report weekly** — Consistency allows trend detection
4. **Act on patterns** — If agent consistently ~70%, tune thresholds
5. **Celebrate wins** — Alert Commander 88% → let team know what's working
6. **Close feedback loop** — Submit tuning recommendations via `submit_feedback()`

## Quality Audit Checklist

- [ ] All unreviewed MARKET messages reviewed (since last audit)
- [ ] Each message labeled signal or noise with reasoning
- [ ] Accuracy report generated (per-agent statistics)
- [ ] Trends identified (improving? declining?)
- [ ] Recommendations actionable (specific thresholds, skill additions)
- [ ] Report sent to WORK channel (visibility for team)
- [ ] Feedback submitted for agent tuning (if needed)

---

**Integration:**
- Add to: unified-agent.md (weekly cycle, Step 5: Quality Review)
- Replaces: Ad-hoc message quality checks
- Saves tokens: ~100 per week (structured review process)
- Impact: Continuous improvement loop (signals → feedback → agent tuning → better signals)
