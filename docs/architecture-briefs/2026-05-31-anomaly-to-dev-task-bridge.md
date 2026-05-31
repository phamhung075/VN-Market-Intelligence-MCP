# Architecture Brief — Anomaly-to-Dev-Task Bridge

**Slug:** anomaly-to-dev-task-bridge
**Date:** 2026-05-31
**Author:** agents-architect
**Status:** DESIGN ONLY — zero code, zero `.md` edits (this brief only)
**Signal:** `docs/signals/anomaly-to-dev-task-bridge-20260531.json` → agent-father

---

## 0. Purpose

Design a skill that closes the gap between anomaly detection and dev-team planning. The skill is
named `anomaly-task-bridge`. It is NOT a new detection engine and NOT a new self-improvement loop.
It is the serialized, deduped, PO-routed seam that turns a raw DASHBOARD finding into a structured
planned task in `docs/TASKS.md` via the existing po → ba → pm dev chain.

---

## 1. Gap Analysis

### 1a. What Exists

| Capability | Owner | Where output goes | Status |
|---|---|---|---|
| Anomaly detection (runtime/fetch/DB/memory) | system-auditor (D1/D2/D3/D4/D5) | BUG Telegram + DASHBOARD.md `## po` row | LIVE |
| 7-day BUG dedup per `dedup_key` | system-auditor | BUG channel (not TASKS.md) | LIVE |
| Improvement-proposal pipeline (D-IMPROVE) | system-auditor + agents-architect | `docs/improvement-proposals/<id>.md` → PO→agent-father/dev-team | LIVE (Phase 1+2 shipped) |
| PO triage of `improvement_proposal` signals | po (triage-signals.md) | BATCH entry or WORK Telegram | LIVE |
| Dev task intake (PO → BA → PM → dev-*) | dev-team flow | `docs/TASKS.md` sprint entry | LIVE |
| DASHBOARD ACK/CLOSE lifecycle | signal-dashboard skill | DONE rows pruned | LIVE |
| Doc mechanical auto-fix (pointers, size caps) | doc-heal-system / doc-self-heal | In-place .md edits | LIVE |

### 1b. The Validated Gap

The D-IMPROVE pipeline (SELF-IMPROVE-GATE brief 2026-05-27-gated-self-improvement-loop.md §9
EDIT-1) handles candidates sourced from `improve_check_log` (signal-accuracy degradation) and
stale-source findings with `severity=CRITICAL`. But two anomaly classes fall through:

| Anomaly class | D-IMPROVE handles? | BUG Telegram? | Lands in TASKS.md? | Gap? |
|---|---|---|---|---|
| Signal-accuracy degradation (improve_check_log) | YES | WORK only | Via improvement_proposal → BATCH | NO GAP |
| Stale source CRITICAL + no open FIX | PARTIAL (D-IMPROVE-1 mentions it but only for doc-level candidates) | YES | NO — BUG Telegram ≠ planned task | **GAP** |
| Microservice DOWN / restart spike (D1) | NO | YES (dedup 7d) | NO — no sprint task created | **GAP** |
| DB integrity breach (D3: C-01..C-16) | NO | YES (dedup 7d) | NO | **GAP** |
| TASKS.md / lock divergence (D4) | NO | YES (dedup 7d) | NO | **GAP** |
| Notebook overflow (D5) | NO — WORK Telegram only | NO | NO | **PARTIAL GAP** (WORK≠plan) |

**Summary of gap (one paragraph):** The system-auditor detects anomalies and fires BUG/WORK
Telegrams (detection complete). The SELF-IMPROVE-GATE loop converts signal-accuracy proposals into
planned dev tasks (improvement complete). But for the class of hard infrastructure anomalies —
container down, DB breach, data staleness, TASKS.md lock divergence — the path stops at a Telegram
message. There is no mechanical step that says "this anomaly has been open for N hours with no
resolution → create a tracked sprint task so PO/PM can schedule it." The BUG channel is a
notification, not a planning artifact. If no human reads the Telegram and no PO cycle picks it up
manually, the anomaly silently ages. The bridge skill fills exactly this seam.

