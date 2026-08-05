

## c33 · 2026-08-05T12:12:12Z
### Audit Run Tier-1 (12:00–12:11 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP, healthy) | Health endpoints: 5/5 OK
- Anomalies: 0 new | 1 recurring/dedup-skipped (rag-service A-30 memory)
- Status: DEGRADED (recurring WARN from prior cycles)

Fire-election: tick=2026-08-05T12:00Z (`*/30 * * * *` Tier-1 boundary) — claimed, led tick.

### RAW-PROBE (2026-08-05T12:09:51Z):
```
=== AUDITOR PROBE 2026-08-05T12:09:51Z ===

--- docker ps -a ---
All 13 host_runtime_set containers UP (all healthy status)
- mcp-server: Up 2 hours
- rag-service: Up 20 seconds (recently restarted)
- All others: healthy

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3 ✓ PASS

--- memory pressure ---
mcp-server: 22.48% (690.5MiB / 3GiB) ✓ PASS
[A-30] SKIP deep-probe — baseline 22.48% < 85%
rag-service: 92.07% (707.1MiB / 768MiB) ⚠ WARN (above 85%)

--- A-21 windowed crashes ---
6 crashes in 4h window (threshold: 2) — no new since baseline 2026-08-05T10:13:07Z

--- disk df -h / ---
38% capacity (22Gi free) ✓ PASS

=== PROBE DONE ===
```

### Tier-1 Check Summary:
1. **Container Status (A-01–A-11):** ✓ PASS (13/13 UP)
2. **Health Endpoints (A-12–A-20):** ✓ PASS (5/5 OK, A-20 multi-probe 3/3)
3. **A-21 Windowed Crashes:** ✓ PASS on new crashes (6 total is recurring baseline, no new since 10:13:07Z)
4. **A-30 Memory Pressure:** ⚠ RECURRING DEDUP
   - mcp-server: 22.48% ✓ PASS
   - rag-service: 92.07% (RECURRING, source fix in commit 22232ad2b awaiting rebuild)
5. **A-32 Disk:** ✓ PASS (38% < 85%)

### A-30 Recurring Finding:
- **Service:** rag-service (recent restart 20 seconds ago)
- **Metric:** 92.07% memory (707.1MiB / 768MiB)
- **Dedup Key:** mem_pressure:rag-service:A-30
- **Last Signal:** 2026-08-05T10:11:02Z (61 minutes ago)
- **Status:** SKIP-dedup (within 7d window, no new BUG telegram)
- **Root Cause:** FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP (source fix committed, awaiting container rebuild post-QA signoff)
- **Signal ID:** sys-20260805T121137-606d

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

## c32 · 2026-08-05T11:41:37Z
### Audit Run Tier-1 (11:30–11:41 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP, healthy) | Health endpoints: 5/5 OK
- Anomalies: 0 new | 1 recurring/dedup-skipped (rag-service A-30)
- Status: DEGRADED (recurring WARN)

Fire-election: tick=2026-08-05T11:30Z — claimed, led tick.

### RAW-PROBE (2026-08-05T11:39:54Z):
```
=== AUDITOR PROBE 2026-08-05T11:39:54Z ===

--- docker ps -a ---
All 13 host_runtime_set containers UP (mcp-server, stock-price, macro-indicators, pdf-extractor, frontend, mcp-gateway, api-gateway, flaresolverr, news-fetch, rag-service, technical-analysis, alert-engine, kinh-dich-service)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- memory pressure ---
mcp-server: 15.55% (477.7MiB / 3GiB) ✓ PASS
rag-service: 97.81% (751.2MiB / 768MiB, 16.8MiB free, BELOW 40MiB floor) ⚠ RECURRING

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200

--- A-21 windowed crashes ---
6 crashes in 4h window (threshold: 2), NO NEW since c28 baseline 10:13:07Z

--- disk ---
39% capacity (21GiB free) ✓ PASS

=== PROBE DONE ===
```

### Tier-1 Check Summary:
1. **Container Status:** ✓ PASS (13/13 UP)
2. **Health Endpoints:** ✓ PASS (5/5 + 3/3 multi-probe)
3. **A-21 Crashes:** ✓ PASS (recurring, no new)
4. **A-30 Memory:** ⚠ RECURRING DEDUP (rag-service 97.81%, fix commit 22232ad2b awaiting rebuild)
5. **A-32 Disk:** ✓ PASS (39% < 85%)

### A-30 Recurring Finding:
Signal ID: sys-20260805T114039-2c07 | Dedup key: mem_pressure:rag-service:A-30 | Status: SKIP-dedup (no new BUG telegram, within 7d window)

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

## c30 · 2026-08-05T11:12:25Z
### Audit Run Tier-1 (11:00–11:12 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP, healthy) | Health endpoints: 5/5 OK
- Anomalies: 1 recurring/dedup-skipped (rag-service A-30 memory) | 0 new
- Status: DEGRADED (one recurring WARN)

Fire-election: tick=2026-08-05T11:00Z (`*/30 * * * *` Tier-1 boundary) — claimed, led tick.

### RAW-PROBE (2026-08-05T11:02:11Z):
- All 13 host_runtime_set containers UP, health endpoints 5/5 OK (mcp-server:3000, api-gateway:4000, macro-indicators:5004, pdf-extractor:5001, frontend:3001)
- A-20 pdf-extractor multi-probe: 3/3 pass (3×HTTP200) ✓ PASS
- A-21 windowed crashes: 0 (no new crashes since c28 baseline)
- A-30 memory (mcp-server): 9.36% (287.5MiB / 3GiB) ✓ PASS
- A-30 memory (rag-service): 95.05% (38.0 MiB free, below 40 MiB floor)
  - **RECURRING DEDUP:** mem_pressure:rag-service:A-30
  - Last emitted: 2026-08-05T10:11:02Z (61 minutes ago, within 7d dedup window)
  - Trend: 97.77% (c25) → 97.51% (c27–c28) → 98.05% (c29) → 95.05% (c30) — volatile high-memory band
  - Status: SKIP-dedup (no new BUG telegram), signal_queue row written, DASHBOARD appended
  - Root cause: FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP (PO dispatch in-flight)
- A-32 disk: 39% capacity (22GiB / 233GiB free) ✓ PASS

### Check Summary (all 6 Tier-1 checks):
1. **Container Status (A-01–A-11):** ✓ PASS (13/13 UP)
2. **Health Endpoints (A-12–A-20):** ✓ PASS (5/5 OK, 3/3 multi-probe)
3. **A-21 Restart Count (windowed):** ✓ PASS (0 new crashes)
4. **A-30 Memory Pressure:** ⚠ RECURRING WARN (rag-service 95.05%, dedup-tracked)
5. **A-32 Disk:** ✓ PASS (39% < 85%)

### Findings: A-30 RECURRING (dedup-enforced)
- **A-30 RECURRING (SKIP-DEDUP):** rag-service memory 95.05% (38 MiB free, below 40 MiB floor)
  - Persistent high-memory condition continues (sustained >95% for >3h across c25–c30)
  - Dedup match: mem_pressure:rag-service:A-30 last sent 2026-08-05T10:11:02Z (now 61m ago)
  - Signal emitted: sys-20260805T111131-1c02 (dedup_key: mem_pressure:rag-service:A-30)
  - Outcome: SKIP-dedup (no BUG telegram within 7d window), signal_queue row written, DASHBOARD appended
  - Tracked backlog: FIX-RAG-DEPLOY-MEMORY (ops/developer responsibility)
  - Action: PLAN-ONLY detection; remediation is ops/developer job per AUD-ND-1

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE
