# PO Notebook

## c265 · 2026-05-22T17:24:56Z — cron-1707Z dev-team triage (L70 dispatcher reconcile)

### Trigger
dev-team cron-1707Z spawn. Dispatcher L70 live-probe contradicted pipeline-state.json AND my own c264 verdict (both stated DAILYDASH AC-5.2 gate at 22T16:30Z). WIP=0/2.

### Live-probe verdicts
1. **Gate timestamp wrong** — cronConfig.ts:128 dailyDashboard = `'30 23 * * *'` UTC; container TZ=UTC (verified by `docker exec date`); logs `--since 1h | grep dailyDashboard` = EMPTY. The 16:30Z window never fired. Actual target = **22T23:30Z** (~6h08min from now).
2. **Missing host bind-mount** — dailyDashboardJob.ts:509 writes `/app/docs/data/daily-dashboard.json` inside container; docker-compose.yml mcp-server volumes lines 11-19 only mount 3 individual `:ro` files (project-stats.json, stock-classification.json, alert-verdicts.json) — NO bind for daily-dashboard.json. Output is host-invisible AND lost on restart. AC-5.2 cannot be host-verified at 23:30Z without this fix.

### Verdict
**BATCH=1 FIX + 1 NOTE-CORRECTION.**
- FIX-1974-DAILYDASH-HOST-VISIBILITY (XS, dev-mcp-server, docker-compose.yml). Dispatch NOW — ~6h before 23:30Z fire, WIP=0/2 safe, XS scope, AC-1..AC-6 in payload, implementer chooses single-file rw mount vs whole-dir mount.
- NOTE-CORRECTION pipeline-state gate 16:30Z → 23:30Z, routed to PM via RETURN (no own dispatch).

### Actions
- `docs/signals/po-20260522T172456Z.json` (po.triage.v1 — full 1-FIX + 1-NOTE payload + AC-1..AC-6 + lessons L74/L75)
- DASHBOARD ## po row `c265-TRIAGE-DAILYDASH-RECONCILE` (DISPATCHED-1974)
- DASHBOARD header rewritten with c265 summary (c264 carried as prior-context)
- pipeline-state.json: **no own write** — NOTE-CORRECTION routed to PM (PO does not own pipeline-state maintenance; PM owns).
- TASKS.md: no change (FIX row will be opened by dev-team Step 3 on signal pickup).
- Telegram: NONE (infra fix, non-user-facing).

### Lessons
- **L75 (NEW c265)**: container-only writes under `/app/docs/data/` (or any /app path) that need host verification = silent-death anti-pattern. Require bind-mount OR docker-exec verification clause OR sidecar copy. Architect to consider systemic rule (audit other jobs writing under /app/docs/).
- **L74 (NEW c265)**: PO must cite cronConfig.ts:line + container TZ + `logs --since 1h | grep <job>` before declaring any OBSERVE gate timestamp. c264 propagated the 16:30Z error from the L70 snapshot — dispatcher caught it this cycle. Live-probe before trusting any timestamp.
- **L73 retained** (c264): system-auditor probe false-positive class — 3 flavors (wrong-host-port, wrong-URL-path, wrong-table-name/dead-legacy-table). Meta-fix backlog 4 items still LOW-prio deferred.
- **L72 retained** (c263): live-probe every candidate surface for terse USER-BUG complaints.
- **L70 retained** (c254): cron-prompt is t=0 snapshot; reconcile live state every cycle — applied this cycle and saved the AC-5.2 verification window.

### Carry-over
- OBSERVE gates (UTC, CORRECTED): **22T23:30Z 1960-DAILYDASH AC-5.2 (~6h08min, requires 1974 to land first)**; 22T21:00Z 1967-06 unlock (~3h35min); 22T21:00Z 1955e unlock; 23T03:00Z 1965d errors=0; 23T07:05Z 1957d BCTC tracker; 23T18:00Z 1965c soak end.
- FROZEN: NFR-3 BCTC freeze (1953-G-FAIL), recurring-bug rule, NO-BRANCHES.
- Branch carry-over: task/1972-vndirect-ohlcv-null-coercion in ## maintenance (code-janitor pending).
- Backlog: PROBE-MAP-OVERRIDE-SPIKE 4-item meta-fix LOW-prio (A-11 + A-30 + C-06 + C-07); 1967-10-ITEM18 LOW (marketScanJob finally-guard); 1954c anchor for BCTC unblock.
- WIP: 0/2 → 1/2 on 1974 dispatch.
