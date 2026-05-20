# PO Notebook

## Last updated: 2026-05-20T21:05Z · Cycle: c225 — Sprint 1959 cycle-2 dispatch (watchdog-5 + watchdog-8 audit)

### c225 trigger
User-spawned PO cycle for Sprint 1959 cycle-2 decision. cycle-1 SHIPPED clean: watchdog-1 ops `784905da`, watchdog-7 dev-mcp-server `fd292896`, watchdog-3 dev-rag-service `66255410`. watchdog-3 ship surfaced a class-of-failure: the `market_data` named volume mounts at `/app/data` across every microservice, silently shadowing any Dockerfile asset baked under `/app/data/*`. dev-rag-service worked around via `/opt/model-cache`. Question for PO: dispatch watchdog-5 now? Add a new audit task for the shadow class?

### Decisions taken (all 5 user questions)
1. **watchdog-5 DISPATCH-NOW** — YES. dev-mcp-server slot free post-watchdog-7. Pure TS (no image rebuild). LanceDB at 29 GB will exceed the 20 GB threshold immediately — handoff notes use env override for smoke, not prod default.
2. **watchdog-8 NEW (cycle-2 audit add)** — YES, ACCEPT scope-extension. LOW priority, architect zone, READ-ONLY scan. Output = `docs/architecture-briefs/2026-05-21-named-volume-shadow-audit.md` + verdict line "N CONFIRMED SHADOW(S) found — recommendation: ...". No code, no rebuild. Cost ≤ 2h; downstream may seed Sprint 1960-volume-shadow-remediation if ≥1 finding.
3. **Sprint 1959 scope** — broaden from "watchdog hardening only" to "watchdog hardening + 1 audit follow-on". The audit emerged from a sprint-internal ship; deferring would lose context. AC-8 added to sprint-level acceptance list.
4. **OBSERVE gates** — all 9 intact. Next due: post-1945 (07:22Z, past; ops to read), OBSERVE-1955d (09:00Z today, ops next cycle), OBSERVE-1953g (2026-05-21T02:30Z high-stakes Q1-2026 BCTC), 2026-05-22T21:00Z watchdog-4 unlock.
5. **Backlog idle** — NO interleave. 1954a/1955a/1955b already DONE (user prompt note was stale). Chef-morning verification is implicitly tracked by OBSERVE-1953g + OBSERVE-1907a-verify; no separate dispatch needed.

### Disk safety verified
32 GB free. cycle-2 dispatches do NOT trigger image rebuilds:
- watchdog-5 = pure TS cron code in apps/mcp-server/.
- watchdog-8 = read-only filesystem scan + writeup; no Dockerfile or compose changes.

watchdog-3's +920 MB image is the only cycle-1 image-bloat. No parallel rebuild risk this cycle. watchdog-4 (next image-modifying watchdog) stays gated until 2026-05-22T21:00Z — by design.

### Rationale for watchdog-8 being audit-only
The remediation pattern is already proven by watchdog-3 (move to `/opt/<name>-cache` + update env var). The unknown is the COUNT of affected services. Per-service fix = code change + image rebuild = disk-pressure cost class. Parallel rebuild of N services is exactly the failure mode that triggered Sprint 1958. So: audit-first → triage → sequenced fix-list (if any) in a fresh sprint that respects WIP.

### Hypothesis H-1959-2 (NEW)
Named-volume shadow class is bounded — most services write to `/app/data/*` only at runtime (DB, OCR cache, queues). watchdog-3 was the rare case where build-time content needed to live at the same path. Audit likely confirms ≤ 1 additional service flagged; worst case 2–3.

### WIP lane snapshot (post-cycle-2 dispatch)
- ops: 0 / 2
- dev-mcp-server: 1 / 2 (watchdog-5)
- dev-rag-service: 0 / 2 (watchdog-4 unlock 2026-05-22T21:00Z, watchdog-6 deep hold)
- architect: 1 active (watchdog-8 audit, separate lane)

### Files touched this cycle
- `docs/SPRINT_GOAL.md` (cycle-2 update; watchdog-8 row; AC-8 added; H-1959-2 hypothesis; Next section)
- `docs/TASKS.md` (watchdog-3 moved to Done; watchdog-5 DISPATCH-NOW; watchdog-8 NEW row)
- `docs/signals/DASHBOARD.md` (header timestamp; 1959-DISPATCH PARTIAL-DONE updated; 2 new task_dispatched rows)
- `docs/handoffs/TASK_1959-watchdog-5.md` (NEW)
- `docs/handoffs/TASK_1959-watchdog-8.md` (NEW)
- `docs/signals/po-1959-cycle-2.json` (NEW)
- `docs/agent-memory/notebooks/po.md` (this file, OVERWRITE)

### Watchpoints for c226+
- Watch `docs/signals/dev-mcp-server-1959-watchdog-5.json` (cycle-2 ship)
- Watch `docs/signals/architect-1959-watchdog-8.json` (audit brief)
- If watchdog-8 returns ≥ 3 CONFIRMED SHADOWs → open Sprint 1960-volume-shadow-remediation
- 2026-05-22T21:00Z: unlock watchdog-4 (LanceDB compaction, dev-rag-service)
- 2026-05-21T02:30Z: OBSERVE-1953g Q1-2026 BCTC coverage (high-stakes)
- If 2nd outage hits with cold-start fingerprint → escalate to architect for structural rethink

### Standing OBSERVE gates
- 2026-05-20T09:00Z: OBSERVE-1955d (vnstockTradingStatsRefresh, today)
- 2026-05-21T02:30Z: OBSERVE-1953g (Q1-2026 BCTC coverage ≥ 26)
- 2026-05-21T08:30Z: OBSERVE-1951d-verify (24h cowork cycle)
- 2026-05-22T21:00Z: watchdog-4 unlock (cycle-3 candidate)
- 2026-05-23T07:05Z: OBSERVE-1957d (BCTC VPS push cadence)
- 2026-05-24T14:30Z: OBSERVE-1907a-verify (digest-sunday natural fire)
- 2026-05-25T01:30Z: OBSERVE-1955c (vnstockFundamentalsRefresh)
- 2026-05-25: 1941b-signal-outcomes-seed-window
- 2026-06-01: 1922g-pharma-events-source-verify

### Lessons encoded this cycle
- L8: A class-of-failure surfaced by a watchdog ship deserves an audit-only follow-on, never parallel-fix N services in one sprint.
- L9: Sprint scope can flex by exactly one audit if the audit emerged from the sprint itself — keep the context, defer the fix.
- L10: Disk-safety discipline survives across cycles: serialise image rebuilds, parallelise pure-code + read-only work.
- L11: User-prompt "idle backlog" claims must be verified against TASKS.md Done section — stale notes between cycles are normal.

### Carry-over from c224
- BCTC freeze still in force (recurring-bug-escalation policy); 1954c is the next structural unlock.
- Sprint 1962 closed cleanly at c224; DASHBOARD inbox empty for po.
- watchdog-3 commit is on main (`66255410`); no pending push.
