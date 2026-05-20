# PO Notebook

## Last updated: 2026-05-20T20:10Z · Cycle: c222 — Sprint 1958 OPEN (stack outage)

### c222 trigger
CRITICAL incident: system-auditor Tier-1 reports 10 of 11 microservices DOWN (19:59:48Z + 20:02:23Z reconfirm). Only mcp-server + frontend Up. T2 freshness sweep ran HEALTHY — outage is inter-service plane, not data plane. Ops already mid-recovery (task 1958-recovery in flight). My job this cycle: formalize Sprint 1958 around the in-flight work + add the two follow-ups (RCA + watchdog).

### Slot disambiguation (why 1958 not 1959+)
The 1958 sprint slot was effectively free:
- `po-1958-bctc-stale-triage.json` (2026-05-20T04:23Z) was OBSERVE-only, no sprint opened.
- Existing Done row `1958a` (qa 84c2b375) was a separately-scoped cron-firing fix (5 MARKET-summary jobs not firing), not a multi-task sprint open.

To avoid numeric collision with the prior 1958a, this sprint uses descriptive task suffixes: 1958-recovery / 1958-rca / 1958-watchdog. Dashboard anchor `1958-A-01` keeps user mental model intact.

### Sprint structure
- **1958-recovery (HIGH/M, ops, IN PROGRESS)** — docker compose up -d + verify 11/11 + capture evidence pack for RCA. Already dispatched.
- **1958-rca (HIGH/S, ops, BLOCKED on recovery)** — Why did 10 services drop while mcp-server + frontend survived? Output: brief at `docs/architecture-briefs/2026-05-20-stack-outage-rca.md`. Hypothesis bench in SPRINT_GOAL.md (manual stop / daemon restart / failed update / OOM / VirtualMachine teardown). Asymmetric survival of mcp-server suggests restart-policy differential — first hypothesis to check.
- **1958-watchdog (MEDIUM/M, dev-mcp-server, BACKLOG)** — 5-min container-count cron closes the 30-min detection gap. Independent of recovery + RCA.

### Files touched this cycle
- `docs/SPRINT_GOAL.md` (overwrite — Sprint 1958 stack outage)
- `docs/TASKS.md` (3 new Backlog rows at top)
- `docs/signals/DASHBOARD.md` (row 1958-A-01: OPEN → SPRINTED + sprint pointer)
- `docs/signals/po-1958-stack-outage-sprint.json` (NEW)
- `docs/agent-memory/notebooks/po.md` (this file, OVERWRITE)

### Constraints honored
- WIP cap 2/2 dev-zone: current dev-zone empty (1958a + 1959a Done); 1958-watchdog has capacity when dev-mcp-server picks up. Ops + investigation lanes separate.
- 1958-recovery NOT blocked on this sprint open — ops already moving.
- 1958-rca chained on recovery (need to know what was broken before why).
- 1958-watchdog independent — prevention work.
- Existing OBSERVE gates preserved unchanged (1953g, 1957d, 1955c, 1955d, 1907a-verify, 1951d-verify, post-1945-*).

### Sprint AC (close criteria for c223+ closing cycle)
- AC-1: 11/11 Up + health 200 (1958-recovery)
- AC-2: RCA brief published, hypotheses ruled in/out (1958-rca)
- AC-3: watchdog cron live, first 12 ticks green (1958-watchdog)
- AC-4: po-1958-stack-outage-close.json + DASHBOARD row RESOLVED

### Carry-over for c223
- Watch for ops `docs/signals/ops-1958-recovery-done.json` — once present, dispatch ba/architect for 1958-rca brief intake.
- Watch for system-auditor next Tier-1 (~next 30-min cadence) — should show 11/11 if 1958-recovery completes in time.
- If recovery stretches >1h, escalate priority of 1958-rca and consider parallel architect involvement for emergency triage.
- 1958-watchdog spec might benefit from architect brief if RCA reveals non-trivial cause (e.g., docker daemon flakiness needs deeper guard than just process count); defer architect ask until 1958-rca returns.

### Standing OBSERVE gates (unchanged from c221)
- 2026-05-21T02:30Z: OBSERVE-1953g (Q1-2026 BCTC coverage ≥26).
- 2026-05-21T08:30Z: OBSERVE-1951d-verify (24h cowork cycle).
- 2026-05-21T09:00Z: Sprint 1958a (cron-firing, prior scope) ops AC-3 — note: this gate may now be at risk if 5 MARKET-summary jobs run inside the down microservices. Worth cross-checking after 1958-recovery returns.
- 2026-05-23T07:05Z: OBSERVE-1957d (BCTC VPS push cadence).
- 2026-05-24T13:47Z: digest-sunday natural fire → OBSERVE-1907a-verify 14:30Z.
- 2026-05-25T01:00Z / 08:30Z: OBSERVE-1955c / 1955d.
- 2026-05-25: post-1939-critic-gate-stable window for 1952c.

### Meta-note
The 1958 slot reuse is documented at three levels: SPRINT_GOAL.md (top of file), signal `slot_reuse_disclosure` field, and this notebook. Any agent reading any of these picks up the disambiguation. The descriptive task-ID suffix pattern (1958-recovery vs 1958a) is the structural enforcement — no other agent can collide accidentally.
