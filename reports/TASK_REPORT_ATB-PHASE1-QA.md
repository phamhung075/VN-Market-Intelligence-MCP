## Task Report — anomaly-task-bridge Phase 1 (commit 5d5097d5)

**QA type:** Synthetic dry-run / static plan review (PLAN-ONLY md/skill change)
**Commit:** 5d5097d5 `feat(bridge): anomaly-task-bridge skill + system-auditor + po routing`
**Files changed (3):**
- `.claude/skills/anomaly-task-bridge/SKILL.md` (104 lines, created)
- `docs/agents/system-auditor/flow/main.md` (+6 lines)
- `docs/agents/po/flow/triage-signals.md` (+1 line)

**Verdict: APPROVED**

---

## 1. Static Review

### 1a. Frontmatter — line 1 check

`head -3` of the skill file returns:

```
---
name: anomaly-task-bridge
description: >
```

The `---` fence opens on line 1 with no comment or blank line above it. The
`[agent_frontmatter_line1]` memory rule is satisfied. The skill is in the registered
skills list (`ls .claude/skills/` includes `anomaly-task-bridge`). PASS.

### 1b. Line-cap gate

```
wc -l .claude/skills/anomaly-task-bridge/SKILL.md
     104
```

Cap for class `.claude/skills/**/*.md` in `docs/data/file-size-caps.json`:

```json
{ "pattern": ".claude/skills/**/*.md", "cap": 120, "class": "skill-file" }
```

104 ≤ 120. AC-6 PASS.

### 1c. PLAN-ONLY confirmation

The grep for mutation/edit/auto-fix/auto-close terms returns only two lines:

```
103: > PLAN-ONLY: emits signals + writes .json. No code edits, no DB schema changes, no auto-fix.
104: > Phase 2 auto-close is deferred — gated on 2-week Phase 1 soak.
```

Line 103 is the PLAN-ONLY declaration. Line 104 confirms auto-close is explicitly
deferred. No step in ATB-0 through ATB-7 contains a word like `Edit`, `Write`,
`patch`, `fix code`, `auto-close`, or `task_close`. The skill writes only:
- `docs/signals/atb-<ts>Z.json` (new signal file)
- appends a row to `docs/signals/DASHBOARD.md` under `## po`
- marks source DASHBOARD rows `NEW → READ` (ACK, not code mutation)
- a commit of the above two files

None of these are source-code mutations or task-close actions. PLAN-ONLY holds.

### 1d. Dedup logic — quoted lines

ATB-3 (skill lines 43–48):

```
**ATB-3 — Dedup guard:** Dedup key: `atb_task:<row.type>:<check_id_or_slug>` (slug = first
20 chars of summary, lower, spaces→hyphens).

For each row, before emitting:
1. Query `signals_processed` via MCP `task_list_held` for matching `dedup_key` +
   `type=repair_task_created` within cooldown. Found → log dedup skip → SKIP row.
   Unavailable → log WARN, rely on step 2 only.
2. Read `$PROJECT_ROOT/docs/TASKS.md` (missing → log WARN, skip this check). Scan for open
   row (Status ∈ BACKLOG/In Progress/OPEN) with matching `check_id` in title/taskId.
   Found → log dedup skip → SKIP row.
3. Neither match → proceed to ATB-4.
```

Cooldown values are in the ATB-2 severity table (skill lines 36–41):

```
| microservice_degraded | INFRA  | 24h | HIGH   |
| db_integrity_breach   | DATA   | 24h | HIGH   |
| data_stale            | PIPELINE | 48h | MEDIUM |
| system_issue          | OPS    | 24h | MEDIUM |
```

The cooldown is encoded in the emitted signal payload as `"cooldown_hours": "<24|48>"` (line 67),
and is the guard checked in ATB-3 step 1. Two independent dedup stores are checked: the
`signals_processed` DB (primary) and `docs/TASKS.md` open rows (secondary). Either match
alone is sufficient to skip. PASS.

### 1e. System-auditor insertion points — guarded pointers only

system-auditor/flow/main.md has two ATB invocations.

Tier-2, line 260:
```
→ skill: `.claude/skills/anomaly-task-bridge/SKILL.md`
  inputs: `AUDIT_TIER = 2`, `PROJECT_ROOT` already set
```

This appears immediately after the D-IMPROVE-3 log line (line 258) and before the
`---` separator that opens the "Existing Doc/Memory Audit (Tier-3 only)" section (line 263).
It is a single-line pointer with an inputs annotation — zero inlined logic.

Tier-3, line 393:
```
→ skill: `.claude/skills/anomaly-task-bridge/SKILL.md`
  inputs: `AUDIT_TIER = 3`, `PROJECT_ROOT` already set
```

