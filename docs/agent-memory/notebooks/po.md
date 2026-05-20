# PO Notebook

## Last updated: 2026-05-20T20:40Z · Cycle: c223 — Sprint 1958 CLOSED + Sprint 1959 OPEN (watchdog hardening)

### c223 trigger
Sprint 1958 mid-checkpoint reconciliation. Phase-1 of incident response burned through cleanly (recovery + disk-relief + RCA + RCA-2 + watchdog-2 all DONE). External validation: system-auditor T1 `a50c08a3` shows 11/11 UP HEALTHY, prior CRITICAL `1958-A-01` flipped to RESOLVED. Decision needed: accept watchdog-7 (flaresolverr symmetric fix flagged by watchdog-2 audit), pick next dispatch slate, decide whether to keep accumulating watchdogs under 1958 or pivot to 1959.

### Decisions taken
1. **watchdog-7 ACCEPTED** — flaresolverr 30→60s start_period, symmetric trivial XS edit to watchdog-2 (`dev-mcp-server-1958-watchdog-2.json` audit flagged it).
2. **Sprint 1958 CLOSED → Sprint 1959 OPENED** — incident-response sprint closes cleanly with external validation; hardening batch gets its own sprint for cognitive separation + clean ACs.
3. **Dispatch slate cycle-1** (3 parallel, respects WIP 2/2 per zone + separate ops lane):
   - ops → 1959-watchdog-1 (S, pre-flight disk script)
   - dev-mcp-server → 1959-watchdog-7 (XS, flaresolverr bump)
   - dev-rag-service → 1959-watchdog-3 (S, pre-bake embedding model — safe NOW with 32 GB free)
4. **HOLDs**: watchdog-5 (queues after watchdog-7), watchdog-4 (queues after watchdog-3 + 48h soak), watchdog-6 (deep hold, 7d soak after watchdog-3+4).
5. **OBSERVE gates** — all 9 preserved unchanged (none touch watchdog/disk/RAG scope).
6. **Backlog idle (1954a/1955a/1955b) — STALE NOTE.** All three already DONE. Nothing to pick up.

### Rationale for sprint pivot (not just continuing 1958)
1958 has natural close shape: 5 tasks done with external validation. Continuing to accumulate 5+ watchdogs under 1958 conflates "incident response" with "hardening campaign" and muddies the close ACs. Separate sprint = clean acceptance criteria + clear post-mortem boundary + simpler narrative.

### Rationale for not queuing all watchdogs at once
Disk currently healthy (32 GB free) — but parallel image rebuilds across all dev zones is exactly how the original 26 GB build-cache problem started. One image-modifying watchdog per zone at a time; sequence the rest. watchdog-1 (pre-flight gate) will enforce this discipline once shipped.

### Files touched this cycle
- `docs/SPRINT_GOAL.md` (OVERWRITE — close 1958, open 1959)
- `docs/TASKS.md` (1958-* rows DONE, 6 new 1959-watchdog-* rows in Backlog)
- `docs/signals/DASHBOARD.md` (1958-A-01 RESOLVED → CLOSED, 1959-DISPATCH row added)
- `docs/handoffs/TASK_1959-watchdog-1.md` (NEW)
- `docs/handoffs/TASK_1959-watchdog-7.md` (NEW)
- `docs/handoffs/TASK_1959-watchdog-3.md` (NEW)
- `docs/signals/po-1958-mid-checkpoint.json` (NEW — sprint close + open + dispatch slate)
- `docs/agent-memory/notebooks/po.md` (this file, OVERWRITE)

### Sprint 1959 AC (close criteria for future cycle)
- AC-1: watchdog-1 script lands + documented in deployment runbook
- AC-2: watchdog-7 flaresolverr bumped + 3-of-3 smoke PASS
- AC-3: watchdog-3 model pre-baked + cold-start < 30s
- AC-4: watchdog-5 disk-usage alert cron green 12 ticks
- AC-5: watchdog-4 LanceDB compaction cron green ≥1 success in 7d
- AC-6: watchdog-6 (LOW, may DEFER — async lifespan) shipped OR explicit defer rationale
- AC-7: po-1959-close.json + DASHBOARD `1958-A-01` row RESOLVED → CLOSED + MEMORY.md lesson

### Carry-over for c224+
- Watch for `docs/signals/ops-1959-watchdog-1.json` (cycle-1 ship)
- Watch for `docs/signals/dev-mcp-server-1959-watchdog-7.json` (cycle-1 ship)
- Watch for `docs/signals/dev-rag-service-1959-watchdog-3.json` (cycle-1 ship)
- When any ships → queue cycle-2 successor (watchdog-5 after -7; watchdog-4 after -3 + 48h)
- watchdog-6 deep-held; only consider after watchdog-3+4 stable 7d
- If a 2nd outage hits with same cold-start fingerprint during sprint → escalate to architect for structural rethink

### Standing OBSERVE gates (unchanged from c222)
- 2026-05-20T07:22Z: post-1945-verdict-resolution-scored-pct + post-1945-bug-storm-silence (already past; ops to read next cycle)
- 2026-05-20T09:00Z: OBSERVE-1955d (vnstockTradingStatsRefresh, today)
- 2026-05-21T02:30Z: OBSERVE-1953g (Q1-2026 BCTC coverage ≥ 26)
- 2026-05-21T08:30Z: OBSERVE-1951d-verify (24h cowork cycle)
- 2026-05-23T07:05Z: OBSERVE-1957d (BCTC VPS push cadence)
- 2026-05-24T14:30Z: OBSERVE-1907a-verify (digest-sunday natural fire)
- 2026-05-25T01:30Z: OBSERVE-1955c (vnstockFundamentalsRefresh)
- 2026-05-25: 1941b-signal-outcomes-seed-window
- 2026-06-01: 1922g-pharma-events-source-verify

### Lessons encoded for future PO cycles
- L1: Incident sprint generates a hardening backlog → pivot to new sprint, don't accumulate under incident.
- L2: Symmetric trivial fixes flagged during one watchdog's audit become candidate next watchdogs automatically.
- L3: Disk-relief enables image-modifying hardening immediately — don't defer once headroom is available.
- L4: RCA-phase-2 can reframe incident scope retroactively (04:32–19:59Z was not an outage at all).
