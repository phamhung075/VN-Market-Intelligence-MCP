> Parent: [../../../.claude/agents/system-auditor.md](../../../.claude/agents/system-auditor.md)

# System Auditor — Audit Dimensions

<!-- size-justification: exactly 200L (at the waterfall soft-cap, not crossing it) — canonical dimension registry; each dimension is a one-table entry + acceptance reference. Tightly coupled check-ID traceability. A-01-EXPECTED-SET fix (2026-06-02) adds host_runtime_set gating note to D1. +7L: FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE (2026-07-08) D4-R1b exclusion whitelist + D4-R4b debounce rows + doc/code gap note. +13L: D-FLEET (Tier-4, PILOT) added after D5 (2026-07-18), per brief docs/architecture-briefs/2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md §8 EDIT-1 — on-demand only, zero cron registration. +23L: D-PAGE (Tier-5) added before D-FLEET (2026-07-25, revised same day per coordinator review) — quality-audit rotating re-verification, partition key + window + verified_at contract + two anomaly classes + read-only write boundary + qa-consumption pointer; handler extracted to flow/page-freshness.md (kept out of main.md per lazy-load discipline). Section deliberately compacted (fewer paragraph breaks, denser prose) to land exactly at 200L rather than push the file over — any future addition to this file should split rather than grow further. -->

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
**Live execution:** compiled cron job `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` (`dev-mcp-server` zone) — NOT the system-auditor LLM agent. See `docs/agents/system-auditor/handlers.md` §IMPLEMENTATION NOTE.

### Checks

| Check | Description | Pass condition |
|-------|-------------|---------------|
| D4-R1 | `task_list_held(kind="sprint-task", expired=false)` MCP call | Tool responds (empty or populated); empty AND `orch-state.json .head.active_task_id` non-null → alert |
| D4-R1b | Exclusion whitelist (`cron:*`, `*-singleton`, `po-triage-*`, `esc-datacov:*`, `esc-deepdive:*`, `session-presence*`, `commit-mutex*`, `intent:*`) + live-concurrent-session guard | Held locks matching either filter are excluded from D4-R2/D4-R3 entirely (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE) |
| D4-R2 | orch-state.json `.head` cross-check (locks surviving D4-R1b only) | `.head.active_task_id` matches the held lock task_id (or both null) |
| D4-R3 | `.task_board` owner/status cross-check (locks surviving D4-R1b only) | For each held lock: task_board entry exists, owner matches `task_locks.owner_agent`, status = `IN_PROGRESS` |
| D4-R4 | git log concurrent-commit detection | No two commits to `docs/data/orch/orch-state.json` land within a 30-second window (unaffected by R1b/R4b — not lock-based) |
| D4-R4b | 2-consecutive-cycle debounce gate on D4-R2/D4-R3 candidates | A candidate only emits once it has persisted across ≥2 consecutive daily D4 passes — ledger rides on the system-auditor notebook's `D4 candidates:` line (no new state file; system-auditor may write only its notebook + signal_queue) |

### Acceptance criteria

| AC | Check | Pass condition |
|----|-------|---------------|
| AC-1 | `task_list_held` fires at 03:00Z | Tool call appears in session log at 03:00Z ± 5min |
| AC-2 | Divergence PERSISTING ≥2 cycles → `orch-state.json .signal_queue` row `to: "po"` | Row emitted within 24h of the 2nd consecutive occurrence |
| AC-3 | No divergence, whitelisted lock, live-concurrent-session lock, or single-cycle transient → no false-positive row | Clean day: zero signal_queue rows from D4 with `to: "po"` |
| AC-4 | orch-state/lock mismatch detected | `task_list_held` empty + `.head.active_task_id` non-null → signal_queue alert emitted (unaffected — fires on first cycle, not subject to R4b) |
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

### Known doc/code gap (2026-07-08, FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE)

This spec (D4-R1b exclusion whitelist + D4-R4b debounce) is CORRECTED as of 2026-07-08, but the live code (`apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts`) has NOT been updated to implement it yet — that is a `dev-mcp-server` code task, outside agent-father's zone (`apps/**` is forbidden for agent-father). Until the code lands, the 6+ recurring false-positive batches (esc-datacov:*, cron:dev-team:*, dev-team-cron-singleton) will keep firing daily unchanged.

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

