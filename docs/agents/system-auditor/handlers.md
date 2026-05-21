> Parent: [../../../.claude/agents/system-auditor.md](../../../.claude/agents/system-auditor.md)

# System Auditor — Handler Reference

<!-- size-justification: ~100L — handler reference with one operational section per audit category; tightly coupled trigger/step/emit triples. -->

---

## TASKS.md Reconciliation Pass

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

If `result` is empty list AND `docs/pipeline-state.json` `activeTaskId` is non-null → **emit DASHBOARD alert** (AC-4):
```
type: system_issue
summary: "task_list_held empty but pipeline-state.activeTaskId=<id>"
```
Then continue to Step R-2 (pipeline-state cross-check still needed).

If both empty and `activeTaskId` is null → log "D4 pass: no held locks, no active pipeline task — clean" → EXIT this handler.

**Step R-2 — pipeline-state.json cross-check (AC-4)**

Read `docs/pipeline-state.json`. Extract `activeTaskId` (may be null).

For each held lock from Step R-1:
- Check `bare_task_id = held.task_id.startsWith("task:") ? held.task_id.slice(5) : held.task_id`
- If `pipeline-state.activeTaskId != null` AND `pipeline-state.activeTaskId != bare_task_id` → record mismatch for DASHBOARD emit (type: `system_issue`, summary: `"pipeline-state/lock mismatch: active=<activeTaskId> held=<bare_task_id>"`)

**Step R-3 — TASKS.md owner/status cross-check (AC-1, AC-2, AC-3)**

Read `docs/TASKS.md`. For each held lock from Step R-1:

```
bare_task_id = held.task_id.startsWith("task:") ? held.task_id.slice(5) : held.task_id
```

Find the TASKS.md row where `task_id` column matches `bare_task_id`.

If row NOT found:
- Log: `"D4 WARN: held lock <bare_task_id> has no TASKS.md row"`
- Emit DASHBOARD row (see §Emit format below)

If row found:
- Compare `held.owner_agent` vs TASKS.md `Owner` column
  - Diverge → emit DASHBOARD row: `summary: "Owner diverge: lock=<held.owner_agent> tasks=<tasks_owner> task=<bare_task_id>"`
- Compare TASKS.md `Status` column:
  - Status is `In Progress` → PASS (lock + status coherent)
  - Status is `BACKLOG` or `Done` or `BLOCKED` → emit DASHBOARD row: `summary: "Status diverge: lock held but TASKS.md shows <status> for <bare_task_id>"`

**Step R-4 — Seam 3: concurrent-commit detection (AC-5)**

```bash
git log --all --oneline --follow --format="%H %ai" -- docs/TASKS.md | head -20
```

Parse commit timestamps. If any two commits to `docs/TASKS.md` land within a 30-second window:
- Record conflicting commit hashes + timestamps
- Emit DASHBOARD row: `summary: "TASKS.md concurrent commits: <hash1> + <hash2> within 30s"`

**Step R-5 — Emit DASHBOARD rows**

For each divergence found in Steps R-1 through R-4, append one row to `docs/signals/DASHBOARD.md` under `## po` section per `.claude/skills/signal-dashboard/SKILL.md`:

```
id     = sau-<YYYYMMDDTHHmmss>   # sau = system-auditor
ts     = ISO-8601 UTC compact
from   = system-auditor
type   = system_issue
status = NEW
```

Row format:
```
| {id} | {ts} | system-auditor | system_issue | {summary ≤40 chars} | NEW | - |
```

After appending: update `_Updated: {ISO}_` timestamp in DASHBOARD.md line 4.

**Step R-6 — BUG channel (new divergences only)**

If any divergence is new (dedup_key not seen in past 7 days):
```
send_telegram(channel="bug", message="[system-auditor] D4 TASKS.md/lock diverge: <summary> — see DASHBOARD.md ## po")
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
| `docs/TASKS.md` parse fails (corrupted) | Log BUG telegram: `"[system-auditor] D4 ABORT: TASKS.md unreadable — possible Seam 3 corruption"` → EXIT handler |
| `docs/pipeline-state.json` missing | Log WARN, skip Step R-2 cross-check only |
| git log command fails | Log WARN, skip Step R-4 only |

### Acceptance criteria

AC-1 through AC-5 per `docs/architecture-briefs/2026-05-21-tasks-md-hardening.md` §6 Phase 1:

| AC | Check |
|----|-------|
| AC-1 | `task_list_held` appears in system-auditor session log at 03:00Z ± 5min |
| AC-2 | Divergence → DASHBOARD row in `## po` section within 24h |
| AC-3 | No divergence → zero false-positive rows in `## po` |
| AC-4 | `task_list_held` empty but `pipeline-state.activeTaskId` non-null → DASHBOARD alert |
| AC-5 | Two TASKS.md commits within 30s → detected via git log → DASHBOARD alert |
