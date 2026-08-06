
## c66 · 2026-08-06T17:16Z
### Audit Run Tier-1 (17:12–17:16 UTC 2026-08-06)
- Tier: 1 | Services: 13 checked | Sources: 0 | DB checks: 0
- Anomalies: 1 new WARN (A-30 floor-breach) | 0 dedup-skipped
- Status: DEGRADED

### Findings:
**A-01 to A-11 (Container Status):** All 13 host_runtime_set services UP ✓

**A-12 to A-20 (Health Endpoints):** All 5 endpoints OK ✓

**A-20 pdf-extractor multi-probe:** 3/3 pass ✓

**A-21 (Restart Count):** mcp-server RestartCount=4, no new crashes in 4h window ✓

**A-30 (Memory Pressure - NEW FLOOR-BREACH):**
- rag-service: 98.79% of 1024 MiB (1012 MiB used, 12 MiB free) → **WARN floor-breach**
  - Breaches absolute headroom floor of 40 MiB per FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY
  - Condition acknowledged via FU-RAG-DEPLOY-MEMORY (capacity/cap decision) but suppression lifted by floor enforcement
  - Tracked: FU-RAG-DEPLOY-MEMORY, FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP
- mcp-server: 68.77% < 85% → PASS ✓

**A-32 (Disk):** 56% capacity < 85% → PASS ✓

**Signal emitted:**
[emit-signal] OK dedup_key=mem_pressure:rag-service:A-30-floor-breach id=sys-20260806T171507-1243
[emit-dashboard] OK id=sys-20260806T171507-1243 check_id=A-30

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE

## c65 · 2026-08-06T15:41:26Z
### Audit Run Tier-1 (15:30–15:41 UTC 2026-08-06)
- Tier: 1 | Services: 13 checked | Sources: 0 | DB checks: 0
- Anomalies: 0 new (C 0, W 0, I 0) | 1 dedup-skipped
- Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-06T15:40:22Z ===

--- docker ps -a ---
All 13 services UP (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=4

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=49.33% MemUsage=1.48GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 49.33% < 85% investigate-gate

--- disk df -h / ---
Capacity: 54% < 85% PASS

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings:
**A-01 to A-11 (Container Status):** All 13 host_runtime_set services UP ✓

**A-12 to A-20 (Health Endpoints):** All 5 endpoints OK ✓

**A-20 pdf-extractor multi-probe:** 3/3 pass ✓

**A-21 (Restart Count - Crash Detection):** mcp-server 4 crash restarts in 4h window (2026-08-06 12:17-12:25 UTC) → WARN (dedup-skipped, known issue from 2026-08-05T10:34:34Z)
Signal: sys-20260806T154111-1649

[emit-signal] SKIP-dedup dedup_key=microservice_degraded:mcp-server:A-21 last_sent=2026-08-05T10:34:34Z id=sys-20260806T154111-1649
[emit-dashboard] OK id=sys-20260806T154111-1649 check_id=A-21

**A-30 (Memory Pressure):** mcp-server 49.33% < 85% → PASS ✓

**A-32 (Disk):** 54% capacity < 85% → PASS ✓

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

## c64 · 2026-08-06T15:11:23Z
### Audit Run Tier-1 (15:00–15:10 UTC 2026-08-06)
- Tier: 1 | Services: 13 checked | Sources: 0 | DB checks: 0
- Anomalies: 1 dedup-skipped (0 new, 1 known)
- Status: DEGRADED

### Findings:
**A-01 to A-11 (Container Status):** All 13 host_runtime_set services UP ✓

**A-12 to A-20 (Health Endpoints):** All 5 OK ✓

**A-20 pdf-extractor multi-probe:** 3/3 pass ✓

**A-30 (Memory Pressure):**
- rag-service: 96.56% of 1GiB → WARN (persistent high baseline, no reclamation dips)
- mcp-server: 39.32% → PASS
Signal emitted (dedup-skipped, last sent 2026-08-06T08:16:21Z, occurrence 5-6 in FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH) | id=sys-20260806T151042-6d28

[emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 last_sent=2026-08-06T08:16:21Z id=sys-20260806T151042-6d28
[emit-dashboard] OK id=sys-20260806T151042-6d28 check_id=A-30

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE
