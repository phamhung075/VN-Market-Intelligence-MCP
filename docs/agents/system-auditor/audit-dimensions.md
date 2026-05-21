> Parent: [../../../.claude/agents/system-auditor.md](../../../.claude/agents/system-auditor.md)

# System Auditor — Audit Dimensions

<!-- size-justification: ~80L — canonical dimension registry; each dimension is a one-table entry + acceptance reference. Tightly coupled check-ID traceability. -->

This file is the canonical registry of what system-auditor checks and why. Each dimension maps to check IDs in `.claude/flows/system-auditor/main.md` and acceptance criteria in architecture briefs.

---

## D1: Microservice Runtime Health

**Tier:** 1 (every 30 min)
**Check IDs:** A-01 through A-31
**Scope:** Container liveness, health endpoint HTTP 200, restart count, memory pressure, tooling presence (pdftoppm/tesseract/vie lang), inter-service connectivity.
**Pass condition:** All 9 services Up, health 200, restarts ≤ 2, memory < 85%, tooling present.
**Signal type:** `microservice_degraded`

---

## D2: Data Fetch Integrity

**Tier:** 2 (every 4h)
**Check IDs:** B-01 through B-13
**Scope:** Per-source fetch freshness vs `expected_cadence_hours` in `docs/data/system-map.json`, VPS proxy health (7 geo-blocked routes), BCTC PDF landing, SSC URL shape, rate limits, cron fire gaps.
**Pass condition:** All sources within `stale_threshold_hours`, VPS routes status=ok, no SSC URLs in bctc_queue, no source at 100% rate limit.
**Signal type:** `data_stale`

---

## D3: DB Write Integrity

**Tier:** 3 (daily 02:00Z)
**Check IDs:** C-01 through C-16
**Scope:** Row count distributions across 6 SQLite DBs, watchlist coverage (≥ 25 of active tickers), schema sentinels, cross-table consistency (orphaned alerts), WAL size, PRAGMA integrity_check, EPIPE crash accumulation.
**Pass condition:** All 16 checks pass per thresholds in `.claude/flows/system-auditor/main.md` §Tier-3.
**Signal type:** `db_integrity_breach`

---

## D4: TASKS.md / task-lock Coherence

**Tier:** 3 (daily 03:00Z — offset from D3 at 02:00Z to avoid I/O contention)
**Check IDs:** D4-R1 through D4-R4 (see handler steps R-1 to R-4 in `docs/agents/system-auditor/handlers.md`)
**Brief:** `docs/architecture-briefs/2026-05-21-tasks-md-hardening.md` §3 Option A + §6 AC-1..AC-5
**Sprint:** 1965 Phase 1

### Checks

| Check | Description | Pass condition |
|-------|-------------|---------------|
| D4-R1 | `task_list_held(kind="sprint-task")` MCP call | Tool responds (empty or populated); empty AND pipeline-state non-null → alert |
| D4-R2 | pipeline-state.json cross-check | `pipeline-state.activeTaskId` matches the held lock task_id (or both null) |
| D4-R3 | TASKS.md owner/status cross-check | For each held lock: TASKS.md row exists, Owner column matches `task_locks.owner_agent`, Status = `In Progress` |
| D4-R4 | git log concurrent-commit detection | No two commits to `docs/TASKS.md` land within a 30-second window |

### Acceptance criteria

| AC | Check | Pass condition |
|----|-------|---------------|
| AC-1 | `task_list_held` fires at 03:00Z | Tool call appears in session log at 03:00Z ± 5min |
| AC-2 | Divergence → DASHBOARD `## po` row | Row emitted within 24h of divergence event |
| AC-3 | No divergence → no false-positive row | Clean day: zero rows in `## po` from D4 |
| AC-4 | pipeline-state/lock mismatch detected | `task_list_held` empty + `activeTaskId` non-null → DASHBOARD alert emitted |
| AC-5 | Concurrent TASKS.md commits detected | Two commits within 30s on `docs/TASKS.md` → DASHBOARD alert emitted |

### Failure modes

See `docs/agents/system-auditor/handlers.md` §TASKS.md Reconciliation Pass → Failure modes.

### Signal bus

- DASHBOARD row target: `## po` (po reads DASHBOARD at every cycle Step 0 per `.claude/flows/po/main.md`)
- BUG channel: new divergences only (dedup 7d, key pattern: `d4_tasksmd_lock_diverge:<task_id>`)
- Signal type: `system_issue`

### Not in scope for D4

- Auto-fixing TASKS.md status — detect and alert only (brief §3 Option A constraint)
- Writing to `coordination.db` — read-only via `task_list_held`
- Enforcing task-lock TTL — MCP server manages TTL independently
- Sprint 1966 Option C echo cron — deferred post 1965c soak (gated on 2026-05-22T21:00Z)
