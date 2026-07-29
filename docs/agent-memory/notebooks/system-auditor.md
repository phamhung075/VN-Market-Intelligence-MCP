## ad265f86 · 2026-07-29T05:08:58Z
### Audit Run Tier-1 (05:00–05:10 UTC 2026-07-29)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 crashRestarts=0 PASS | A-30 verdict=FOLD (benign GC sawtooth; MemPerc min=85.73% max=93.72%, 2 reclamation dips; VmHWM>VmRSS proves prior reclamation) | A-32 Disk 38% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY

Fire-election: tick=2026-07-29T05:00Z (`*/30 * * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-29T05:08:58Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-pdf-extractor-1        Up 11 hours (healthy)        vn-market-intelligence-mcp-pdf-extractor        12 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)         vn-market-intelligence-mcp-mcp-server           3 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)          vn-market-intelligence-mcp-frontend             4 days ago
mcp-gateway                                       Up 13 days (healthy)         mcpservergatway-gateway                         13 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)         vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 13 days (healthy)         ghcr.io/flaresolverr/flaresolverr:latest        13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)         vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)         vn-market-intelligence-mcp-macro-indicators     13 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 13 days (healthy)         vn-market-intelligence-mcp-technical-analysis   13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)         vn-market-intelligence-mcp-alert-engine         13 days ago
vn-market-intelligence-mcp-stock-price-1          Up 13 days (healthy)         vn-market-intelligence-mcp-stock-price          13 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 13 days (healthy)         vn-market-intelligence-mcp-kinh-dich-service    13 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=93.11% MemUsage=2.793GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-mcp-server-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {"oom_killed": "false", "restart_count": "3", "started_at": "2026-07-28T22:58:36.476681781Z"},
  "vm": {"vmhwm_kb": "3060756", "vmrss_kb": "2951668",
         "note": "VmHWM >> VmRSS proves a reclamation already occurred; UNAVAILABLE means this evidence is missing, not that it is absent"},
  "samples": [{"n":1,"t":"05:09:04Z","pct":93.11},{"n":2,"t":"05:09:19Z","pct":93.72},{"n":3,"t":"05:09:35Z","pct":91.68},{"n":4,"t":"05:09:50Z","pct":85.73},{"n":5,"t":"05:10:04Z","pct":86.28},{"n":6,"t":"05:10:20Z","pct":86.39}],
  "analysis": {"min_pct": 85.73, "max_pct": 93.72, "reclamation_dips": 2, "dip_detail": "93.72->91.68;91.68->85.73;"},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire",
  "tripwire_ref": "feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn — escalate ONLY on OOMKilled, or >93% with no dips, or >97% sustained no reclaim"
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    22Gi    38%    393k  232M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

**Verdict Analysis**:
- A-01 through A-11 (Container Status): All host_runtime_set services UP [RAW-PROBE L4-L16] → PASS
- A-12 through A-20 (Health Endpoints): All 5 endpoints OK [RAW-PROBE L18-L22] → PASS
- A-20 (pdf-extractor multi-probe discriminator): 3/3 probes passed [RAW-PROBE L33-L37] → PASS (majority-vote override)
- A-21 (Restart Count windowed): crashRestarts=0 within 4h window → PASS (< ALERT_THRESHOLD=2)
- A-30 (Memory Reclamation Discriminator): verdict="FOLD" per deep probe [RAW-PROBE L25-L30] → PASS (benign GC sawtooth; 2 reclamation dips observed; VmHWM=3060756 KB > VmRSS=2951668 KB confirms prior reclamation; MemPerc samples min=85.73% max=93.72% span 65s)
- A-32 (Disk): 38% < 85% [RAW-PROBE L31-L34] → PASS

**Signals emitted**: None (all Tier-1 checks passed)

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## d4-auto · 2026-07-29T03:00:02.863Z
D4 candidates: R3-no-board-row:data-quality-anomaly:DGC:Q1-2026

## x1b5c2a9 · 2026-07-29T02:33:15Z
### Audit Run Tier-2 (02:30–02:33 UTC 2026-07-29)
- Tier: 2 | Cron health: A-29 UNEXECUTABLE/BLOCKED (known-broken spec, FIX-AUDITOR-A29-UNEXECUTABLE-SPEC-SILENT-JOIN-DROP P1) | Data freshness: 7 checks (5 PASS, 2 CRITICAL)
- Anomalies: 2 critical (1 new B-06 VPS proxy, 1 dedup-skipped B-05 BCTC stale) | 0 info
- Status: DEGRADED

Fire-election: tick=2026-07-29T00:00Z (`0 */4 * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

**A-29 Cron Health Check**: UNEXECUTABLE/BLOCKED. Spec path `.microservices[0].crons` is NULL; real path `.project.microservices[0].crons` (70 entries). Only 33 parseable 5-field cron; rest prose. Runtime jobs (87) vs map crons (70) → ~48 match; name join broken on Job/:variant suffixes. systemAuditTier1/2/3 absent from `get_cron_health` (CronCreate crons, no fire-state data source). Cannot execute fire-gap check. Existing task: FIX-AUDITOR-A29-UNEXECUTABLE-SPEC-SILENT-JOIN-DROP (BACKLOG, P1). Not reporting PASS on substitute predicate.

**Freshness Sweep (B-01..B-13, C-06, C-07)**:
- A-29: UNEXECUTABLE (see above)
- B-05 (bctc-discover): CRITICAL push-age 510 min > 120 min SLA; queue=167 active items → STALE (dedup-skip, reported 2026-07-22T06:32:33Z)
- B-06 (VPS proxy bctc): CRITICAL last push 2026-07-28T08:23:22Z (18+ hours ago) — no recent activity despite ok status report → NEW signal posted
- B-09 (BCTC URL shape): PASS (0 SSC portal URLs)
- B-13 (stale pending BCTC): PASS (0 items >72h old)
- C-06 (market_messages 3h): PASS (4 rows, >0)
- C-07 (agent_signals 24h): PASS (66 rows, >0)

**Signals emitted**:
- B-05: SKIP-dedup (data_stale:bctc-discover:B-05, last_sent 2026-07-22T06:32:33Z, within 7d window)
- B-06: OK (data_stale:vps-bctc-proxy:B-06, new finding, posted to BUG)

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=2 | dashboard_rows=2

## d986065c · 2026-07-29T00:42:57Z
### Audit Run Tier-1 (00:30–00:41 UTC 2026-07-29)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 crashRestarts=1 PASS | A-30 MemPerc trough=36.62% (reclamation dips observed, floor +1.72pp vs 34.90% baseline) | A-32 Disk 37% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY

Fire-election: tick=2026-07-29T00:30Z (`*/30 * * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## 88ec89d6 · 2026-07-29T00:36:05Z
### Audit Run Tier-3 (02:00 UTC 2026-07-29)
- Tier: 3 | DB integrity deep scan: 16 checks (14 PASS, 2 WARN) | Tooling: 3/3 present | Connectivity: 4/4 UP | EPIPE: 0 | WAL sizes OK
- Anomalies: 2 new (0 critical, 2 warn, 0 info) | 1 dedup-skipped
- Status: DEGRADED

Fire-election: tick=2026-07-29T02:00Z (daily 02:00 UTC) — `task_claim` returned `claimed:true`. Led this tick.

**Tier-3 DB Checks Summary**: 14 PASS, 2 WARN. C-06 (market_messages 3h) SKIP-dedup. C-08 (orphaned alerts 69) NEW signal posted.

**Signals emitted**: C-06 SKIP-dedup, C-08 OK (new)

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=2 | dashboard_rows=2

## a1f7k9x5 · 2026-07-28T23:39:27Z
### Audit Run Tier-1 (23:30–23:39 UTC 2026-07-28)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 crashRestarts=1 PASS | A-30 MemPerc=10.38% (process age 40m51s, 3rd trajectory point) | A-32 Disk 38% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY

Fire-election: tick=2026-07-28T23:30Z (`*/30 * * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## 60d26f9b · 2026-07-28T23:10:32Z
### Audit Run Tier-1 (23:00–23:10 UTC 2026-07-28)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 crashRestarts=0 PASS | A-30 MemPerc=12.54% (fresh process, NOT leak evidence) | A-32 Disk 38% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY

Fire-election: tick=2026-07-28T23:00Z (`*/30 * * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0
