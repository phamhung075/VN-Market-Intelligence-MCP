---
name: anomaly-task-bridge
description: >
  Turns persistent unacknowledged infrastructure anomalies (DASHBOARD.md rows
  older than 2h) into repair_task_request signals for PO → TASKS.md planning.
  PLAN-ONLY. Invoked by system-auditor Tier-2 and Tier-3 only.
---

# Skill: anomaly-task-bridge

**SSOT brief:** `docs/architecture-briefs/2026-05-31-anomaly-to-dev-task-bridge.md`
**Size cap:** 120L — `.claude/skills/**/*.md` class (`docs/data/file-size-caps.json`)

---

## Inputs

| Input | Source |
|---|---|
| `AUDIT_TIER` | Inherited from system-auditor (1 / 2 / 3) |
| `PROJECT_ROOT` | From skill: `.claude/skills/project-root/SKILL.md` (already loaded) |

---

## Steps

**ATB-0 — Scope gate:** `AUDIT_TIER = 1` → log `"[ATB] Tier-1: skip"` → EXIT.

**ATB-1 — Collect open anomalies:** Read `$PROJECT_ROOT/docs/signals/DASHBOARD.md`.
If missing → log `"[ATB] WARN: DASHBOARD.md not found — skip ATB pass"` → EXIT.
Collect `## po` rows where: `status = NEW`, `type ∈ {microservice_degraded, data_stale, db_integrity_breach, system_issue}`, `row.ts < now() - 2h`.
Extract per row: `row.id`, `row.ts`, `row.from`, `row.type`, `row.summary`, `row.payload` (check_id + zone_owner if present).

**ATB-2 — Classify severity:**

| DASHBOARD type | Severity class | Cooldown | Priority |
|---|---|---|---|
| `microservice_degraded` | INFRA | 24h | HIGH |
| `db_integrity_breach` | DATA | 24h | HIGH |
| `data_stale` | PIPELINE | 48h | MEDIUM |
| `system_issue` | OPS | 24h | MEDIUM |

**ATB-3 — Dedup guard:** Dedup key: `atb_task:<row.type>:<check_id_or_slug>` (slug = first 20 chars of summary, lower, spaces→hyphens).

For each row, before emitting:
1. Query `signals_processed` via MCP `task_list_held` for matching `dedup_key` + `type=repair_task_created` within cooldown. Found → log dedup skip → SKIP row. Unavailable → log WARN, rely on step 2 only.
2. Read `$PROJECT_ROOT/docs/TASKS.md` (missing → log WARN, skip this check). Scan for open row (Status ∈ BACKLOG/In Progress/OPEN) with matching `check_id` in title/taskId. Found → log dedup skip → SKIP row.
3. Neither match → proceed to ATB-4.

**ATB-4 — Build and emit signal:** Resolve `zone_owner` from `docs/data/system-map.json` zones[].
`suggested_sprint_class`: `microservice_degraded`/`db_integrity_breach` → `"FIX"`, others → `"CHORE"`.

Signal payload shape (written to `docs/signals/atb-<YYYYMMDDTHHmmss>Z.json`):
```json
{
  "from": "system-auditor", "to": "po", "type": "repair_task_request",
  "priority": "<HIGH|MEDIUM>", "createdAt": "<UTC ISO-8601>",
  "payload": {
    "dedup_key": "atb_task:<type>:<slug>",
    "check_id": "<from DASHBOARD row>",
    "anomaly_type": "<row.type>",
    "severity_class": "<INFRA|DATA|PIPELINE|OPS>",
    "summary": "<row.summary ≤80 chars>",
    "zone_owner": "<from system-map.json zones[]>",
    "dashboard_row_id": "<row.id>",
    "suggested_sprint_class": "<FIX|CHORE>",
    "cooldown_hours": "<24|48>"
  }
}
```
Append to DASHBOARD.md `## po`:
```
| atb-<ts> | <ts> | system-auditor | repair_task_request | <summary ≤40 chars> | NEW | docs/signals/atb-<ts>Z.json |
```

**ATB-5 — Mark source rows READ:** For each row from ATB-1 (emitted or skipped), mark `NEW → READ` per signal-dashboard ACK.

**ATB-6 — Commit (mutex-guarded):**
→ skill: `.claude/skills/commit-mutex/SKILL.md`
```
own_paths: [docs/signals/atb-<slug>-*.json, docs/signals/DASHBOARD.md]
intent:    "ATB emit {N} repair_task_request signals"
```
Mutex unavailable after 1 retry → log `"[ATB] WARN: mutex unavailable — skip commit"` → EXIT.

**ATB-7 — Log to notebook (no extra commit):**
```
[ATB] Tier-N complete: {N} emitted, {M} dedup-skipped, {K} grace-window-pending
```

---

## Failure modes

| Failure | Behavior |
|---|---|
| DASHBOARD.md missing | Log WARN → EXIT; never fail-loud |
| TASKS.md missing | Log WARN; skip TASKS.md dedup; proceed with emit |
| signals.db unavailable | Skip DB dedup; rely on TASKS.md check; log WARN |
| Mutex unavailable (1 retry) | Log WARN; skip commit; rows NOT marked READ |
| Uncaught exception | Release mutex if held; log ERROR; rows NOT marked READ |

> PLAN-ONLY: emits signals + writes .json. No code edits, no DB schema changes, no auto-fix.
> Phase 2 auto-close is deferred — gated on 2-week Phase 1 soak.
