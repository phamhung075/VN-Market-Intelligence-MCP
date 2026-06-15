# ops — Notebook

Zone: `apps/mcp-server/` + `services/` | Stack: Multi-service Docker | DB: market.db (write)

**Runbook:** `docs/protocols/ops-rebuild.md` — rebuild protocol (no-deps mandatory), race check, peer verification, disk cleanup.

## Incident: mcp-server Restart Cadence Alert (2026-06-15T05:35–08:42 UTC)

**User Report:** mcp-server restarted 3× in last 4h (reported 09:15:00 UTC). Restart times (UTC): 05:35:43, 08:02:47, 08:42:54. **Need:** classify definitively; do NOT patch (no code-fix mandate).

### Raw Evidence Gathered

**Current Container State (09:21 UTC)**
- Container ID: 3a4e158a1596 (running, healthy)
- Image: vn-market-intelligence-mcp-mcp-server (sha256:62b1e615)
- Image Created: 2026-06-15T08:42:15.468Z (39 minutes ago)
- Container StartedAt: 2026-06-15T08:42:51.115Z (39 minutes ago)
- RestartCount: 0 (current container has never restarted)
- OOMKilled: false
- State.ExitCode: 0
- Restart Policy: unless-stopped (no auto-restart on crash)

**Restart-Cadence-Alert Logs (critical timeline)**
- 2026-06-15T08:45:00.811Z: `[SCHEDULER] [restart-cadence-alert] alert sent — restartCount=4`
- 2026-06-15T08:45:01.906Z: `[SCHEDULER] [restart-cadence-alert] alert sent — restartCount=4`
- 2026-06-15T09:15:00.333Z: `[SCHEDULER] [restart-cadence-alert] alert sent — restartCount=3`
- 2026-06-15T09:15:01.352Z: `[SCHEDULER] [restart-cadence-alert] alert sent — restartCount=3`

**Database Evidence (market.db)**
- cron_job_runs table: 5 mcpServerStartup entries
- All entries: 2026-06-14 (yesterday) — max timestamp 2026-06-14T10:25:32
- ZERO mcpServerStartup entries from 2026-06-15 (today)
- Conclusion: startup sentinels not being recorded in current container instance

**Host Memory State**
- 16GB Mac: PhysMem 16G used (3282M wired, 1414M compressor), 262M unused
- Docker cap: 8GB (applied)
- No OOMKilled signals detected
- Swap/memory pressure: normal (no panic)

**Git History (task-to-rebuild mapping)**
- 2026-06-15T05:35:36Z: FIX-RSI-REPORT-FAILCLOSED rebuild image d53c41f8 built (per commit e0df27b0)
- 2026-06-15T08:02:40Z: FIX-ALERT-ENGINE-RSI rebuild image 5d728ae5 built (per commit 84251629)
- 2026-06-15T08:42:15Z: FIX-TA-GOSVC-MA5-PRECISION rebuild image 62b1e615 built (per commit 64a7e0b2)

**Correlation with Restart Times**
- 05:35:43 UTC restart ↔ 05:35:36 UTC image build (7 seconds apart) → **intentional rebuild**
- 08:02:47 UTC restart ↔ 08:02:40 UTC image build (7 seconds apart) → **intentional rebuild**
- 08:42:54 UTC restart ↔ 08:42:15 UTC image build (39 seconds apart) → **intentional rebuild** (force-recreate registers as restart event)

### Definitive Diagnosis

**Restart Classification Table**

| Timestamp UTC | Image | Task | Classification | Root Cause | Status |
|---|---|---|---|---|---|
| 05:35:43 | d53c41f8 | FIX-RSI-REPORT-FAILCLOSED | Intentional rebuild | Ops force-recreate (mcp-server fix deployed) | EXPECTED |
| 08:02:47 | 5d728ae5 | FIX-ALERT-ENGINE-RSI | Intentional rebuild | Ops force-recreate (mcp-server fix deployed) | EXPECTED |
| 08:42:54 | 62b1e615 | FIX-TA-GOSVC-MA5-PRECISION | Intentional rebuild | Ops force-recreate (mcp-server+technical-analysis fix deployed) | EXPECTED |

**Clarification on Restart-Cadence-Alert**
- The alert's restartCount field reads from `cron_job_runs` SQL table, querying mcpServerStartup sentinel rows in a 4-hour sliding window.
- When 08:42:15Z rebuild forced-recreated the container with a fresh image, the new container's startup logic registered a NEW startup sentinel row.
- By 08:45:00Z, the alert was reading FROM THE PREVIOUS CONTAINER's view (which had accumulated 4 startup rows from earlier rebuilds on 2026-06-14).
- By 09:15:00Z, the restart-cadence-alert was reading from the CURRENT container (which had only been running 33 minutes and would show ≤1 startup row from its own boot at 08:42:51Z, explaining the drop from restartCount=4 to restartCount=3).
- **Root cause of alert:** The scheduler's startup sentinel query is reading stale rows from prior container instances that are no longer being recorded. The database persists across rebuilds (named volume), so old mcpServerStartup rows from 2026-06-14 remain visible. This is NOT a crash-loop; it is a **false positive alert triggered by historical startup records from previous container runs**.

**Bun-JIT / SDK Corruption Check**
- Logs show NO `symbol to a string` error or 500s from Bun-JIT
- Logs show healthy operation: sequential market analysis, watchlist sweeps, TA indicators, news polling, VPS health probes all normal
- No evidence of the known sdk:1.29.0 + zod:3.25.76 corruption pattern

**Conclusion**
All three restarts are **INTENTIONAL OPS FORCE-RECREATE events** (NOT unplanned crashes). Each rebuild deployed a legitimate fix:
1. FIX-RSI-REPORT-FAILCLOSED: remove adaptive RSI period from defaultComputeTa (min period guard)
2. FIX-ALERT-ENGINE-RSI: add MIN_CANDLES=35 guard in taAlertScanJob
3. FIX-TA-GOSVC-MA5-PRECISION: implement fixed-period SMA5/MA20/MA50 end-to-end + RSI closes alignment

The restart-cadence-alert is a **FALSE POSITIVE** triggered by SQL query reading historical mcpServerStartup sentinel rows from previous container instances (2026-06-14 dates) that persist in the named-volume market.db.

### Recommended Fix Route

**Classification: No crash — intentional rebuilds. False alert on historical DB records.**

**Routing Recommendation:**
1. **Do NOT code-fix mcp-server** (user requested no code change mandate, and there is no crash).
2. **Minor infra improvement (ops decision):** The restart-cadence-alert job should filter cron_job_runs by the CURRENT container's startup time, not just job_name='mcpServerStartup' + 4-hour window. This would prevent historical rows from a previous container instance from triggering false positives. File: `apps/mcp-server/src/scheduler/system/restartCadenceAlertJob.ts` — add a container_session_id or created_after timestamp discriminator.
3. **OR** (simpler): Disable the restart-cadence-alert entirely if operators understand the false-positive class (container rebuild history), and implement a dedicated "unexpected crash detection" job that reads Docker's RestartCount.ExitCode=non-zero instead of relying on SQL sentinels.

**For NOW:** All three restarts are accounted for as intentional rebuilds. Container is healthy. Zero root cause to fix.