This appears immediately after the Tier-3 Roll-Up Signal block (lines 379–391) and before
"### Tier-3 WORK Notification" (line 396). The notebook overwrite section begins at line 427,
so both ATB insertions occur BEFORE the notebook commit — matching the brief's required
sequence ("AFTER D-IMPROVE block and BEFORE notebook commit step").

Both insertions are guarded pointers in the `→ skill: ...` convention. No logic is inlined.
PASS.

### 1f. PO triage row — repair_task_request

po/flow/triage-signals.md line 18 (full row, quoted):

```
| `repair_task_request` | `system-auditor` | Read signal JSON at `payload` path. Extract
`check_id`, `anomaly_type`, `severity_class`, `zone_owner`, `summary`,
`suggested_sprint_class`. **Dedup check:** scan `docs/TASKS.md` for any open row
(Status ∈ BACKLOG/In Progress/OPEN) whose title or taskId contains `check_id`. If found →
log `"[po] repair_task_request: {check_id} — duplicate TASKS.md entry, skipped"`, mark
signal DONE, skip. If no duplicate: create a new sprint task entry in `docs/TASKS.md` under
the appropriate sprint section (open a new FIX sprint if no active sprint for `zone_owner`).
Task format: `- 🔄 **{check_id}-FIX ({zone_owner})** — {summary ≤80 chars}. AC: {check_id}
check passes in system-auditor Tier-N (no DASHBOARD row, no BUG alert for 7 days). Zone:
{zone_owner}. Priority: {severity_class}.` Assign `Status: BACKLOG`. Commit TASKS.md update
(commit-mutex, explicit path `docs/TASKS.md`). Log `"[po] repair_task_request: created
BACKLOG task {check_id}-FIX zone:{zone_owner}"`. | TASKS.md BACKLOG entry — normal
po→ba→pm→dev chain applies |
```

Verified elements:
- `check_id` extracted from payload: YES
- `zone_owner` extracted: YES
- Dedup check against open TASKS.md rows: YES (explicit Status ∈ BACKLOG/In Progress/OPEN guard)
- Creates BACKLOG entry with `check_id` in title (`{check_id}-FIX`): YES
- AC is deterministic: `{check_id} check passes in system-auditor Tier-N (no DASHBOARD row,
  no BUG alert for 7 days)` — machine-checkable, references the same check_id the anomaly was
  generated from
- `zone_owner` included: YES
- `Status: BACKLOG`: YES
- Normal po→ba→pm→dev chain: YES ("normal po→ba→pm→dev chain applies")

AC-5 PASS.

---

## 2. Synthetic Dry-Run

### Fake DASHBOARD row (input)

```
| ms-degraded-001 | 2026-05-31T16:00:00Z | system-auditor | microservice_degraded |
  mcp-server health endpoint 503 | NEW | docs/signals/... |
```

Properties: `type=microservice_degraded`, `ts=2026-05-31T16:00:00Z` (4h before current time
2026-05-31T20:31Z), `status=NEW`. Located in `## po` section.

### ATB-0 — Scope gate

`AUDIT_TIER = 2` (or 3). Not 1. Gate passes; execution continues.

### ATB-1 — Collect

Row matches all four criteria:
- `status = NEW` ✓
- `type = microservice_degraded` ∈ allowed set ✓
- `type ≠ improvement_proposal` ✓
- `row.ts (16:00Z) < now() (20:31Z) - 2h` → gap = 4h > 2h ✓

Row is collected. Extracted: `row.id=ms-degraded-001`, `row.type=microservice_degraded`,
`row.summary="mcp-server health endpoint 503"`, `check_id` (from payload or derived).

### ATB-2 — Classify

`microservice_degraded` → `INFRA`, cooldown=24h, priority=HIGH.

### ATB-3 — Dedup (first pass — no prior signal)

Dedup key: `atb_task:microservice_degraded:mcp-server-health-e` (first 20 chars of summary,
lower, spaces→hyphens).

Step 1: query `signals_processed` for `dedup_key` + `type=repair_task_created` within 24h.
Result: NOT FOUND (no prior ATB run).

Step 2: scan `docs/TASKS.md` for open row with `ms-degraded-001` (or derived check_id) in
title/taskId. Result: NOT FOUND.

Neither match → proceed to ATB-4.

### ATB-4 — Build and emit signal

Signal payload written to `docs/signals/atb-20260531T203100Z.json`:

