> Parent: [../../../.claude/agents/system-auditor.md](../../../.claude/agents/system-auditor.md)

# System Auditor — Handler Reference

<!-- size-justification: ~100L — handler reference with one operational section per audit category; tightly coupled trigger/step/emit triples. -->

---

## task_board / orch-state.json Reconciliation Pass

**Brief source:** `docs/architecture-briefs/2026-05-21-tasks-md-hardening.md` §3 Option A + §8 Phase 1
**Sprint:** 1965a (DESIGN) → 1965b (IMPLEMENT)
**Dimension:** D4 — see `docs/agents/system-auditor/audit-dimensions.md`

### Trigger

Daily 03:00Z cron tick (off-peak; after `bctcReparseJob` at 02:30Z). Runs as part of Tier-3 daily pass. If Tier-3 is not the current tier, skip this handler — do not upgrade the tier.

### Steps

**Step R-1 — Call task_list_held**

```
result = mcp__claude_ai_gateway__call_tool({
  server: "vn-market",
  tool: "task_list_held",
  arguments: { kind: "sprint-task" }
})
```

If `result` is empty list AND `docs/data/orch/orch-state.json` `.head.active_task_id` is non-null → **emit signal_queue alert** (AC-4):
```
type: system_issue
summary: "task_list_held empty but orch-state.json .head.active_task_id=<id>"
```
Then continue to Step R-2 (head cross-check still needed).

If both empty and `.head.active_task_id` is null → log "D4 pass: no held locks, no active pipeline task — clean" → EXIT this handler.

**Step R-2 — orch-state.json `.head` cross-check (AC-4)**

Read `docs/data/orch/orch-state.json`. Extract `.head.active_task_id` (may be null).

For each held lock from Step R-1:
- Check `bare_task_id = held.task_id.startsWith("task:") ? held.task_id.slice(5) : held.task_id`
- If `.head.active_task_id != null` AND `.head.active_task_id != bare_task_id` → record mismatch for signal_queue emit (type: `system_issue`, summary: `"orch-state/lock mismatch: active=<active_task_id> held=<bare_task_id>"`)

**Step R-3 — `.task_board` owner/status cross-check (AC-1, AC-2, AC-3)**

Read `$PROJECT_ROOT/docs/data/orch/orch-state.json` (absolute path — NEVER use relative path; CWD may have drifted). Extract `.task_board.active_sprints[].tasks[]`. For each held lock from Step R-1:

```
bare_task_id = held.task_id.startsWith("task:") ? held.task_id.slice(5) : held.task_id
```

Find the task_board task entry where `task_id` matches `bare_task_id`.

If entry NOT found:
- Log: `"D4 WARN: held lock <bare_task_id> has no task_board entry"`
- Emit signal_queue row (see §Emit format below)

If entry found:
- Compare `held.owner_agent` vs task entry `owner` field
  - Diverge → emit signal_queue row: `summary: "Owner diverge: lock=<held.owner_agent> task_board=<task_owner> task=<bare_task_id>"`
- Compare task entry `status` field:
  - Status is `IN_PROGRESS` → PASS (lock + status coherent)
  - Status is `BACKLOG` or `DONE` or `BLOCKED` → emit signal_queue row: `summary: "Status diverge: lock held but task_board shows <status> for <bare_task_id>"`

**Step R-4 — Seam 3: concurrent-commit detection (AC-5)**

```bash
git log --all --oneline --follow --format="%H %ai" -- docs/data/orch/orch-state.json | head -20
```

Parse commit timestamps. If any two commits to `docs/data/orch/orch-state.json` land within a 30-second window:
- Record conflicting commit hashes + timestamps
- Emit signal_queue row: `summary: "orch-state.json concurrent commits: <hash1> + <hash2> within 30s"`

**Step R-5 — Emit signal_queue rows**

For each divergence found in Steps R-1 through R-4, append one row to `docs/data/orch/orch-state.json` `.signal_queue.rows[]` per `.claude/skills/signal-dashboard/SKILL.md` § WRITE (atomic temp→rename):

```json
{
  "id": "sau-<YYYYMMDDTHHmmss>",
  "ts": "<ISO-8601 UTC compact>",
  "from": "system-auditor",
  "to": "po",
  "type": "system_issue",
  "summary": "<summary ≤120 chars>",
  "severity": "MED",
  "status": "NEW",
  "payload_ref": null
}
```

**Step R-6 — BUG channel (new divergences only)**

