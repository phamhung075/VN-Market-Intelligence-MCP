> Parent: [../../../.claude/agents/system-auditor.md](../../../.claude/agents/system-auditor.md)

# System Auditor — Audit Dimensions

<!-- size-justification: 166L — canonical dimension registry; each dimension is a one-table entry + acceptance reference. Tightly coupled check-ID traceability. A-01-EXPECTED-SET fix (2026-06-02) adds host_runtime_set gating note to D1. -->

This file is the canonical registry of what system-auditor checks and why. Each dimension maps to check IDs in `docs/agents/system-auditor/flow/main.md` and acceptance criteria in architecture briefs.

---

## D1: Microservice Runtime Health

**Tier:** 1 (every 30 min)
**Check IDs:** A-01 through A-31
**Scope:** Container liveness, health endpoint HTTP 200, restart count, memory pressure, tooling presence (pdftoppm/tesseract/vie lang), inter-service connectivity.
**Pass condition:** All services in `host_runtime_set.services[]` (SSOT: `docs/data/system-map.json .infrastructure.docker.host_runtime_set`) are Up, health 200, restarts ≤ 2, memory < 85%, tooling present. Services in `not_deployed_by_design[]` are INFO/grey — never checked, never emit CRITICAL/WARN.
**A-01-EXPECTED-SET fix (2026-06-02):** Severity is gated on `host_runtime_set.services[]`, not the full compose service list. Not-deployed-by-design services emit `"[A-01] <id>: not-deployed-by-design — SKIP (INFO/grey)"` and are silently skipped. No BUG alert. No DASHBOARD row.
**Finding category (dedup namespace):** `microservice_degraded` (API `signal_type` field = `signal_feedback`; category carried in `payload.title`/`dedup_key` prefix)

---

## D2: Data Fetch Integrity

**Tier:** 2 (every 4h)
**Check IDs:** B-01 through B-13
**Scope:** Per-source fetch freshness vs `expected_cadence_hours` in `docs/data/system-map.json`, VPS proxy health (7 geo-blocked routes), BCTC PDF landing, SSC URL shape, rate limits, cron fire gaps.
**Pass condition:** All sources within `stale_threshold_hours`, VPS routes status=ok, no SSC URLs in bctc_queue, no source at 100% rate limit.
**Finding category (dedup namespace):** `data_stale` (API `signal_type` field = `signal_feedback`; category carried in `payload.title`/`dedup_key` prefix)

---

## D3: DB Write Integrity

**Tier:** 3 (daily 02:00Z)
**Check IDs:** C-01 through C-16
**Scope:** Row count distributions across 6 SQLite DBs, watchlist coverage (≥ 25 of active tickers), schema sentinels, cross-table consistency (orphaned alerts), WAL size, PRAGMA integrity_check, EPIPE crash accumulation.
**Pass condition:** All 16 checks pass per thresholds in `docs/agents/system-auditor/flow/main.md` §Tier-3.
**Finding category (dedup namespace):** `db_integrity_breach` (API `signal_type` field = `signal_feedback`; category carried in `payload.title`/`dedup_key` prefix)

---

## D4: orch-state.json task_board / task-lock Coherence

**Tier:** 3 (daily 03:00Z — offset from D3 at 02:00Z to avoid I/O contention)
**Check IDs:** D4-R1 through D4-R4 (see handler steps R-1 to R-4 in `docs/agents/system-auditor/handlers.md`)
**Brief:** `docs/architecture-briefs/2026-05-21-tasks-md-hardening.md` §3 Option A + §6 AC-1..AC-5
**Sprint:** 1965 Phase 1

### Checks

| Check | Description | Pass condition |
|-------|-------------|---------------|
| D4-R1 | `task_list_held(kind="sprint-task", expired=false)` MCP call | Tool responds (empty or populated); empty AND `orch-state.json .head.active_task_id` non-null → alert |
| D4-R2 | orch-state.json `.head` cross-check | `.head.active_task_id` matches the held lock task_id (or both null) |
| D4-R3 | `.task_board` owner/status cross-check | For each held lock: task_board entry exists, owner matches `task_locks.owner_agent`, status = `IN_PROGRESS` |
| D4-R4 | git log concurrent-commit detection | No two commits to `docs/data/orch/orch-state.json` land within a 30-second window |

### Acceptance criteria

| AC | Check | Pass condition |
|----|-------|---------------|
| AC-1 | `task_list_held` fires at 03:00Z | Tool call appears in session log at 03:00Z ± 5min |
| AC-2 | Divergence → `orch-state.json .signal_queue` row `to: "po"` | Row emitted within 24h of divergence event |
| AC-3 | No divergence → no false-positive row | Clean day: zero signal_queue rows from D4 with `to: "po"` |
| AC-4 | orch-state/lock mismatch detected | `task_list_held` empty + `.head.active_task_id` non-null → signal_queue alert emitted |
| AC-5 | Concurrent orch-state.json commits detected | Two commits within 30s on `docs/data/orch/orch-state.json` → signal_queue alert emitted |

### Failure modes

See `docs/agents/system-auditor/handlers.md` §TASKS.md Reconciliation Pass → Failure modes.

### Signal bus

- `orch-state.json` `.signal_queue` row `to: "po"` (po reads `.signal_queue` at every cycle Step 0 per `docs/agents/po/flow/main.md`)
- BUG channel: new divergences only (dedup 7d, key pattern: `d4_tasksmd_lock_diverge:<task_id>`)
- Signal type: `system_issue`

### Not in scope for D4

- Auto-fixing TASKS.md status — detect and alert only (brief §3 Option A constraint)
- Writing to `coordination.db` — read-only via `task_list_held`
- Enforcing task-lock TTL — MCP server manages TTL independently
- Sprint 1966 Option C echo cron — deferred post 1965c soak (gated on 2026-05-22T21:00Z)

---

## D-N: Concurrent-Write mtime Detection (orch-state.json)

**Tier:** 3 (daily 03:00Z — runs with D4)
**Check IDs:** DN-W1, DN-W2
**Brief:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` ITEM-21
**Sprint:** 1967c (detection mechanism; long-term fix deferred — Option C task_status_echo table)

### Checks

| Check | Description | Pass condition |
|-------|-------------|---------------|
| DN-W1 | mtime delta on `docs/data/orch/orch-state.json` | No two distinct mtime stamps within the same 15-min window (i.e. mtime changes ≥ 2 times in any 15-min bucket detected via git log `--follow --diff-filter=M`) |

### Detection algorithm

```
for each target_file in [docs/data/orch/orch-state.json]:
  commits = git log --oneline --follow --diff-filter=M --format="%H %ai" -- <target_file> | head -20
  bucket each commit timestamp into 15-min windows (floor to nearest :00/:15/:30/:45)
  for each window:
    if len(commits_in_window) >= 2:
      send_telegram(channel="work",
        message="[system-auditor] D-N: concurrent writes detected on <target_file> — " +
        len(commits_in_window) + " commits in 15-min window " + window_key +
        " (last-writer-wins risk). Escalate to po.")
      write signal_queue row: {to: "po", type: "concurrent-write-alert", summary: "concurrent writes on orch-state.json window:" + window_key}
```

### Acceptance criteria

| AC | Check | Pass condition |
|----|-------|---------------|
| AC-1 | DN-W1 fires at 03:00Z | Git log call appears in session log at 03:00Z ± 5min |
| AC-2 | Concurrent writes detected → WORK alert + signal_queue row | Alert emitted within 24h of concurrent-write event |
| AC-3 | No concurrent writes → no false-positive alert | Clean day: zero D-N alerts |

### Failure modes

| Failure | Behavior |
|---|---|
| git log non-zero exit | Log WARN, skip D-N this cycle — do not block D4 |
| `docs/data/orch/orch-state.json` missing | Log WARN, skip D-N this cycle |

### Not in scope for D-N

- Auto-merging or serializing concurrent writes (detection only)
- Monitoring orch-state.json `.signal_queue` concurrent writes (lower risk tier — deferred)
- Long-term fix: task_status_echo table (Option C, future sprint)

---

## D5: Notebook Overflow Risk

**Tier:** 2 (every 4h — runs with D2)
**Check IDs:** [sau-d5-NbOverflow]
**Scope:** All agent notebook files at `docs/agent-memory/notebooks/*.md`. Checks line count against 150L hard cap.
**Pass condition:** Zero notebooks exceed 150L. Any notebook ≥150L triggers a WORK channel alert.
**Signal type:** `system_issue`
**Sprint:** 1967 ITEM-04 (market-watcher identity recurrence fix)

### Checks

| Check | Description | Pass condition |
|-------|-------------|---------------|
| D5-N1 | Line count of each `docs/agent-memory/notebooks/*.md` | All files ≤ 150L |

### Failure modes

| Failure | Behavior |
|---|---|
| Any notebook > 150L | Send WORK telegram: `"[system-auditor] Notebook overflow: <filename> = <N>L (threshold 150L)"` |
| `docs/agent-memory/notebooks/` unreadable | Log WARN, skip D5 this cycle |

### Rationale

Notebook context overflow is the root cause of identity-assertion failures in cowork agents (TASK_1967-04). A growing notebook can exhaust the context window, silently truncating YAML identity stanza fields (name, color, description). This guard catches overflow before it causes agent identity drift.

### Handler

See `docs/agents/system-auditor/handlers.md` §Step D5.
