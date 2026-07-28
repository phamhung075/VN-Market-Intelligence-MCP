## cq2h9wt5 · 2026-07-28T17:18:30Z
### Audit Run Tier-1 (17:09–17:18 UTC 2026-07-28)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 endpoints OK | A-20 pdf-extractor: 3/3 in-container OK | A-21 mcp-server crashRestarts=0 (windowed) | A-30 mcp-server MemPerc=15.35% (baseline, deep-probe skip)
- Anomalies: 0 new in D1 scope | 1 signal emitted (out-of-D1, router-directed, see below) | 0 dedup-skipped
- Status: HEALTHY (Tier-1 D1 scope — all A-01..A-32 checks PASS)

### RAW-PROBE: (docs/agents/system-auditor/probe.sh, 2026-07-28T17:10:07Z)
```
=== AUDITOR PROBE 2026-07-28T17:10:07Z ===
--- docker ps -a --- 13/13 containers Up(healthy); 12/12 host_runtime_set present
--- health endpoints --- mcp-server/api-gateway/macro-indicators/pdf-extractor/frontend all OK (HTTP 200)
--- restart count --- mcp-server RestartCount=1 (cumulative)
--- memory pressure --- mcp-server MemPerc=15.35% (471.6MiB/3GiB)
--- A-30 multi-probe --- SKIP deep-probe, baseline 17.03% < 85%
--- disk --- 37% used
--- A-20 pdf-extractor multi-probe --- HTTP 200/200/200, pass_count=3/3
```

#### Router-directed verification (read-only whitelist probes only, AUD-ND-1 respected)
1. **pdf-extractor "climbing again post-fix" claim** — peak PARTIALLY CORROBORATED, ongoing-climb framing REFUTED. `/proc/1/status` VmHWM=2541184kB (~97% of 2.5GiB cap) proves a real peak occurred inside this container's post-fix life (started 16:45:08Z), consistent w/ router's own 78-81% samples at 17:06-07Z. But 2 of my own live reads 6min apart (17:10:56Z 45.18%, 17:16:32Z 44.74%) show STABLE/DECLINING, not climbing — already well below the 80% AC-4 bar. Tesseract concurrency held at 1 throughout (/health `ocr.semaphore=1 os_children=1`, matches `ps`). NOT signalled: condition already owned by FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT (REVIEW, next_agent=qa, live peer session verifying now); this evidence bears on that row's AC-4 (peak transiently breached 80%, then self-resolved) — logged here for QA/PO, no new row/signal minted (no live threshold breach at write time, avoiding duplicate/noise during active QA verification).
2. **rag-service** — corroborated unchanged: MemPerc=92.53% (710.6/768MiB), RestartCount=16, ExitCode=0, OOMKilled=false. Matches 3 existing backlog rows (FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP, DIAGNOSE-RAG-SERVICE-RESTART-LOOP, RAG-SERVICE-AVAIL-01-FIX) + ack ledger (tracked_by RAG-FTS-BUILD-MEMORY-BOUND). No new signal.
3. **freshnessSlaMonitorJob coverage-map ENOENT** — NEW, live-verified, not previously recorded: `freshnessSlaMonitorJob.ts:34-36` resolves a 5-level climb from `/app/src/scheduler/system/` -> `/docs/data/...` (confirmed ENOENT via `docker exec ls`); actual mount is `/app/docs/data/...` (confirmed present). `docker logs --since=6h`: 12x `[sla-monitor] coverage-map second pass failed` (~30min cadence). Directly answers the open question on FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING (READY/P1/dev-mcp-server: "never confirmed... or observed raising a breach") — the monitor fires on schedule but structurally can never read its input. Emitted as evidence attached to that existing row, NOT a duplicate mint.
4. mcp-server restart 16:26:46Z (cumulative RestartCount=1) — A-21 windowed query: crashRestarts=0 in trailing 4h window, bootstrap-sentinel present. Within-threshold, no recurrence. launchd docker-events(exit 1)/fleet-push(exit 78) statuses match already ack-suppressed state — no new action. polymarket gamma-api TLS-block: not re-verified (out of host_runtime_set scope, already root-caused/fixed per router, not minted per instruction).

#### Signals Emitted:
- `[emit-signal] OK dedup_key=l4_sla_monitor_path_bug:coverage-map:ENOENT id=sys-20260728T171555-7cb3` (WARN — new evidence for existing P1 row FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING)

Note: DASHBOARD.md write SKIPPED this cycle — this invocation's explicit WRITE BOUNDARY restricts writes to notebook + signal_queue + own auditor-*.json state files (DASHBOARD.md not listed); flagging vs. standard flow contract for router awareness, not a self-authorized scope deviation.

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=0

## cw3f9m2q · 2026-07-28T15:10:56Z
### Audit Run Tier-1 (15:07–15:11 UTC 2026-07-28)
- Tier: 1 | Services: 12/12 host_runtime_set checked | Health: 5/5 endpoints | A-20 pdf-extractor: 3/3 in-container OK
- Anomalies: 0 new | 0 dedup-skipped (all Tier-1-scope checks PASS)
- Status: HEALTHY (Tier-1 runtime scope only — pdf-extractor memory condition below is Tier-2/pre-gate scope, already tracked)