---

## D-PAGE (Tier-5): Quality-Audit Freshness Rotation

**Tier:** 5 (daily `30 3 * * *` — `.claude/commands/crons/cron-auditor-page-reverify.md`, distinct from Tier-3's `0 2 * * *`/D4-N's `03:00Z`). **Check IDs:** every `check_id` in `quality-checklist.json` whose `dimension` matches `Freshness|SLA` (74 at authoring — live count) + `PG-MAP-SELF` sentinel. **Handler:** `flow/page-freshness.md` + `scripts/audits/auditor-page-reverify.sh`. Origin: coordination_session=93587c5d-9135-42df-a0e7-170d0f8358b2 (2026-07-25), user demand "reverify this quality-audit page, day by day... do not trust stale status".

**Partition:** `cksum(check_id|page) mod 7` — stable hash, never array position; ISO weekday−1 fires one partition/day. **Window:** 7d, proven (not asserted) by `staleness-scan`. **Canonical field:** `verified_at` (`date -u +%Y-%m-%dT%H:%M:%SZ`) = last live-reprobe time, **ledger-only** (`.checks{}`/`.pages{}`) — distinct from qa's `last_verified` and the map's `asof` (data recency ≠ confirmation recency).
**Write boundary — BOTH `quality-checklist.json` and `frontend-data-coverage-map.json` fully READ-ONLY, no exception.** (2026-07-25 coordinator-caught fix: an earlier revision wrote `verified_at` onto the map directly, coupling its mtime to this dimension's own daily run and making qa's mtime-based re-sync trigger permanently, falsely true — a self-triggering loop. Retired.) Sole write target: `docs/data/auditor-page-reverify-ledger.json` (new, atomic tmp+mv, own namespace).
**Two anomaly classes** (reuse existing `data_stale`/`system_issue` → `anomaly-task-bridge` → `repair_task_request` → PO → `.task_board`, zero new plumbing): VALUE DRIFT (stored PASS, live FAIL/WARN — `data_stale:<check_id>:PG-DRIFT`); AUDIT STALENESS (`verified_at` missing/>7d — `system_issue:<check_id>:PG-STALE`). **qa consumption (closes the loop):** both are a new scoped trigger in `docs/agents/qa/flow/quality-audit.md` Trigger — the path by which the page actually gets re-updated; qa still writes `quality-checklist.json`, system-auditor never does.

**Out of scope v1:** backfilling un-probed rows (falsification); the other 368 non-Freshness/SLA checks (no staleness concept); auto-fixing (`detect_only`).

---

## D-FLEET (Tier-4, PILOT): Fleet-Wide Agent Performance & Cooperation Audit

**Tier:** 4 (on-demand PILOT only — NOT cron-registered; see brief `docs/architecture-briefs/2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md` §5)
**Check IDs:** T4-A (notebook rollup) / T4-B (task_board/signal_queue derived metrics) / T4-C (tool-usage-stats.json precision, degraded-mode aware) / T4-D (accuracy/disposition scoring) / T4-E (synthesis + improvement-proposal emit)
**Scope:** Cross-agent rollup of cycle telemetry, cooperation/handoff friction, tool-call precision, and output-accuracy disposition across the full agent fleet (live glob count, currently 45 notebooks — never hardcode).
**Pass condition:** N/A (this is an analysis pass, not a pass/fail gate) — output is zero or more improvement-proposal docs routed per the source brief §3 (identical gated pipeline as D-IMPROVE — zero new signal type, zero new PO-flow row).
**Finding category (dedup namespace):** `fleet_performance_finding` (routed as `type=improvement_proposal`, `target_agent` varies per finding — one proposal per target agent, never multi-target; see one-target-per-proposal rule in `handlers.md` §Step D-FLEET FA-5)
**Pilot status:** on-demand only, 1–2 runs total during the pilot window (source brief §5). Graduation criteria (source brief §7, G1–G6) gate any future permanent-cadence cron proposal — this dimension cannot self-promote.

### Handler

See `docs/agents/system-auditor/handlers.md` §Step D-FLEET.
