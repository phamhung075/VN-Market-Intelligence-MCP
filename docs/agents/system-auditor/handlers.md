> Parent: [../../../.claude/agents/system-auditor.md](../../../.claude/agents/system-auditor.md)

# System Auditor — Handler Reference

<!-- size-justification: ~150L — handler reference with one operational section per audit category; tightly coupled trigger/step/emit triples. +2L: expired:false filter + rationale line in Step R-1 (D4 false-positive fix — SPEC ONLY, see IMPLEMENTATION NOTE below). +10L: HSC-7 signal_queue cold-file scan note (D6 stub). +~38L: FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE exclusion whitelist (Step R-1b) + live-concurrent-session guard + 2-cycle debounce gate (Step R-4b), folding recurrence_note/scope_widened/class_b_folded/debounce_and_exclusion_spec/recur_20260703T0300 into one predicate. -->

---

## task_board / orch-state.json Reconciliation Pass

**Brief source:** `docs/architecture-briefs/2026-05-21-tasks-md-hardening.md` §3 Option A + §8 Phase 1
**Sprint:** 1965a (DESIGN) → 1965b (IMPLEMENT)
**Dimension:** D4 — see `docs/agents/system-auditor/audit-dimensions.md`

### IMPLEMENTATION NOTE — this is compiled-code, not an LLM-interpreted step list

D4 is NOT executed by the system-auditor LLM agent (its `flow/main.md` Tier-3 pass never reads this file). The **live execution path is the automated cron job** `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` (`runTasksMdJanitorJob`, wired in `startScheduler.ts`, fires daily 03:00Z), which implements Steps R-1..R-7 below in TypeScript against `coordinationStore.listHeldTasks()` + `orchStateStore`. This document is that code's cited spec-of-record (see the file's header comment). **Zone owner for the actual fix = `dev-mcp-server` (`apps/mcp-server/`), not agent-father** — agent-father may correct this spec but is constitutionally forbidden from writing `apps/**/*.ts`.

As of 2026-07-08 (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE triage) the spec below (Steps R-1b, R-4b) is CORRECTED but the code has **NOT yet been updated to match** — this is a known doc/code gap, tracked as a follow-up code task for `dev-mcp-server`. Until that lands, the 6+ recurring false-positive batches (esc-datacov:*, cron:dev-team:*, dev-team-cron-singleton) will keep firing daily. Also note: the code's `listHeld()` currently calls `listHeldTasks({ kind: "sprint-task" })` WITHOUT `expired: false` — the "+2L expired:false filter" fix documented in the size-justification above was applied to THIS spec doc only and was never carried into the code; verify/apply both when the code fix lands.

### Trigger

Daily 03:00Z cron tick (off-peak; after `bctcReparseJob` at 02:30Z). Runs as part of Tier-3 daily pass. If Tier-3 is not the current tier, skip this handler — do not upgrade the tier.

### Steps

**Step R-1 — Call task_list_held**

```
result = call_tool(server="vn-market", tool="task_list_held", arguments={kind: "sprint-task", expired: false})
```

> `expired: false` is REQUIRED — task_list_held returns TTL-expired tombstone locks by default; without this filter D4 reads ~100+ dead locks as held and emits dozens of false-positive divergences per run.

If `result` is empty list AND `docs/data/orch/orch-state.json` `.head.active_task_id` is non-null → **emit signal_queue alert** (AC-4):
```
type: system_issue
summary: "task_list_held empty but orch-state.json .head.active_task_id=<id>"
```
Then continue to Step R-1b (head cross-check still needed).

If both empty and `.head.active_task_id` is null → log "D4 pass: no held locks, no active pipeline task — clean" → EXIT this handler.

**Step R-1b — Exclusion whitelist + live-concurrent-session guard (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE)**

Before Steps R-2/R-3 evaluate any held lock, compute `bare_task_id = held.task_id.startsWith("task:") ? held.task_id.slice(5) : held.task_id` and filter the lock OUT of both checks (SKIP — no mismatch record, no no-board-row record, no signal_queue row for this lock) if EITHER condition holds:

1. **Known-legit kind/pattern** — `bare_task_id` matches (glob, prefix unless noted) any of:
   `cron:*` (covers `cron:dev-team:*`, `cron:auditor-t1`, `cron:auditor-t2`, `cron:auditor-t3`), `*-singleton` suffix (covers `dev-team-cron-singleton`), `po-triage-*`, `esc-datacov:*`, `esc-deepdive:*`, `session-presence*`, `commit-mutex*`, `intent:*`.
   These are persistent/guard/escalation locks that are board-row-less OR held CONCURRENTLY with any active task BY DESIGN — see `feedback_esc3_held_lock_no_board_row_is_legit` and the `debounce_and_exclusion_spec`/`recur_20260703T0300` notes on task `FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE`. (`session-presence`/`commit-mutex`/`intent:*` are currently unreachable given Step R-1's `kind: "sprint-task"` filter — kept as a defense-in-depth safety net if that filter is ever widened.)
2. **Live concurrent session** — `held.owner_client_session` is non-null, appears in the live roster from `call_tool(server="vn-market", tool="task_list_held", arguments={kind: "session-presence", expired: false})`, AND the lock itself is unexpired (`held.expires_at` in the future). A live-held unexpired lock owned by another active dispatcher session is NOT orphaned — it belongs to a concurrently-running sprint that `.head` (single-slot) does not track by design (N-sprint concurrency; see `scope_widened`/`class_b_folded` notes on the same task).

Log each skip at DEBUG: `"D4 SKIP: <bare_task_id> — <reason: known-legit-pattern|live-concurrent-session:<owner_client_session>>"`. Only locks surviving this filter proceed to Steps R-2 and R-3.

**Step R-2 — orch-state.json `.head` cross-check (AC-4)**

Slice `.head` via jq (see `docs/standards/orch-state-access.md §1`):
```bash
head_active_task=$(jq -r '.head.active_task_id // empty' docs/data/orch/orch-state.json)
```

For each held lock surviving Step R-1b:
- If `.head.active_task_id != null` AND `.head.active_task_id != bare_task_id` → record a **candidate** mismatch (type: `system_issue`, summary: `"orch-state/lock mismatch: active=<active_task_id> held=<bare_task_id>"`, key: `R2-mismatch:<bare_task_id>`). Candidates are NOT emitted directly — they pass through the Step R-4b debounce gate first.

**Step R-3 — `.task_board` owner/status cross-check (AC-1, AC-2, AC-3)**

Slice `.task_board` via jq (absolute path — CWD may have drifted; see `docs/standards/orch-state-access.md §1`):
```bash
TASKS=$(jq -c '[.task_board.active_sprints[].tasks[]]' "$PROJECT_ROOT/docs/data/orch/orch-state.json")
```
For each held lock surviving Step R-1b:

Find the task_board task entry where `task_id` matches `bare_task_id`.

If entry NOT found:
- Record a **candidate** (key: `R3-no-board-row:<bare_task_id>`, summary: `"held lock <bare_task_id> has no task_board entry"`).

If entry found:
- Compare `held.owner_agent` vs task entry `owner` field
  - Diverge → record a **candidate** (key: `R3-owner-diverge:<bare_task_id>`, summary: `"Owner diverge: lock=<held.owner_agent> task_board=<task_owner> task=<bare_task_id>"`)
- Compare task entry `status` field:
  - Status is `IN_PROGRESS` → PASS (lock + status coherent)
  - Status is `BACKLOG` or `DONE` or `BLOCKED` → record a **candidate** (key: `R3-status-diverge:<bare_task_id>`, summary: `"Status diverge: lock held but task_board shows <status> for <bare_task_id>"`)

All R-3 candidates are NOT emitted directly — they pass through the Step R-4b debounce gate (same as R-2).

**Step R-4 — Seam 3: concurrent-commit detection (AC-5)**

```bash
git log --all --oneline --follow --format="%H %ai" -- docs/data/orch/orch-state.json | head -20
```

Parse commit timestamps. If any two commits to `docs/data/orch/orch-state.json` land within a 30-second window:
- Record conflicting commit hashes + timestamps
- Emit signal_queue row directly (NOT subject to R-4b debounce — a concurrent-commit pair is a fact about git history, not a transient snapshot): `summary: "orch-state.json concurrent commits: <hash1> + <hash2> within 30s"`

**Step R-4b — Debounce gate for R-2/R-3 candidates (2-consecutive-cycle persistence, FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE)**

D4 runs once daily (Tier-3, 03:00Z). A mid-dispatch snapshot can produce candidates (R-2 mismatches, R-3 no-board-row/owner/status divergences) that self-resolve before the next tick — e.g. the 2026-07-01T03:00Z batch: 15 candidates, ALL self-resolved within the same interval (dev-team commit landed + qa flipped task status 02:58–03:15Z), ALL false-positive. A candidate is only real signal if it PERSISTS across ≥2 consecutive daily D4 passes.

Ledger: since system-auditor may write ONLY its own notebook (`docs/agent-memory/notebooks/system-auditor.md`, APPEND class per `notebook-write` skill) and `orch-state.json .signal_queue.rows[]` — no new state file is permitted — the debounce ledger rides on the notebook append already performed every cycle:

1. Before evaluating candidates this cycle, read the notebook and find the most recent prior `## ` section's `D4 candidates:` line (format: comma-separated `<key>` list, or `none`).
2. For each candidate produced by Steps R-2/R-3 this cycle (key = `R2-mismatch:<id>` / `R3-no-board-row:<id>` / `R3-owner-diverge:<id>` / `R3-status-diverge:<id>`):
   - Key was ALSO present in the prior cycle's `D4 candidates:` line → PERSISTED ≥2 consecutive cycles → proceed to Step R-5 emit for this candidate.
   - Key was NOT present previously (first occurrence) → do NOT emit this cycle; it re-arms and will be checked again on the next daily D4 pass.
3. This cycle's notebook section (written at end-of-cycle per the agent's normal notebook-write step) MUST include the line `D4 candidates: <key1>,<key2>,...` (or `D4 candidates: none`) listing every candidate produced by R-2/R-3 THIS cycle (regardless of whether it was emitted) — this is what the NEXT cycle reads back. Cold-start (no prior `D4 candidates:` line found, e.g. first-ever run or notebook rotated past 3 sections): treat as zero prior candidates — do not emit this cycle, just seed the ledger.

**Step R-5 — Emit signal_queue rows**

For each R-2/R-3 candidate that passed the Step R-4b debounce gate, plus every R-4 concurrent-commit finding (emitted directly, no debounce), append one row to `docs/data/orch/orch-state.json` `.signal_queue.rows[]` per `.claude/skills/signal-dashboard/SKILL.md` § WRITE (atomic temp→validate→rename — SHG-3: validate.sh gate MUST run before rename):

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
| `task_list_held` MCP call fails | Log WARN, skip Steps R-1b/R-2/R-3, proceed to R-4 git-log check independently |
| `task_list_held(kind="session-presence")` call fails (Step R-1b live-session check) | Log WARN, treat as zero live sessions this cycle (fail-safe = do NOT suppress on this path; the known-legit kind/pattern filter still applies) |
| `$PROJECT_ROOT/docs/data/orch/orch-state.json` not found (CWD drift) | This is a path-resolution bug — Step 0a MUST have resolved `$PROJECT_ROOT` before this handler runs. Log BUG telegram: `"[system-auditor] D4 ABORT: orch-state.json not found at $PROJECT_ROOT/docs/data/orch/orch-state.json — CWD drift; Step 0a project-root skill must run first"` → EXIT handler. |
| `$PROJECT_ROOT/docs/data/orch/orch-state.json` exists but parse fails (invalid JSON) | Log BUG telegram: `"[system-auditor] D4 ABORT: orch-state.json invalid JSON at $PROJECT_ROOT/docs/data/orch/orch-state.json"` → EXIT handler |
| `.head` section missing from orch-state.json | Log WARN, skip Step R-2 cross-check only |
| git log command fails | Log WARN, skip Step R-4 only |
| notebook unreadable/absent at Step R-4b (cold start) | Treat as zero prior-cycle candidates — seed the ledger this cycle, do not emit any R-2/R-3 candidate (fail-safe: never emit on first observation) |

### Acceptance criteria

AC-1 through AC-5 per `docs/architecture-briefs/2026-05-21-tasks-md-hardening.md` §6 Phase 1:

| AC | Check |
|----|-------|
| AC-1 | `task_list_held` appears in system-auditor session log at 03:00Z ± 5min |
| AC-2 | Divergence PERSISTING ≥2 consecutive daily cycles (Step R-4b) → signal_queue row `to: "po"` within 24h of the 2nd occurrence |
| AC-3 | No divergence, OR divergence excluded by the Step R-1b whitelist/live-session guard, OR divergence seen on only 1 cycle (self-resolved) → zero false-positive signal_queue rows from D4 |
| AC-4 | `task_list_held` empty but `orch-state.json .head.active_task_id` non-null → signal_queue alert (Step R-1's own empty-list branch is NOT subject to R-1b/R-4b — it fires on the FIRST cycle, unchanged) |
| AC-5 | Two orch-state.json commits within 30s → detected via git log → signal_queue alert (unaffected by this fix — R-4 is not lock-based) |

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

---

## D6: signal_queue Full-History Scan — Cold File Protocol (HSC-7)

**Dimension:** D6 (stub — activate when full-history signal audit is needed)
**Source brief:** `docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md §5.3`

### Cold file contract (post-HSC-7)

After HSC-7 activates, `signal_queue.rows[]` in the hot file contains ONLY active rows (status `NEW` or `TRIAGED`, or terminal rows younger than 24h). Historical terminal rows are in the cold archive.

**Any full-history signal scan MUST load the cold file lazily:**
```bash
# Hot file — active rows only (NEW / < 24h terminal)
jq '.signal_queue.rows[]' "$PROJECT_ROOT/docs/data/orch/orch-state.json"

# Cold file — historical rows (load ONLY for forensic audit; NEVER in hot-path planning)
YYYYMM=$(date -u +%Y-%m)
COLD_FILE="$PROJECT_ROOT/docs/data/orch/archive/${YYYYMM}.json"
if [ -f "$COLD_FILE" ]; then
  jq '.signal_rows[]' "$COLD_FILE"
fi
```

**DO NOT** scan only `signal_queue.rows[]` when doing a full-history audit — that will miss all pruned rows.
**DO NOT** load the cold file in routine hot-path passes — it grows unboundedly and is not on the hot path.

### Failure modes

| Failure | Behavior |
|---|---|
| Cold file missing for current month | Log INFO: no cold rows yet for this month; hot rows only |
| Cold file invalid JSON | Log WARN + BUG telegram; skip cold scan for this pass |