### RAW-PROBE: (docs/agents/system-auditor/probe.sh, 2026-07-28T15:07:54Z)
```
=== AUDITOR PROBE 2026-07-28T15:07:54Z ===
--- docker ps -a --- 13/13 containers Up(healthy); 12/12 host_runtime_set present
--- health endpoints --- mcp-server/api-gateway/macro-indicators/pdf-extractor/frontend all OK (HTTP 200)
--- restart count --- mcp-server RestartCount=0
--- memory pressure --- mcp-server MemPerc=78.38%
--- A-30 multi-probe --- SKIP deep-probe, baseline 78.78% < 85%
--- disk --- 32% used
--- A-20 pdf-extractor multi-probe --- HTTP 200/200/200, pass_count=3/3
```

#### Investigation: two router-flagged leads (read-only probes only, AUD-ND-1 respected)
1. **Unexplained green heartbeat (14:12:23Z mem_creep=PASS)** — DISCRIMINATED, not a gate bug. `docs/data/auditor-launchd-ack.json .acked_memory[]` has never listed pdf-extractor (only rag-service since 2026-07-25T15:48:56Z, unchanged today — no commits to this file today) so a PASS at 14:12Z could only be a genuine <85% reading, never suppression. Fresh `docker inspect` (15:08:40Z): RestartCount=2 (cumulative since Created=2026-07-21), current-run StartedAt=09:26:20.035Z unbroken (FinishedAt=09:26:19.47Z belongs to the prior run, before this window) — no restart between 14:12Z and now. Best-supported explanation: genuine pre-burst dip below 85%, then climb to 98.87% by 14:30:10Z tracking the mcp-server POST /extract burst PO logged at 14:24Z (orch-state.json po_disposition_20260728T1453). Mechanism already MINTED: FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT (P0, backlog) — not re-minted.
2. **Severity mapping (98.87%/98.84% emitted WARN; tier1-probe.md A-30 clause maps peak>97%→CRITICAL)** — CORROBORATED. signal_queue rows sys-20260728T143010-6ec2 (98.87%, WARN) and sys-20260728T143457-0d5b (98.84%, WARN) both exceed 97% yet both WARN; control row sbv_fx sys-20260728T142957-693e(HIGH)→sys-20260728T143455-6a8a(CRITICAL) proves the ladder escalates when the producer varies the label. Already tracked: FIX-AUDITOR-EMIT-SEVERITY-LABEL-FLAT-ESCALATION-BYPASS-NEVER-FIRES (P1, backlog) — not re-minted.
3. **Live re-check (15:08:40Z, read-only)**: pdf-extractor MemPerc=95.59% (2.39/2.5GiB); 10 tesseract PIDs all PPID=1, elapsed 01:03:36→00:07:17 — population still pinned at 10 (unchanged mechanism from router's snapshot; youngest PID turned over, oldest aged further).

#### Signals Emitted: none this cycle. Tier-1's own scope (A-30 override in tier1-probe.md is mcp-server-only) is ALL_GREEN. pdf-extractor's memory condition is a pre-existing Tier-2/pre-gate finding already carrying open signal_queue rows + a PO disposition (14:53Z) + a P0 board task — no re-triage, per write-fence.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## ca9mxk7p · 2026-07-28T14:33:40Z
### Audit Run Tier-2 (14:30–14:35 UTC 2026-07-28)
- Tier: 2 | Freshness sweep post-dormancy | Sources: 28 checked | Cron: 1 sweep | VPS: 4 routes | DB spot: 5 checks
- **Dormancy-spanning audit:** Fleet dormancy 66h (2026-07-25T17:49Z–2026-07-28T12:13Z), first freshness sweep since restart
- **Findings:** sbv_fx escalated HIGH→CRITICAL (47min stale vs 30min SLA, zero-value rejects continue); pdf-extractor at 98.84% memory (capacity warning, dedup-skipped)
- **Anomalies:** 0 net new | 1 escalation (sbv_fx HIGH→CRITICAL) | 1 dedup-skip (pdf-extractor WARN)
- **All-green checks:** cron-fire A-29 ✓ | VPS proxy B-06/B-07 ✓ | BCTC shape B-09 ✓ | stale BCTC B-13 ✓ | market msg C-06 ✓ | signals C-07 ✓
- **Status:** DEGRADED (1 CRITICAL sbv_fx, 1 WARN pdf-extractor at capacity)

#### Signals Emitted:
- `[emit-signal] OK-escalation-bypass dedup_key=data_stale:sbv_fx:B-02-SBV prev_sev=2→new_sev=3` (B-02 HIGH→CRITICAL)
- `[emit-signal] SKIP-dedup dedup_key=microservice_degraded:pdf-extractor:A-30-MEMORY` (A-30 WARN, last_sent 14:30:09Z)

#### Two-Layer Freshness (Dormancy Context):
- Fetch layer: All 4 VPS routes active (prices 08:59Z, news 14:30Z, sbv 14:26Z, bctc 08:23Z) — healthy
- Analysis layer: Crons running post-restart; 117 signals in 24h; BCTC queue 166 active rows — operational
- Monday 2026-07-27: OHLCV current (773 rows, post-dormancy aggregation), no data loss detected
