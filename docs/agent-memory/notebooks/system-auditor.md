# System Auditor Notebook

[Notebook initialized - Tier-2 audit cycle c46]

## c52 · 2026-08-12T14:00Z
### Audit Run Tier-1 (14:00–14:04 UTC 2026-08-12)
- Tier: 1 | Status: ALL_GREEN
- Anomalies: 0 new signals emitted | Wall time: 4min
- Summary: Pre-spawn detection of pdf-extractor mem-creep (88.95%) → recovery confirmed in this cycle (78.16%, SKIP gate)

**RAW-PROBE (2026-08-12T14:04:01Z):**
```
=== AUDITOR PROBE 2026-08-12T14:04:01Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up 3 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 20 hours (healthy)    vn-market-intelligence-mcp-mcp-server           20 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 37 hours (healthy)    vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)      vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)     vn-market-intelligence-mcp-macro-indicators     13 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)     vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)     mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)     vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)     vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)     vn-market-intelligence-mcp-technical-analysis   3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)     vn-market-intelligence-mcp-alert-engine         3 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)     vn-market-intelligence-mcp-kinh-dich-service    3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=13.25% MemUsage=406.9MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-rag-service-1 baseline 3.34% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 13.21% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 78.16% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.48% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.06% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 11.05% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.96% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 3.98% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 9.51% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.51% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.30% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.21% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    13Gi    51%    393k  138M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

**Verdict Summary:**
- **A-01 through A-11 (Container Status):** 13/13 UP [RAW-PROBE L3–L15] → PASS
- **A-12 through A-20 (Health Endpoints):** 5/5 OK HTTP 200 [RAW-PROBE L17–L21] → PASS; A-20 pdf-extractor 3/3 passes [RAW-PROBE L35–L37] → PASS
- **A-21 (Restart Count):** RestartCount=0 [RAW-PROBE L23] → PASS
- **A-30 (Memory Pressure):** pdf-extractor baseline 78.16% < 85% gate [RAW-PROBE L28] → SKIP (no deep-probe); all containers SKIP → PASS overall
  - *Note:* Pre-spawn probe detected pdf-extractor at 88.95% (FAILURE verdict, triggered this subagent spawn). Current baseline shows recovery to 78.16%, below investigative gate per spec; no A-30 signal this cycle.
- **A-32 (Disk):** 51% < 85% [RAW-PROBE L33] → PASS
- **A-33 (Hook Enforcement):** Load-bearing hooks liveness check → PASS (all present, executable, registered)

**Signals:** 0 new emissions (all checks PASS/SKIP-no-issue)

**[OUTPUT-CONTRACT]:**
- signals_posted: 0
- signals_queue_rows_written: 0
- dashboard_rows_written: 0
- telegram_sent: 0
- cycle_status: ALL_GREEN

## c51 · 2026-08-12T13:30Z
### Audit Run Tier-1 (13:30–13:35 UTC 2026-08-12)
- Tier: 1 | Status: DEGRADED
- Anomalies: 2 found (1 new durability, 1 known A-30) | 1 dedup-skipped
- Summary: Stale heartbeat durability alert + rag-service memory pressure (dedup known)

**D-CYCLE-2 Finding:** Tier-1 heartbeat stale >3h (84h gap since 2026-08-09T01:33:22Z). Multiple missed audit cycles detected via durability scan. Signal ID: sys-20260812T133441-7e30

**A-30 Rag-service:** At 88.54% memory (>85% threshold). Tracked by FU-RAG-DEPLOY-MEMORY (DONE_VERIFIED). Signal dedup-skipped (known). Signal ID: sys-20260812T133432-3b93

**Signals:**
- [emit-signal] OK dedup_key=auditor-cycle-missing:tier1:2026-08-12T13:30Z id=sys-20260812T133441-7e30 (NEW)
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 id=sys-20260812T133432-3b93 (known)

**DASHBOARD:** Both signals logged (D-CYCLE-2 + A-30)

## c50 · 2026-08-12T12:35Z
### Audit Run Tier-1 (12:35–12:38 UTC 2026-08-12)
- Tier: 1 | Services: 13 checked | Health: all endpoints 200 OK
- Anomalies: 0 new signals emitted | Status: ALL_GREEN (per spec)
- Wall time: 3min

**Probe Results Summary (RAW-PROBE at 12:35:46Z):**
Containers: 13/13 UP — A-01 to A-11 PASS
Health endpoints: 5/5 OK (HTTP 200) — A-12 PASS
A-30 rag-service: 85.97% (143.7 MiB free, within settled ceiling ~89-93%)
Disk usage: 49% (well below 85% threshold) — A-32 PASS

**A-30 Verdict:** STALE-ACK disposition; headroom above floor, trend DOWN from c49 (90.81%→85.97%); ALL_GREEN, 0 new signals.

## c49 · 2026-08-12T12:03Z
### Audit Run Tier-1 (12:03–12:06 UTC 2026-08-12)
- Tier: 1 | Services: 13 checked | Status: ALL_GREEN
- Wall time: 3min; A-30 verdict: FOLD (stable, no escalation triggers)

**Probe Summary:** All 13 containers UP; health 5/5 OK; rag-service 90.81% (stable, no OOMKilled); disk 49%.
