<!-- size-justification: 128L — atomic telegram-reports handler; routing decision table + per-category action rules cannot decompose without losing handler coherence. -->
# PO — Telegram Reports Flow

**Tools:** `docs/agents/tools/package/po.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input
`read_telegram_reports(status="new")` — user requests, bug reports, feature ideas

## Output
docs/TASKS.md updated | processed reports cleaned | architect flagged if recurrent

---

## Step 1: Fetch Reports

```
read_telegram_reports(status="new")
```

Empty → EXIT immediately (no return needed, caller continues).

---

## Step 2: Per-Report Processing

For each report:

### 2a. Complaint Pattern Scan (run BEFORE intent classification)

Scan the full message text for these keyword groups:

| Pattern group | Keywords | Force-classify as |
|---|---|---|
| Display / truncation | "cut off", "truncated", "missing", "not showing", "incomplete", "only shows", "half", "bị cắt" | `ux` bug |
| Warning shown to user | "warning", "cảnh báo", "shows error", "hiện lỗi", "message says" + container/download/pipeline noun | `bug` (infra) |
| Alert content wrong | "alert wrong", "thông báo sai", "wrong info", "thiếu thông tin" | `ux` bug |
| Unexpected behaviour | "suddenly", "appears when", "xuất hiện khi", "không nên hiện" | `bug` (code or infra — pick by noun) |

If **any pattern matches** → override the intent to the forced classification above, regardless of how the user phrased it. Do not let polite phrasing ("I noticed…", "maybe…") downgrade a complaint to `feedback`.

### 2a2. Content Quality & Mismatch Scan (runs on AGENT-generated reports too)

For **every message** (user AND agent), check for internal contradictions and quality failures:

**Data contradiction checks:**
- Message says sentiment = BULLISH but body contains: "bán ra", "xả hàng", "giảm", "lỗ", "giảm mạnh" → `bug` (code) — sentiment misclassification
- Message says alert fired but timestamp is outside 02:00–09:00 UTC weekdays → `bug` (code) — pre-open phantom alert
- Message claims price change but `change_pct` direction contradicts open/close prices in same message → `bug` (code) — wrong reference price
- Message says "N cảnh báo" (N > 5) but all listed alerts have identical body text → `bug` (code) — deduplication not working
- Message says BCTC extracted but `confidence = 0.00` → `bug` (code) — OCR/extraction failure
- Message contains "schema validation" / "Required" / "Invalid fields" on a signal post → `bug` (code) — signal schema gap

**Pipeline health contradiction checks:**
- Message says service "healthy" but last push timestamp > SLA threshold → `bug` (infra) — stale health status
- Message says "Queue: 0 items" but prior message shows pending rows → `bug` (code) — queue count mismatch
- Message says "circuit breaker CLOSED" but errors still logged in same message → `bug` (code) — CB state sync issue
- Message says "VPS unreachable" but SSH diagnostic in same message succeeds → `bug` (code) — wrong health detection
- Message contains `notified_telegram=0` for CRITICAL/HIGH alert with timestamp > 5 min ago → `bug` (code) — Telegram dispatch silenced

**Repetition/spam checks:**
- Same alert body repeats 5+ times in same digest for same ticker → `bug` (code) — alert dedup missing
- `[pollNews] All news sources returned 0 items` fires more than 3 times consecutively → `bug` (infra) — no cooldown/silence guard
- Same `from_agent` posts same `message_type` twice within 4h with identical content → `bug` (code) — duplicate dispatch

**Classify any match as a bug.** Do not require the user to explicitly report it — agent messages self-report bugs through contradiction.

### 2b. Parse Intent
Classify: `bug` | `feature` | `ux` | `question` | `feedback`
- `question` → do NOT create task; answer inline in WORK channel → `process_telegram_report(id=..., delete_telegram_message=true)` → next report

### 2c. Dedup Check
Search docs/TASKS.md for keyword overlap (title + description):
- ≥80% keyword match → **duplicate** → skip task creation
- Log: `"[PO] Report #ID skipped — duplicate of TASK-NNN"` in WORK channel
- `process_telegram_report(id=..., delete_telegram_message=true)` → next report

### 2d. Recurrence Check
For non-duplicate reports, check if this pattern has appeared before:
```bash
grep -i "<keywords>" docs/TASKS.md
git log --oneline --all --grep="<keywords>" | head -10
```
- ≥2 previous occurrences of same module/component → **recurrent issue**
  - Create task with prefix `[ARCH REVIEW]` in title
  - Add note in description: `"Recurrent: same issue found N times in history. Architect root-cause review required before fix."`
  - Set `priority: high`

### 2e. Create Task
Add to docs/TASKS.md:
```
| TASK-NNN | [ARCH REVIEW?] <title from report> | pending | <ba|developer|ops> | telegram:#ID |
```

Agent assignment:
- `bug` (infra) → `ops`
- `bug` (code) → `developer`
- `feature` | `ux` → `ba` (needs spec first)
- `feedback` → `po` (PO handles directly)

### 2f. Clean Report
```
process_telegram_report(id=..., delete_telegram_message=true)
```

---

## Step 3: Summary

After all reports processed:
```
send_telegram(channel="work", message="[PO] Telegram Reports: N processed | K tasks created (J arch-review flagged) | M duplicates skipped | P content-mismatch bugs detected")
```

---

## Return

```
## RETURN
DONE: Telegram reports processed — N tasks created, K flagged for architect review
NEXT: [next agent per pipeline] | [continue sprint work]
PIPELINE: continue
```

**Notebook write** → `docs/agent-memory/notebooks/po.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
