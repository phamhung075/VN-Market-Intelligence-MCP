<!-- size-justification: 300L — schema-hardening brief for orch-state.json. Covers: status enum freeze + migration map, sprint eviction rule, task stub field split, write-gate contract. All content load-bearing for pm mechanical execution. Companion to 2026-06-26-orch-state-hot-cold-split.md (which handles file-size/eviction mechanics). -->

# Architecture Brief — ORCH-STATE-SCHEMA-HARDENING

**Date:** 2026-06-27
**Author:** agents-architect
**Status:** DESIGN COMPLETE — handoff to PM
**Companion:** `docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md` (HSC-1…HSC-7, hot/cold file mechanics)
**Scope:** Data-quality layer only. PLAN/DESIGN — does not mutate orch-state.json.

---

## 0. TL;DR

Four mechanical changes that eliminate the jq-filter hallucination class and prevent future write-clobber incidents:

1. **STATUS ENUM FREEZE** — 20+ free-text spellings → 11 canonical uppercase values. Every `select(.status=="done")` currently misses 82 `DONE` items. Migration map is mechanical.
2. **SPRINT EVICTION RULE** — deterministic jq predicate: when all sprint tasks map to TERMINAL set → evict whole sprint to cold. 13 of 18 sprints are evictable TODAY.
3. **TASK STUB INSIDE SPRINTS** — keep 10 hot fields per task; push prose to `backlog-detail.json` via `detail_ref`. Applies to tasks in active sprints, not just backlog.
4. **WRITE-GATE** — `scripts/orch-state-validate.sh` contract; wired into every atomic write before rename.

Verified state (2026-06-27): orch-state.json = 538 KB / 7,388 lines. Hot file target after all four changes: ~80 KB.

---

## 1. STATUS ENUM FREEZE

### 1.1 Canonical enum (task-level)

```
BACKLOG        — not yet scheduled into a sprint
TODO           — scheduled, not started
IN_PROGRESS    — actively worked
REVIEW         — submitted for code/architect review
QA             — in QA / testing phase
DONE           — work complete, live verification pending
DONE_VERIFIED  — work complete AND verified live
BLOCKED        — externally blocked (detail in verify_note)
DEFERRED       — postponed (detail in verify_note)
CANCELLED      — intentionally dropped (detail in verify_note)
SKIPPED        — removed as redundant/obsolete (detail in verify_note)
```

**TERMINAL_SET** (used by sprint eviction rule § 2): `DONE | DONE_VERIFIED | CANCELLED | DEFERRED | SKIPPED`

### 1.2 Sprint-level status enum (separate from task-level)

```
ACTIVE         — at least one task in non-terminal status
PAUSED         — temporarily on hold
PENDING_GATE   — blocked on an external gate
DONE           — all tasks in TERMINAL_SET (triggers eviction)
```

### 1.3 Migration map — task-level (apply mechanically via jq `walk`)

