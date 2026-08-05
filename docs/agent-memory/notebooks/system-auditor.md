
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

## c29 · 2026-08-05T11:03:47Z
### Audit Run Tier-1 (11:00–11:03 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP, healthy) | Health endpoints: 5/5 OK
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 1 recurring/dedup-skipped (rag-service A-30)
- Status: DEGRADED (one recurring WARN)

Fire-election: tick=2026-08-05T11:00Z (`*/30 * * * *` Tier-1 boundary) — claimed, led tick.

### RAW-PROBE (2026-08-05T11:02:45Z):
- All 13 host_runtime_set containers UP, all healthy status
  - mcp-server: Up 49 minutes (healthy)
  - api-gateway: Up 2 weeks (healthy)
  - frontend: Up 11 days (healthy)
  - macro-indicators: Up 6 days (healthy)
  - pdf-extractor: Up 21 hours (healthy)
  - mcp-gateway: Up 2 weeks (healthy)
  - stock-price: Up 5 days (healthy)
  - technical-analysis: Up 2 weeks (healthy)
  - kinh-dich-service: Up 2 weeks (healthy)
  - alert-engine: Up 2 weeks (healthy)
  - rag-service: Up 3 hours (healthy)
  - news-fetch: Up 2 weeks (healthy)
- Health endpoints (5 probed): 5/5 OK (HTTP 200)
  - mcp-server:3000/health OK
  - api-gateway:4000/health OK
  - macro-indicators:5004/health OK
  - pdf-extractor:5001/health OK
  - frontend:3001/ OK
- A-20 pdf-extractor multi-probe: 3/3 pass (all HTTP 200) ✓ PASS
- A-21 windowed crashes (mcp-server): 6 crashes in 4h window (threshold: 2)
  - Crash timestamps: 09:24:37Z, 09:26:59Z, 09:35:07Z, 09:45:41Z, 10:09:54Z, 10:13:07Z
  - Status: RECURRING (no NEW crashes since c28 baseline 10:13Z)
  - Signal already emitted in c27 (sys-20260805T103434-24be)
- A-30 memory (mcp-server): 9.36% (287.5MiB / 3GiB) ✓ PASS
- A-30 memory (rag-service): 98.05% (768MiB / ~780MiB limit, ~12MiB free)
  - **CORROBORATION NOTE:** A-30 rag-service memory pressure NEW HIGH this session (98.05%, up from c28's 97.51%, trending worse)
  - Dedup key: mem_pressure:rag-service:A-30
  - Already tracked: sys-20260805T100834-7723 (dedup-active until 2026-08-12)
  - Root cause identified as: FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP (already-READY board row)
  - Status: In-flight PO dispatch as of c29 run time
  - Per audit instruction: NO multi-probe re-run, NO new signal, one-line corroboration recorded
- A-32 disk: 38% capacity (22GiB / 233GiB free) ✓ PASS

### Check Summary (all 6 Tier-1 checks):
1. **Container Status (A-01–A-11):** ✓ PASS (13/13 UP)
2. **Health Endpoints (A-12–A-20):** ✓ PASS (5/5 OK)
3. **A-20 Multi-probe Discriminator:** ✓ PASS (3/3 probes)
4. **A-21 Restart Count (windowed):** ⚠ RECURRING WARN (6 crashes, threshold=2) — no NEW crashes this cycle
5. **A-30 Memory Pressure:** ⚠ RECURRING WARN (rag-service 98.05%, dedup-tracked) — mcp-server ✓ PASS
6. **A-32 Disk:** ✓ PASS (38% < 85%)

### Findings Summary:
- **A-21 RECURRING (no new emit):** mcp-server 6 windowed crashes — already signaled c27, same set of crash timestamps (last: 10:13Z)
- **A-30 RECURRING (dedup-enforced):** rag-service 98.05% memory — NEW HIGH reading this session but already tracked/dedup'd, root cause identified and in PO dispatch

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

## c28 · 2026-08-05T10:41:01Z
### Audit Run Tier-1 (10:30–10:41 UTC 2026-08-05) [RE-RUN post-c27]
- Tier: 1 | Containers: 13 checked (all UP) | Health endpoints: 5/5 OK
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 1 recurring/dedup-skipped
- Status: DEGRADED

Fire-election: tick=2026-08-05T10:30Z (`*/30 * * * *` Tier-1 boundary) — claimed, led tick. Note: c28 re-run of same tick (c27 ran 10:30 tick, router pre-gate FAILURE on rag-service mem triggered re-audit).

### RAW-PROBE (2026-08-05T10:39:53Z):
- All 13 host_runtime_set UP; Health: 5/5 OK (mcp-server:3000, api-gateway:4000, macro-indicators:5004, pdf-extractor:5001, frontend:3001)
- A-20 pdf-extractor multi-probe: 3/3 pass (3×HTTP200)
- A-21 windowed crashes: 0 (no new crashes since c27 10:13:07Z baseline)
- A-30 memory (mcp-server): 8.10% ✓ PASS (baseline below 85% investigate-gate — deep-probe SKIP)
- A-30 memory (rag-service): 97.51% (RECURRING WARN, dedup-skipped) — matches c27 97.51% exactly
  - Headroom: 19.1 MiB free of 768 MiB total (below 40 MiB floor threshold)
  - Dedup key: mem_pressure:rag-service:A-30
  - Last tracked (dedup ledger): 2026-08-05T10:11:02Z (30 minutes prior to this cycle)
  - Decision: Within 7-day dedup window → SKIP-dedup (BUG telegram not sent, signal_queue row written)
  - Signal ID: sys-20260805T104107-762a | DASHBOARD row appended
- Disk: 39% capacity ✓ PASS

### Findings: A-30 recurring (dedup-enforced)
- **A-30 RECURRING (DEDUP-ENFORCED):** rag-service memory 97.51% (19 MiB free, below 40 MiB floor)
  - Persistent high-memory condition (c25: 97.77%, c27: 97.51%, c28: 97.51%) — sustained >97% for >3h
  - Dedup match: mem_pressure:rag-service:A-30 last sent 2026-08-05T10:11:02Z (now 30m ago)
  - Signal emitted: sys-20260805T104107-762a (dedup_key: mem_pressure:rag-service:A-30)
  - Outcome: SKIP-dedup (no BUG telegram within 7d window), signal_queue row written, DASHBOARD appended
  - Tracked backlog: FIX-RAG-DEPLOY-MEMORY (ops/developer responsibility)

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE
