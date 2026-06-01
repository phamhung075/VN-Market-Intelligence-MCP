<!-- size-justification: 131L — atomic market-group audit flow; step table + SSOT signal classification table cannot decompose cleanly without breaking step references. -->
# PO — Market Group Analysis Flow

**Tools:** `docs/agents/tools/package/po.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input
Telegram MARKET channel unreviewed messages + server live data

## Output
Quality/anomaly tasks in `docs/data/orch/orch-state.json` `.task_board` | ops handoff if VPS validation needed | messages reviewed

---

## Step 1: Fetch Unreviewed Messages

```
get_unreviewed_market_messages()
get_market_message_digest()
```

Empty → EXIT immediately.

---

## Step 2: Cross-Validate with Server Data

Pull server state to compare against what was sent to users:
```
get_market_snapshot()
get_pipeline_health()
get_system_status()
get_alert_accuracy()
get_signal_effectiveness()
```

---

## Step 3: Classify Each Message Cluster

For each unreviewed message (or cluster by ticker/topic):

### 3a. Data Anomaly (wrong price, stale data, impossible value)
- Server data conflicts with message content?
- Price deviation >5% vs snapshot?
- Timestamp lag >30min vs pipeline health?
→ Collect ticker + service for **VPS validation** (Step 4)

### 3b. System Bug (duplicate alerts, missing alerts, wrong format)
- Same alert fired twice?
- Alert fired but condition not met per snapshot?
- Message format broken/truncated?
→ Append to `.task_board.backlog[]` (atomic write):
```json
{"id": "TASK-NNN", "summary": "[BUG] <description> — market-group", "priority": "high"}
```

### 3c. Signal Quality (noisy, low conviction, unhelpful)
- Alert fired but price moved <0.3%?
- Signal not confirmed by any chain?
- User would ignore this → UX friction
→ Append to `.task_board.backlog[]`:
```json
{"id": "TASK-NNN", "summary": "[QUALITY] Improve signal threshold for <type> — market-group", "priority": "normal"}
```

### 3d. UX Improvement (presentation, wording, structure)
- Message unclear, too long, missing context?
- Format inconsistent across alert types?
→ Append to `.task_board.backlog[]`:
```json
{"id": "TASK-NNN", "summary": "[UX] <description> — market-group", "priority": "normal"}
```

---

## Step 4: VPS Validation Handoff (if anomalies found)

If Step 3a produced tickers/services needing validation:

```
## RETURN
DONE: Market group analysis — N messages reviewed, anomalies found for [tickers/services]
NEXT: ops | run data-validation flow — check VPS data freshness for: [ticker list] | services: [price|news|foreign-flow]
HANDOFF: inline
PIPELINE: continue
```

Main terminal spawns `ops` with `docs/agents/ops/flow/data-validation.md`.
After ops returns findings → main terminal re-spawns `po/market-group.md` Step 5 with ops report.

---

## Step 5: Task Creation from Ops Findings (after ops returns)

Read ops validation report. For each confirmed data issue, append to `.task_board.backlog[]`:
```json
{"id": "TASK-NNN", "summary": "[DATA] <ticker>: <stale|missing|wrong> data from <service> — ops-finding", "priority": "high"}
```
Recurrent data issue (same service, same ticker in last 7d) → set summary prefix `[ARCH REVIEW]`.

---

## Step 6: Mark Messages Reviewed

```
batch_review_market_messages(ids=[...all processed IDs...])
```

---

## Step 7: Summary

```
send_telegram(channel="work", message="[PO] Market group review: N messages | K tasks created (bugs:X quality:Y ux:Z data:W) | ops-validated: V tickers")
```

---

## Return (final)

```
## RETURN
DONE: Market group analysis complete — N tasks created from message quality review
NEXT: [continue pipeline or idle]
PIPELINE: continue | complete
```

**Notebook write** → `docs/agent-memory/notebooks/po.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