| Old value | New value | verify_note to set |
|---|---|---|
| `done` | `DONE` | — |
| `DONE-LIVE-VERIFIED` | `DONE_VERIFIED` | `live-verified` |
| `done_verified` | `DONE_VERIFIED` | — |
| `DONE-VERIFIED` | `DONE_VERIFIED` | — |
| `DONE_VERIFIED` | `DONE_VERIFIED` | — (already canonical) |
| `DONE-DEPLOYED` | `DONE_VERIFIED` | `deployed` |
| `DONE-SPEC-VERIFIED` | `DONE_VERIFIED` | `spec-verified` |
| `DONE-FAIL-VERDICT` | `DONE_VERIFIED` | `fail-verdict` |
| `DONE-CODE-LIVE-MOOT-PUB5` | `DONE_VERIFIED` | `code-live-moot-pub5` |
| `DONE-CODE-LIVE-PENDING-BACKFILL` | `DONE_VERIFIED` | `pending-backfill` |
| `DONE-CODE-DATA-BLOCKED-UPSTREAM` | `DONE_VERIFIED` | `data-blocked-upstream` |
| `CLOSED-NO-CHANGE` | `CANCELLED` | `no-change` |
| `CLOSED-NOT-REPRO` | `CANCELLED` | `not-repro` |
| `FOLDED` | `CANCELLED` | `folded` |
| `SUPERSEDED` | `CANCELLED` | `superseded` |
| `DEFERRED-SUPERSEDED` | `DEFERRED` | `superseded` |
| `DEFERRED-OUT-OF-DEV-SCOPE` | `DEFERRED` | `out-of-dev-scope` |
| `DEFERRED-INFRA` | `DEFERRED` | `infra` |
| `DEFERRED-P3` | `DEFERRED` | `p3` |
| `DEFERRED-PRODUCT` | `DEFERRED` | `product` |
| `DEFERRED-SEQUENCED` | `DEFERRED` | `sequenced` |
| `BLOCKED-UPSTREAM` | `BLOCKED` | `upstream` |
| `blocked-probe5` | `BLOCKED` | `probe5` |
| `HELD` | `BLOCKED` | `held` |
| `REWORK` | `IN_PROGRESS` | `rework` |
| `READY` | `TODO` | `ready` |
| `ARCHITECT_REVIEW` | `REVIEW` | `architect-review` |
| `CHANGES_REQUESTED` | `REVIEW` | `changes-requested` |
| `review` | `REVIEW` | — |
| `NEW` | `BACKLOG` | — |
| `backlog` | `BACKLOG` | — |
| `null` (task) | `BACKLOG` | `corrupt-null` |

### 1.4 Migration map — sprint-level status

| Old value | New value |
|---|---|
| `active` | `ACTIVE` |
| `in_progress` | `ACTIVE` |
| `IN_PROGRESS` | `ACTIVE` |
| `null` (sprint with null id) | N/A — entire sprint is quarantined/evicted (see § 2.3) |

### 1.5 Implementation note

`verify_note` is a non-authoritative string field on the task object. It is HOT (kept in stub — tiny). It carries ONLY the qualifier tag from the old status spelling. It is never used in jq filters for business logic. It replaces the prose that was encoded in the status string itself.

**One-time migration jq skeleton (pm runs under commit-mutex):**
```bash
# Apply inside scripts/orch-state-validate.sh pre-write, or as a separate one-time script
# DO NOT run this without commit-mutex held
jq '
  def to_canonical:
    if . == "done" then "DONE"
    elif . == "DONE-LIVE-VERIFIED" then "DONE_VERIFIED"
    elif . == "done_verified" then "DONE_VERIFIED"
    elif (. // "") | startswith("DONE-") then "DONE_VERIFIED"
    elif (. // "") | startswith("CLOSED-") then "CANCELLED"
    elif (. // "") | startswith("DEFERRED-") then "DEFERRED"
    elif (. // "") | startswith("BLOCKED-") then "BLOCKED"
    elif . == "blocked-probe5" then "BLOCKED"
    elif . == "HELD" then "BLOCKED"
    elif . == "REWORK" then "IN_PROGRESS"
    elif . == "READY" or . == "NEW" then "TODO"
    elif . == "backlog" then "BACKLOG"
    elif . == "review" or . == "ARCHITECT_REVIEW" or . == "CHANGES_REQUESTED" then "REVIEW"
    elif . == "FOLDED" or . == "SUPERSEDED" then "CANCELLED"
    elif . == null then "BACKLOG"
    else .  # already canonical
    end;
  .task_board.active_sprints[].tasks[]?.status |= to_canonical |
  .task_board.backlog[]?.status |= to_canonical |
  .task_board.done[]?.status |= to_canonical
' orch-state.json > /tmp/orch-migrated.json
# then validate + rename
```

---

## 2. SPRINT EVICTION RULE

### 2.1 Deterministic eviction predicate

A sprint is **evictable** when ALL of the following hold:
1. Its `id` is not null AND its `status` is not null (non-null = valid sprint, null-id gets quarantined separately)
2. Every task's `.status` (after canonical migration) is in `TERMINAL_SET`: `["DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED"]`

**jq check (runs inside eviction script):**
```bash
TERMINAL='["DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED"]'
jq --argjson T "$TERMINAL" '
  [.task_board.active_sprints[]
   | select(.id != null)
   | select(
       [ .tasks[]?.status ]
       | all(. as $s | $T | index($s) != null)
     )
   | .id
  ]' docs/data/orch/orch-state.json
```

### 2.2 Eviction action

For each evictable sprint:
1. Write the FULL sprint object (with all tasks) to `docs/data/orch/archive/2026-06.json` under `.closed_sprints[]`
2. Remove from `active_sprints[]`
3. Append a one-line stub to `closed_sprints[]` in the hot file:

```jsonc
// hot file closed_sprints[] stub
{
  "id": "<sprint-id>",
  "title": "<sprint-title>",
  "closed_at": "<ISO-8601 UTC>",
  "task_count": <n>,
  "detail_ref": "docs/data/orch/archive/2026-06.json#closed_sprints/<sprint-id>"
}
```

4. If the hot file has no `closed_sprints` lane yet, create it as an empty array (alongside `active_sprints`).

### 2.3 Null-id sprint quarantine

Both null-id corrupt sprints are evicted unconditionally (no task-status check needed):
- Sprint with `id=null, status=null` (1 task, DONE)
- Sprint with `id=null, status=in_progress` (6 tasks, all DONE)

Write both to cold as `{ "id": "QUARANTINED-NULL-ID-<index>", "quarantine_reason": "null id", "tasks": [...] }`.
Do NOT write stubs for these to `closed_sprints[]` (they are corrupt artifacts, not real sprints).

### 2.4 Evictable sprints identified TODAY (2026-06-27)

13 of 18 active sprints are evictable immediately after status migration:

| Sprint ID | Tasks | All terminal? |
|---|---|---|
| MCP-SURFACE-GAPS | 3 | YES (3×DONE) |
| ENV-ISOLATION | 7 | YES (7×DONE) |
| SELF-IMPROVE-GATE | 1 | YES (1×DONE) |
| NB-PRUNE-FIX | 10 | YES (10×DONE) |
| BCTC-LAYOUT-FIRST | 19 | YES (19×DONE) |
| COWORK-RELIABILITY | 6 | YES (6×DONE) |
| BCTC-FETCH-CORRECTNESS | 5 | YES (5×DONE) |
| OPS-DASHBOARD-TRUTH | 4 | YES (4×DONE) |
| GO-FLEET-DEPLOY | 13 | YES (13×DONE) |
| EVIDENCE-ACCUM-SILENT-CRON | 1 | YES (1×DONE) |
| LOG-HYGIENE | 1 | YES (1×DONE) |
| null-id #1 (status=null) | 1 | YES — QUARANTINE |
| null-id #2 (status=in_progress) | 6 | YES — QUARANTINE |

5 sprints are NOT evictable (live work remaining):
- BCTC-ANALYTICS-LAYER (5 tasks not terminal)
- FLEET-HOST-SAFETY (3 tasks not terminal)
- VN-MACRO-TOOLING (1 task not terminal: PROBE-1 still `done` → after migration → `DONE`, then check again — may flip to evictable post-migration)
- CHEF-ATTN (1 task in non-terminal status)
- AUDIT-FB-GATE-PROSE-HARDENING (3 tasks in BACKLOG)

**Note on VN-MACRO-TOOLING:** After canonical migration, re-run the eviction check. If all 20 tasks resolve to TERMINAL_SET, it becomes the 12th evictable sprint.

### 2.5 Rule insertion into pm/flow/task-archive.md

Add a `§ Sprint Eviction` section immediately before Step 1 of task-archive.md:

```markdown
## § Sprint Eviction (runs before done/done_verified eviction)

Triggered: always on entry to task-archive (sprint check is cheap).

1. Apply canonical status migration (§ 1.3 of ORCH-STATE-SCHEMA-HARDENING brief) in-memory on the jq pipeline — do NOT require a separate migration pass.
2. Run eviction predicate (§ 2.1 of brief) to identify evictable sprints.
3. For each evictable sprint: write full object to cold; write stub to closed_sprints[]; remove from active_sprints[].
4. Quarantine null-id sprints unconditionally.
5. Validate (scripts/orch-state-validate.sh) before rename.
```

---

## 3. TASK STUB INSIDE SPRINTS

### 3.1 Problem

Tasks inside `active_sprints` carry 30+ prose and audit fields inline. One VN-MACRO-TOOLING task carries ~700 chars of `note` + `probe_verdict` + multiple commit hashes + agent IDs. 20 tasks × avg 3.3 KB = 66 KB for one sprint. This is 12% of the total hot file for prose that agents never need during routine planning.

### 3.2 Hot field set (keep in active_sprints tasks)

```jsonc
{
  "id": "...",            // required — identity
  "title": "...",         // required — planning
  "status": "...",        // required — canonical enum value
  "owner": "...",         // required — routing
  "zone": "...",          // required — routing
  "priority": "...",      // required — ordering
  "size": "...",          // required — scheduling
  "type": "...",          // required — classification
  "depends": [],          // required — dependency resolution
  "wave": null,           // conditional — parallelism batching
  "verify_note": "...",   // optional — status qualifier (non-authoritative, tiny)
  "detail_ref": "docs/data/orch/archive/backlog-detail.json#<task-id>"  // pointer to prose
}
```

### 3.3 Cold fields (move to backlog-detail.json#<task-id>)

ALL of the following fields are moved out of the hot task object:

**Prose:** `note`, `probe_verdict`, `live_verify_verdict`, `qa_verdict`, `router_verdict`, `dev_result`, `gate_reason`, `probe5_note`, `dispatch_note`, `router_dev_reverify_verdict`, `status_note`, `dispatch_contract`, `live_contract`

**Audit timestamps:** `dispatched_at`, `done_at`, `done_verified_at`, `probe5_gate_at`, `unblocked_at`

**Agent references:** `done_agent`, `qa_agent`, `live_verify_agent`, `dispatch_agent`, `dispatch_unit`

**Commit hashes:** `dev_commit`, `done_commit`, `probe_commit`, `live_verify_commit`

**Block tracking:** `blocks`, `blocks_fields`, `unblocked_by`, `serial_dispatch_order`

**Dev detail:** `data_source`, `files_create`, `files_modify`, `mcp_tool`, `merge_gate`, `zone_a_endpoint`, `zone_a_response_dto`

### 3.4 detail_ref format

```
"detail_ref": "docs/data/orch/archive/backlog-detail.json#<task-id>"
```

Same format already in use for backlog items (verified: `docs/data/orch/orch-state.json .task_board.backlog[0].detail_ref`). No new convention.

### 3.5 Write rule for new tasks

When PM or dev-team writes a new task to an active sprint:
1. Write ONLY the 10 hot fields + `detail_ref` to the sprint task array.
2. Write the full task object (all fields) to `docs/data/orch/archive/backlog-detail.json` under `#<task-id>`.
3. `backlog-detail.json` is append-only; task-id is the lookup key.

### 3.6 One-time migration

For all existing tasks in active sprints that have prose fields:
1. Extract full task object → write to `backlog-detail.json#<task-id>` (if not already present).
2. Strip prose fields from hot task object, leaving only hot field set + `detail_ref`.
3. Run under commit-mutex. Single atomic write for the whole active_sprints array.

**PM can use this jq skeleton:**
```bash
# strip prose from all active_sprint tasks (run under commit-mutex)
COLD_FIELDS='["note","probe_verdict","live_verify_verdict","qa_verdict","router_verdict",
  "dev_result","gate_reason","probe5_note","dispatch_note","router_dev_reverify_verdict",
  "status_note","dispatch_contract","live_contract","dispatched_at","done_at",
  "done_verified_at","probe5_gate_at","unblocked_at","done_agent","qa_agent",
  "live_verify_agent","dispatch_agent","dispatch_unit","dev_commit","done_commit",
  "probe_commit","live_verify_commit","blocks","blocks_fields","unblocked_by",
  "serial_dispatch_order","data_source","files_create","files_modify","mcp_tool",
  "merge_gate","zone_a_endpoint","zone_a_response_dto"]'
jq --argjson CF "$COLD_FIELDS" '
  .task_board.active_sprints[].tasks[]? |=
    (. + {"detail_ref": ("docs/data/orch/archive/backlog-detail.json#" + .id)})
    | delpaths([$CF[] | [.]])
' orch-state.json > /tmp/orch-stubbed.json
```

---

## 4. WRITE-GATE — scripts/orch-state-validate.sh

### 4.1 Contract

**File:** `scripts/orch-state-validate.sh`
**Signature:** `bash scripts/orch-state-validate.sh <path-to-json>`
**Exit 0:** valid. **Non-zero:** validation failed (error message to stderr).
**Wire-in point:** every atomic write, AFTER `jq > "$TMP"`, BEFORE `mv "$TMP" "$FILE"`.

Pattern:
```bash
bash "$PROJECT_ROOT/scripts/orch-state-validate.sh" "$TMP" \
  || { rm -f "$TMP"; echo "[orch-write] ABORTED: validation failed" >&2; exit 1; }
```

### 4.2 Validation checks (in order — fail fast)

```bash
#!/usr/bin/env bash
# scripts/orch-state-validate.sh
set -euo pipefail
FILE="${1:?usage: orch-state-validate.sh <path>}"

# G-1: JSON validity
jq empty "$FILE" 2>&1 || { echo "[validate] G-1 FAIL: invalid JSON" >&2; exit 1; }

# G-2: Structural sentinel (all three root lanes present)
jq -e '.head != null and .task_board != null and .signal_queue != null' "$FILE" > /dev/null \
  || { echo "[validate] G-2 FAIL: missing root key (head|task_board|signal_queue)" >&2; exit 2; }

# G-3: Lane types are arrays
jq -e '
  (.task_board.active_sprints | type) == "array" and
  (.task_board.backlog | type) == "array" and
  (.task_board.done | type) == "array" and
  (.signal_queue.rows | type) == "array"
' "$FILE" > /dev/null \
  || { echo "[validate] G-3 FAIL: lane type not array" >&2; exit 3; }

# G-4: No null sprint ids in active_sprints
NULL_SPRINT_COUNT=$(jq '[.task_board.active_sprints[] | select(.id == null)] | length' "$FILE")
if [ "$NULL_SPRINT_COUNT" -gt 0 ]; then
  echo "[validate] G-4 FAIL: $NULL_SPRINT_COUNT null-id sprint(s) in active_sprints" >&2
  exit 4
fi

# G-5: Task status values are in canonical enum (warn-only until migration complete; change to exit 5 post-migration)
ENUM='["BACKLOG","TODO","IN_PROGRESS","REVIEW","QA","DONE","DONE_VERIFIED","BLOCKED","DEFERRED","CANCELLED","SKIPPED"]'
BAD_COUNT=$(jq --argjson E "$ENUM" '
  [.task_board.active_sprints[].tasks[]?.status
   | select(. != null)
   | select(. as $s | $E | index($s) == null)]
  | length' "$FILE")
if [ "$BAD_COUNT" -gt 0 ]; then
  echo "[validate] G-5 WARN: $BAD_COUNT non-canonical status value(s) — run migration" >&2
  # exit 5  # UNCOMMENT after one-time migration is complete (SHG-3 AC)
fi

# G-6: head.last_tick and last_tick within 2 hours of each other (if both present)
jq -e '
  if (.head.last_tick != null and .last_tick != null) then
    ((.head.last_tick | fromdateiso8601) - (.last_tick | fromdateiso8601) | fabs) < 7200
  else true end
' "$FILE" > /dev/null \
  || { echo "[validate] G-6 FAIL: head.last_tick and last_tick diverge by >2h" >&2; exit 6; }

echo "[validate] OK: $FILE"
exit 0
```

### 4.3 Wire-in targets

The script must be called by ALL paths that write orch-state.json. Known write paths:

| Writer | File |
|---|---|
| pm task-archive | `docs/agents/pm/flow/task-archive.md` Step 4 |
| pm planning write | `docs/agents/pm/flow/main.md` § atomic write |
| dev-team post-cycle | `docs/agents/dev-team/flow/post-cycle.md` |
| po sprint-signoff | `docs/agents/po/flow/sprint-signoff.md` |
| signal-dashboard §WRITE | `.claude/skills/signal-dashboard/SKILL.md` |
| system-auditor write | `docs/agents/system-auditor/handlers.md` |
| orch-cold-evict.sh | `scripts/orch-cold-evict.sh` (HSC-1 from companion brief) |

Agent-father adds the wire-in call to each file. Developer ensures `scripts/orch-state-validate.sh` is executable (`chmod +x`).

### 4.4 G-5 phase-in protocol

G-5 (status enum check) starts as WARN (exit 0) until the one-time status migration (SHG-3) is confirmed complete. After SHG-3 AC is verified:
- Uncomment `exit 5` in the script.
- From that point, any agent writing a non-canonical status will have its write ABORTED before rename. This prevents future enum drift.

---

## 5. Task Batch for PM

Execution order: SHG-1 (script) → SHG-2 (migration) || SHG-3 (wire-in) → SHG-4 (sprint eviction rule) → SHG-5 (G-5 promote to hard gate).

### SHG-1 — Create scripts/orch-state-validate.sh

```
id: SHG-1
title: Create scripts/orch-state-validate.sh with G-1…G-6 checks
zone: scripts/
owner: developer
priority: HIGH
size: XS
depends: none
ac:
  - File exists at scripts/orch-state-validate.sh, chmod +x
  - G-1 (JSON), G-2 (sentinel), G-3 (lane types), G-4 (null sprint ids) implemented as hard exits
  - G-5 (status enum) implemented as WARN-only (exit 0) initially
  - G-6 (last_tick skew) implemented as hard exit
  - Script is idempotent and side-effect-free (read-only)
  - Test: pass a known-valid snapshot → exit 0; inject null sprint id → exit 4; inject invalid JSON → exit 1
```

### SHG-2 — One-time status enum migration

```
id: SHG-2
title: One-time migration: rewrite all non-canonical status values to canonical enum
zone: docs/data/orch/
owner: pm (runs under commit-mutex)
priority: HIGH
size: XS
depends: SHG-1
ac:
  - Migration applies the full mapping in § 1.3 to .task_board.active_sprints[].tasks[].status,
    .task_board.backlog[].status, .task_board.done[].status
  - verify_note field added where old status had a qualifier suffix (per § 1.3 third column)
  - Sprint-level status migration applied (§ 1.4)
  - SHG-1 validate.sh passes with 0 G-5 warnings post-migration
  - Git commit under commit-mutex: "chore(orch): normalize status enum → canonical 11-value set"
  - No orch-state.json data is lost (only status strings are rewritten + verify_note added)
```

### SHG-3 — Wire validate.sh into all write paths