### 1c. What Must NOT Be Duplicated

| Existing mechanism | Do NOT replace | Do NOT overlap |
|---|---|---|
| D-IMPROVE (improvement_proposal) | This brief targets infrastructure anomalies, not improvement proposals. `weakness_id`-based dedup in D-IMPROVE already guards proposals. The bridge guards repair tasks. Different type, different target section in TASKS.md. | Never emit `improvement_proposal` from the bridge — that is D-IMPROVE's domain. |
| BUG Telegram dedup (7d, dedup_key) | Keep as-is — it is the fast-notification layer. Bridge is the slow-planning layer. | Bridge cooldown MUST use the same `dedup_key` namespace so the two layers agree on "new anomaly" definition. |
| DASHBOARD.md WRITE/READ/ACK/CLOSE | Bridge reads DASHBOARD rows it doesn't create them. system-auditor remains sole DASHBOARD writer for anomaly rows. | Never write a new DASHBOARD row from the bridge — only read and close. |
| doc-heal-system / doc-self-heal | Mechanical doc fixes are not repair tasks. Bridge only emits for runtime/data/DB anomalies (D1/D2/D3/D4). doc-heal handles D5/memory drift independently. | Bridge does NOT emit tasks for doc hygiene findings — those are handled by doc-heal-system → agent-father lane-a path. |

---

## 2. Skill Contract

### Name

`.claude/skills/anomaly-task-bridge/SKILL.md`

### Size cap

≤ 120 lines (`.claude/skills/**/*.md` class — `docs/data/file-size-caps.json`).

### Trigger

**Invoked by system-auditor** at the END of Tier-2 and Tier-3 passes, AFTER D-IMPROVE and AFTER
the anomaly reporting block. Never `trigger: startup`. Never invoked independently.

### Inputs

| Input | Source |
|---|---|
| `anomaly_list[]` | system-auditor's current-pass findings (from DASHBOARD rows already written this tick, type ≠ `improvement_proposal`) |
| `AUDIT_TIER` | Inherited from system-auditor context (1/2/3) |
| `PROJECT_ROOT` | From skill: `.claude/skills/project-root/SKILL.md` (already loaded by system-auditor) |

### Steps (Detect → Classify → Dedup → Emit-Task)

**Step ATB-0 — Scope gate:**
Skip entirely if `AUDIT_TIER = 1`. Tier-1 is liveness ping only; task creation from brief container
pings would create noise. Run only on Tier-2 and Tier-3.

**Step ATB-1 — Collect open anomalies from DASHBOARD:**
Read `docs/signals/DASHBOARD.md` `## po` section. Collect rows where:
- `status = NEW` (not yet acknowledged)
- `type ∈ { microservice_degraded, data_stale, db_integrity_breach, system_issue }`
- `type ≠ improvement_proposal` (those are D-IMPROVE domain, handled separately)
- Row `ts` is older than **2 hours** (grace window — transient blips self-resolve)

For each collected row, extract: `row.id`, `row.ts`, `row.from`, `row.type`, `row.summary`,
`row.payload` (check_id + zone_owner from payload if present).

**Step ATB-2 — Classify severity tier:**

| DASHBOARD type | Severity class | Cooldown | Sprint priority |
|---|---|---|---|
| `microservice_degraded` | INFRA | 24h | HIGH |
| `db_integrity_breach` | DATA | 24h | HIGH |
| `data_stale` | PIPELINE | 48h | MEDIUM |
| `system_issue` (TASKS/lock diverge) | OPS | 24h | MEDIUM |

**Step ATB-3 — Dedup guard (CRITICAL — prevents duplicate sprint tasks):**

Dedup key: `atb_task:<row.type>:<check_id_or_summary_slug>` (reusing same dedup_key namespace
pattern as system-auditor BUG dedup — see system-auditor init.md `dedup_window_days: 7`).

Before emitting any task signal:
1. Read `docs/signals/signals.db` via MCP `task_list_held`:
   query for signals with matching fingerprint in `signals_processed` (type=`repair_task_created`,
   payload containing same `dedup_key`). If found with `processed_at > now() - cooldown` → SKIP.
   Log: `"[ATB] dedup skip: {dedup_key} — cooldown active since {ts}"`.
2. Read `docs/TASKS.md` for any open task row whose `taskId` or title contains the anomaly's
   `check_id`. If found with `Status ∈ {BACKLOG, In Progress, OPEN}` → SKIP.
   Log: `"[ATB] dedup skip: {check_id} — open TASKS.md entry found"`.
3. If no match in either store → proceed to emit.

**Step ATB-4 — Build repair task signal:**

For each anomaly that passes ATB-3:

```
signal = {
  from: "system-auditor",
  to: "po",
  type: "repair_task_request",
  priority: <HIGH|MEDIUM from ATB-2>,
  createdAt: <current UTC ISO-8601>,
  payload: {
    dedup_key: <atb_task:type:slug>,
    check_id: <from DASHBOARD row or derived>,
    anomaly_type: <row.type>,
    severity_class: <from ATB-2>,
    summary: <row.summary ≤ 80 chars>,
    zone_owner: <from system-map.json zone for this service/source>,
    dashboard_row_id: <row.id>,
    suggested_sprint_class: <"FIX" | "CHORE">,
    cooldown_hours: <from ATB-2>
  }
}
```

Write to `docs/signals/<atb-slug>-<YYYYMMDDTHHmmss>Z.json` (path-explicit).
Append to `docs/signals/DASHBOARD.md` under `## po`:
```
| atb-<YYYYMMDDTHHmmss> | <ts> | system-auditor | repair_task_request | <summary ≤40 chars> | NEW | <signal-path> |
```

**Step ATB-5 — Mark source DASHBOARD row READ:**
For each anomaly row consumed in ATB-1, mark `status: NEW → READ` per signal-dashboard skill ACK.
This prevents re-processing on the next tick.

**Step ATB-6 — Commit (mutex-guarded):**
Acquire commit-mutex (`.claude/skills/commit-mutex/SKILL.md`).
```bash
git add docs/signals/<atb-slug>-*.json docs/signals/DASHBOARD.md
git commit -m "chore(bridge): ATB emit {N} repair task requests — {dedup_key_list}"
```
Explicit paths only — never `-A`.
Release mutex regardless of outcome.

**Step ATB-7 — Log:**
```
[ATB] Tier-N complete: {N} tasks emitted, {M} dedup-skipped, {K} grace-window-pending
```
Append to system-auditor notebook in the current Tier-N session entry (no new commit — rides
system-auditor's existing notebook commit at end of cycle).

### Failure modes

| Failure | Behavior |
|---|---|
| `docs/signals/DASHBOARD.md` missing | Log `"[ATB] WARN: DASHBOARD.md not found — skip ATB pass"` → exit skill, never fail-loud |
| `docs/TASKS.md` missing | Log `"[ATB] WARN: TASKS.md not found — skip dedup check step, proceed with signal emit"` |
| `signals.db` unavailable | Skip DB dedup check; rely on TASKS.md check only; log WARN |
| Commit-mutex unavailable after 1 retry | Log WARN, skip this pass (anomaly will be re-evaluated next tick) |
| Any uncaught exception | Release mutex if held; log `"[ATB] ERROR: {msg} — skip pass, source rows NOT marked READ"` |

---

## 3. Invoking Agents + Timing

### Primary invoker: system-auditor

Add one line to `docs/agents/system-auditor/flow/main.md` at the end of Tier-2 and Tier-3 flows,
AFTER the D-IMPROVE block and BEFORE the notebook commit step:

```
→ skill: .claude/skills/anomaly-task-bridge/SKILL.md
   inputs: anomaly_list = current-pass findings, AUDIT_TIER = current tier
```

No new cron. No new agent. The skill rides the existing Tier-2 (every 4h) and Tier-3 (daily 03:00Z)
ticks. Total added wall time: ≤ 15s (DASHBOARD read + TASKS.md read + N signal writes).

### No dedicated cron

Per SELF-IMPROVE-GATE §6 host-load budget rule: NO new always-on cron. The ATB skill is a
read-then-write step appended to an already-scheduled agent cycle. Incremental RAM: 0 MB. Incremental
disk: ~1 KB/signal emitted (≤ 5/day estimated). APPROVED under existing budget envelope.

---

## 4. Dev-Team Intake Format

### Signal consumed by PO triage-signals.md

Add one row to the routing table in `docs/agents/po/flow/triage-signals.md`:

| Signal `type` | From | Action | Routing in Step 1 BATCH |
|---|---|---|---|
| `repair_task_request` | `system-auditor` | Read signal JSON at `payload` path. Extract `check_id`, `anomaly_type`, `severity_class`, `zone_owner`, `summary`, `suggested_sprint_class`. **Dedup check:** find any open TASKS.md row with matching `check_id` in title/taskId — if found → log skip + mark signal DONE; do not create duplicate task. If no duplicate: create a new sprint task entry in `docs/TASKS.md` under the appropriate sprint section (or open a new FIX sprint if no sprint is active for `zone_owner`). Task format: `🔄 **{check_id}-FIX ({zone_owner})** — {summary}. AC: anomaly clears in system-auditor next Tier-N pass ({check_id} check passes). Zone: {zone_owner}`. Assign `Status: BACKLOG`, `Priority: {severity_class}`. Commit TASKS.md update (commit-mutex, explicit path). | TASKS.md sprint entry (BACKLOG) — normal po→ba→pm→dev chain from there |

### TASKS.md row format (machine-readable)

```
- 🔄 **{check_id}-FIX ({zone_owner})** — {summary ≤80 chars}.
  AC: {check_id} check passes in system-auditor Tier-{N} (no DASHBOARD row, no BUG alert for 7 days).
  Zone: {zone_owner from system-map.json zones[]}. Priority: {HIGH|MEDIUM}.
```

This is a standard BACKLOG task. PO can promote it to an active sprint, assign to the relevant
dev-* agent, or defer it. The BA/architect/PM chain applies normally. No special lane — it is
plain FIX work.

### Acceptance-criteria contract

The AC for a `repair_task_request` task is deterministic and machine-checkable:
- system-auditor Tier-N passes without emitting a DASHBOARD row for `check_id` for 7 consecutive days.
- No BUG channel message for `dedup_key` in the same 7-day window.

This satisfies the SELF-IMPROVE-GATE lane-B "hard ungameable gate" criterion if PO later decides to
auto-close it — though Phase 1 keeps it PLAN-ONLY (human-gated via normal sprint flow).

---

## 5. Phase 1 — Thinnest Seam That Works

Phase 1 ships ONLY:

1. **Create** `.claude/skills/anomaly-task-bridge/SKILL.md` (≤ 120L, steps ATB-0 through ATB-7 + failure modes).
2. **Edit** `docs/agents/system-auditor/flow/main.md` — add one skill invocation line at end of Tier-2 block and end of Tier-3 DB-integrity block (two lines total).
3. **Edit** `docs/agents/po/flow/triage-signals.md` — add one routing row for `repair_task_request` signal type.

Three files touched. No new Docker service. No new cron. No new DB table. No new agent definition.

Phase 2 (deferred, PLAN-ONLY for now): auto-close a repair task when system-auditor confirms the
anomaly gone for 7 days — requires `task_close` MCP tool or a system-auditor handler that marks
the TASKS.md row Done when the check passes for 7 consecutive days. Gated on Phase 1 soak (2 weeks).

---

## 6. Explicit "Do Not Duplicate" Notices

| Thing NOT to duplicate | Why |
|---|---|
| D-IMPROVE pipeline (`improvement_proposal` signal type) | D-IMPROVE handles signal-accuracy + doc-drift improvement candidates. ATB bridge handles infrastructure repair tasks. Different signal type, different DASHBOARD target, different TASKS.md sprint class. |
| BUG Telegram dedup (system-auditor `dedup_window_days: 7`) | BUG channel notification is the fast layer. ATB bridge is the slow-planning layer. Both reference the same `dedup_key` namespace so they stay coherent — they do NOT replace each other. |
| doc-heal-system auto-fix | doc-heal handles mechanical doc fixes (dead pointers, size caps). ATB bridge handles runtime/data/DB anomalies only. Never emit ATB tasks for D5 notebook overflow or doc hygiene findings. |
| DASHBOARD.md WRITE logic | system-auditor is the sole DASHBOARD writer for anomaly rows. ATB bridge is a READER + ACK agent only. |
| `signals_processed` fingerprint store | ATB uses the existing `signals_processed` table in `signals.db` for its dedup check. Never creates a parallel dedup store. |

---

## 7. Host-Load Budget (per SELF-IMPROVE-GATE §6 template)

```
New cron/agent: none
Schedule: rides system-auditor Tier-2 (every 4h) and Tier-3 (daily 03:00Z)
RAM: 0 MB incremental (skill runs inline in system-auditor session)
Disk: ~1 KB/signal × ≤5 signals/day = ~5 KB/day to docs/signals/
Tick cost: 0 new Claude tokens/tick (inline skill step, not a new agent)
Fleet context: Docker cap 8GB (project_host_memory_panic); 0 new containers
Decision: APPROVED — zero incremental host footprint
```

---

## 8. Implementation Handoff to Agent-Father

### Files to create

| File | Action | Size |
|---|---|---|
| `.claude/skills/anomaly-task-bridge/SKILL.md` | CREATE — steps ATB-0 through ATB-7 + failure modes table | ≤ 120L |

### Files to edit

| File | Edit | Exact location |
|---|---|---|
| `docs/agents/system-auditor/flow/main.md` | ADD 1 skill invocation line after the D-IMPROVE block (Tier-2) and after Tier-3 DB Integrity checks block, before notebook commit | After `D-IMPROVE-3` log line; after `Tier-3 Roll-Up Signal` block |
| `docs/agents/po/flow/triage-signals.md` | ADD 1 routing row for `repair_task_request` type in the signal routing table | New row after the `improvement_proposal` row |

### Sequence

1. Create `.claude/skills/anomaly-task-bridge/SKILL.md` first.
2. Edit `system-auditor/flow/main.md` — add invocation.
3. Edit `po/flow/triage-signals.md` — add routing row.
4. Commit all three in one atomic commit: `feat(bridge): anomaly-task-bridge skill + system-auditor + po routing`.

### Acceptance criteria (QA gate)

| AC | Check |
|---|---|
| AC-1 | system-auditor Tier-2 session log shows `[ATB]` line |
| AC-2 | A synthetic DASHBOARD row (type=`microservice_degraded`, ts > 2h ago) → signal file written to `docs/signals/` + DASHBOARD row marked READ |
| AC-3 | Same synthetic row run twice → second run logs `[ATB] dedup skip` → no duplicate signal file |
| AC-4 | An existing TASKS.md OPEN row with matching `check_id` → bridge skips → no duplicate TASKS.md entry |
| AC-5 | `po/triage-signals.md` routing row: `repair_task_request` signal → PO creates TASKS.md BACKLOG entry with `check_id` in title |
| AC-6 | New skill file is ≤ 120 lines (wc -l gate) |

---

## 9. Signal to Agent-Father