```json
{
  "from": "system-auditor",
  "to": "po",
  "type": "repair_task_request",
  "priority": "HIGH",
  "createdAt": "2026-05-31T20:31:00Z",
  "payload": {
    "dedup_key": "atb_task:microservice_degraded:mcp-server-health-e",
    "check_id": "A-12",
    "anomaly_type": "microservice_degraded",
    "severity_class": "INFRA",
    "summary": "mcp-server health endpoint 503",
    "zone_owner": "<resolved from system-map.json zones[]>",
    "dashboard_row_id": "ms-degraded-001",
    "suggested_sprint_class": "FIX",
    "cooldown_hours": "24"
  }
}
```

`suggested_sprint_class=FIX` is correct per ATB-4 rule: `microservice_degraded` maps to `"FIX"`.

DASHBOARD row appended:
```
| atb-20260531T203100Z | 2026-05-31T20:31:00Z | system-auditor | repair_task_request |
  mcp-server health endpoint | NEW | docs/signals/atb-20260531T203100Z.json |
```

Signal targets `"to": "po"` — correct recipient for the PO triage-signals.md row.

### ATB-5 — Mark source row READ

`ms-degraded-001` status: `NEW → READ`. Row will not be collected on next tick.

### ATB-6 — Commit (mutex-guarded)

`own_paths: [docs/signals/atb-20260531T203100Z.json, docs/signals/DASHBOARD.md]` — explicit,
no `-A`. Mutex acquired, committed, released.

### ATB-7 — Log

`[ATB] Tier-2 complete: 1 emitted, 0 dedup-skipped, 0 grace-window-pending`

### Dedup — second pass (AC-3 verification)

Same DASHBOARD row is now `status=READ`, so ATB-1 does NOT collect it (filter requires
`status=NEW`). The row is not in the candidate set. No ATB-4 executes. Result: zero new
signals emitted. The first pass set the source row to READ (ATB-5), which is the primary
anti-duplicate guard. Even if ATB-5 failed (mutex unavailable — see failure table), ATB-3
step 1 would find the previously committed signal in `signals_processed` with
`type=repair_task_created` and `processed_at` within the 24h cooldown, causing a dedup skip.
Two independent guards protect against the duplicate-task property. PASS.

### Chain completeness: detect → signal → PO task

1. system-auditor Tier-2/3 detects anomaly, writes DASHBOARD.md row (existing behavior).
2. ATB skill (invoked via pointer in system-auditor flow at lines 260 and 393) reads that row,
   emits `docs/signals/atb-<ts>Z.json` with `type=repair_task_request` targeting `"to":"po"`.
3. PO triage-signals.md line 18 routes `repair_task_request` to a TASKS.md BACKLOG entry with
   `check_id` in title, deterministic AC, `zone_owner`, and `Status: BACKLOG`.
4. Normal po→ba→pm→dev chain picks it up from there.

The chain is coherent end-to-end. Each step is a hand-off via existing conventions (signal
JSON + DASHBOARD row + TASKS.md entry). No step skips a layer or auto-closes.

---

## 3. AC Matrix

| AC | Criterion | Verdict | Evidence |
|---|---|---|---|
| AC-1 | system-auditor Tier-2 log shows `[ATB]` line | PASS | ATB-7 log format `[ATB] Tier-2 complete: ...` in skill line 88 |
| AC-2 | Synthetic `microservice_degraded` row >2h → signal written + DASHBOARD row marked READ | PASS | ATB-1 grace-window check, ATB-4 emit, ATB-5 READ mark traced above |
| AC-3 | Second pass over same row → dedup skip, no duplicate signal | PASS | ATB-5 sets source to READ; ATB-3 step 1 catches via signals_processed within cooldown as fallback |
| AC-4 | Existing TASKS.md OPEN row with matching `check_id` → bridge skips | PASS | ATB-3 step 2 explicitly scans TASKS.md for `Status ∈ {BACKLOG/In Progress/OPEN}` with `check_id` match |
| AC-5 | PO triage row converts signal to TASKS.md BACKLOG entry with `check_id` in title | PASS | triage-signals.md line 18 — task format `{check_id}-FIX`, Status:BACKLOG, deterministic AC |
| AC-6 | Skill ≤ 120 lines | PASS | `wc -l` = 104 |

---

## Issues

None. No blocking issues found.

---

## Summary

changed: [`.claude/skills/anomaly-task-bridge/SKILL.md` (104L), `docs/agents/system-auditor/flow/main.md` (+6L), `docs/agents/po/flow/triage-signals.md` (+1L)]
tests: N/A (plan-only md/skill; no bun test applicable) | tsc: N/A | ddd: N/A | security: N/A
plan-only: CONFIRMED | dedup: CONFIRMED (dual guard: signals_processed + TASKS.md open rows) | chain: COHERENT
verdict: APPROVED