```
id: SHG-3
title: Wire scripts/orch-state-validate.sh into all orch-state write paths
zone: docs/agents/ + .claude/skills/ + scripts/
owner: agent-father
priority: HIGH
size: S
depends: SHG-1
ac:
  - All 7 write paths listed in § 4.3 call validate.sh before atomic rename
  - Pattern: validate.sh "$TMP" || { rm -f "$TMP"; exit 1; }
  - orch-cold-evict.sh (HSC-1) includes the wire-in
  - No write path bypasses the gate
  - Verified by: triggering a known-bad write attempt and confirming ABORTED message + no rename
```

### SHG-4 — Sprint eviction rule in pm/flow/task-archive.md

```
id: SHG-4
title: Add deterministic sprint eviction § to task-archive.md
zone: docs/agents/pm/
owner: agent-father (via agent-md-factory discipline)
priority: HIGH
size: S
depends: SHG-2 (migration must complete so eviction predicate works against canonical values)
ac:
  - task-archive.md gains § Sprint Eviction section (spec in § 2.5 of this brief)
  - Eviction predicate uses TERMINAL_SET = DONE|DONE_VERIFIED|CANCELLED|DEFERRED|SKIPPED
  - null-id sprints are quarantined unconditionally
  - closed_sprints[] stub format matches § 2.2
  - cold archive receives full sprint objects
  - Post-SHG-4 run: active_sprints count drops from 18 to ≤5 (only sprints with live tasks remain)
  - Commit: "chore(pm): sprint eviction rule — deterministic terminal-set predicate"
```

### SHG-5 — Promote G-5 to hard gate

```
id: SHG-5
title: Uncomment exit 5 in validate.sh — G-5 becomes hard gate post-migration
zone: scripts/
owner: developer
priority: NORMAL
size: XS
depends: SHG-2 (migration done), SHG-3 (wire-in done)
ac:
  - scripts/orch-state-validate.sh line `# exit 5` uncommented
  - Verification: jq-write with status="done" (lowercase) → validate.sh exits 5 → write aborted
  - Any future agent writing non-canonical status has write blocked before rename
  - Commit: "chore(validate): promote G-5 status-enum check to hard gate"
```

---

## 6. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| SHG-2 migration concurrent with writer | HIGH | claim commit-mutex before running migration jq |
| G-5 hard gate (SHG-5) blocks a writer still using legacy spelling | MED | All write paths updated in SHG-3 before SHG-5 runs; agent-father verifies via grep |
| SHG-4 eviction removes a sprint pm considers active | LOW | Eviction predicate is conservative: only evicts when ALL tasks are TERMINAL. Any BLOCKED/IN_PROGRESS task prevents eviction. |
| backlog-detail.json missing an id after SHG-4 task-stub migration | LOW | Write to backlog-detail.json is a prerequisite step in SHG-4 AC; validate by id lookup before rename |
| VN-MACRO-TOOLING flips to evictable mid-session | LOW | Eviction is idempotent; next task-archive run will pick it up cleanly |

---

## 7. Dependency on Companion Brief

This brief is **independent** of HSC-1…HSC-7 from `2026-06-26-orch-state-hot-cold-split.md` EXCEPT:
- `scripts/orch-cold-evict.sh` (HSC-1) must include the validate.sh wire-in (SHG-3 covers this).
- SHG-4 sprint eviction uses the cold archive target (`docs/data/orch/archive/2026-06.json`) created by HSC-1.
- PM may run SHG-1/SHG-2/SHG-3 before HSC-1 completes — no dependency in that direction.

Recommended execution order across both briefs:
```
SHG-1 (validate.sh) → SHG-2 (migration) → HSC-1 (eviction script, includes validate wire-in)
  → SHG-3 (wire remaining write paths) → HSC-2 (one-time bloat eviction) → SHG-4 (sprint rule)
  → SHG-5 (hard gate) → HSC-3…HSC-7 (flow updates, meta collapse)
```

---

_Brief owner: agents-architect. Implementation routing: SHG-1/SHG-5 → developer; SHG-2/SHG-4 → pm; SHG-3 → agent-father._