If any divergence is new (dedup_key not seen in past 7 days):
```
send_telegram(channel="bug", message="[system-auditor] D4 orch-state/lock diverge: <summary> — see orch-state.json .signal_queue")
```

Dedup key pattern: `d4_tasksmd_lock_diverge:<bare_task_id>`

**Step R-7 — Emit clean signal**

If zero divergences detected:
```
log "[system-auditor] D4 pass clean — no TASKS.md/lock divergence at <UTC>"
```
No DASHBOARD row, no BUG write.

### Failure modes

| Failure | Behavior |
|---|---|
| `task_list_held` MCP call fails | Log WARN, skip Steps R-3/R-4, proceed to R-4 git-log check independently |
| `$PROJECT_ROOT/docs/data/orch/orch-state.json` not found (CWD drift) | This is a path-resolution bug — Step 0a MUST have resolved `$PROJECT_ROOT` before this handler runs. Log BUG telegram: `"[system-auditor] D4 ABORT: orch-state.json not found at $PROJECT_ROOT/docs/data/orch/orch-state.json — CWD drift; Step 0a project-root skill must run first"` → EXIT handler. |
| `$PROJECT_ROOT/docs/data/orch/orch-state.json` exists but parse fails (invalid JSON) | Log BUG telegram: `"[system-auditor] D4 ABORT: orch-state.json invalid JSON at $PROJECT_ROOT/docs/data/orch/orch-state.json"` → EXIT handler |
| `.head` section missing from orch-state.json | Log WARN, skip Step R-2 cross-check only |
| git log command fails | Log WARN, skip Step R-4 only |

### Acceptance criteria

AC-1 through AC-5 per `docs/architecture-briefs/2026-05-21-tasks-md-hardening.md` §6 Phase 1:

| AC | Check |
|----|-------|
| AC-1 | `task_list_held` appears in system-auditor session log at 03:00Z ± 5min |
| AC-2 | Divergence → signal_queue row `to: "po"` within 24h |
| AC-3 | No divergence → zero false-positive signal_queue rows from D4 |
| AC-4 | `task_list_held` empty but `orch-state.json .head.active_task_id` non-null → signal_queue alert |
| AC-5 | Two orch-state.json commits within 30s → detected via git log → signal_queue alert |

---

## Step D5: Notebook Overflow Detection

**Dimension:** D5 — see `docs/agents/system-auditor/audit-dimensions.md`
**Sprint:** 1967 ITEM-04 (market-watcher identity recurrence fix — TASK_1967-04)

### Trigger

Tier-2 (every 4h) pass. Runs alongside D2 (Data Fetch Integrity). If Tier-2 is not the current tier, skip this handler.

### Steps

**Step D5-1 — Collect notebook sizes**

```bash
for notebook in docs/agent-memory/notebooks/*.md; do
  lines=$(wc -l < "$notebook")
  basename=$(basename "$notebook")
  if [[ $lines -gt 150 ]]; then
    echo "OVERFLOW: $basename = $lines L"
  fi
done
```

Collect all notebooks exceeding 150L into a violation list.

**Step D5-2 — Alert on violations**

For each violation found in Step D5-1:
```
send_telegram(
  channel="work",
  message="[system-auditor] D5 Notebook overflow: <basename> = <lines>L (threshold 150L). Agent identity risk — trim required."
)
```

Dedup key pattern: `d5_notebook_overflow:<basename>:<calendar_date>` — alert once per agent per day maximum.

**Step D5-3 — Clean pass**

If zero violations:
```
log "[system-auditor] D5 pass clean — all notebooks ≤ 150L at <UTC>"
```
No WORK message, no DASHBOARD row.

### Failure modes

| Failure | Behavior |
|---|---|
| `docs/agent-memory/notebooks/` unreadable | Log WARN: `"[system-auditor] D5 WARN: notebooks dir unreadable — skipping check"` → continue to next dimension |
| `wc -l` fails for specific file | Log WARN for that file, continue checking remaining notebooks |

### Acceptance criteria (TASK_1967-04 AC-4)

| AC | Check |
|----|-------|
| D5-AC-1 | D5 handler fires at Tier-2 pass (every 4h) |
| D5-AC-2 | Any notebook > 150L → WORK telegram sent within the same Tier-2 cycle |
| D5-AC-3 | Zero violations → no WORK message (no false positives) |
| D5-AC-4 | Dedup: same notebook fires at most once per calendar day |
