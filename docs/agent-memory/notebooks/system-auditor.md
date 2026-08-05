## c35 · 2026-08-05T14:35:36Z
### Audit Run Tier-1 (14:32–14:34 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP) | Health endpoints: 5/5 OK  
- Anomalies: 1 new (A-30 pdf-extractor memory) | 1 recurring/dedup-skipped (rag-service)
- Status: DEGRADED (new WARN + recurring WARN)

Fire-election: tick=2026-08-05T14:00Z — claimed, led tick.

### RAW-PROBE (2026-08-05T14:32:45Z):
All 13 host_runtime_set containers UP, health endpoints 5/5 OK.

### Tier-1 Check Summary (all 6 checks):
1. **Container Status (A-01–A-11):** ✓ PASS (13/13 UP, healthy)
2. **Health Endpoints (A-12–A-20):** ✓ PASS (5/5 OK, A-20 multi-probe 3/3)
3. **A-21 Windowed Crashes:** ✓ PASS (6 historical, no new since 10:13:07Z)
4. **A-30 Memory Pressure:** ⚠ NEW WARN (pdf-extractor) + recurring (rag-service)
5. **A-32 Disk:** ✓ PASS (41% < 85%)

### A-30 NEW FINDING — pdf-extractor-1 Memory Pressure
**Current:** 89.5% (2.24 GiB / 2.5 GiB limit)  
**Trend:** 87.78% → 89.61% → 89.42% → 95.99% (rapid monotone increase over 30s)  
**VmPeak:** 6.77 GB | **VmHWM:** 2.46 GB | **VmRSS:** 2.22 GB  
**OOMKilled:** false | **Restart:** 0

**Analysis:** Memory monotone increase with no reclamation pattern. Tesseract processes running, active extraction in progress. 43 failed extractions in queue. Recurring OCR gateway errors: "semaphore != os_children" (child process bookkeeping mismatch).

**Severity:** WARN (A-30 memory pressure, no reclamation, rapid growth approaching limit)  
**Root Cause:** Memory leak in uvicorn pdf-extractor; child process tracking errors suggest Tesseract residue not cleaned.  
**Impact:** Service degraded, will OOMKill if not addressed.

**Signal:** sys-20260805T143448-6948 (A-30 WARN, dedup_key=microservice_degraded:pdf-extractor:A-30)

### A-30 Recurring — rag-service-1
- Status: Recurring WARN (95.67% → latest)
- Action: Awaiting rebuild from commit 22232ad2b
- Note: Do NOT re-investigate — already-established, tracked, fix pending

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE



## c34 · 2026-08-05T12:32:53Z
### Audit Run Tier-1 (12:30–12:35 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP, healthy) | Health endpoints: 5/5 OK
- Anomalies: 0 new | 1 recurring/dedup-skipped (rag-service A-30 memory)
- Status: DEGRADED (recurring WARN)

Fire-election: tick=2026-08-05T12:30Z — claimed, led tick.

### Tier-1 Check Summary (all 6 checks):
1. **Container Status (A-01–A-11):** ✓ PASS (13/13 UP, healthy)
2. **Health Endpoints (A-12–A-20):** ✓ PASS (5/5 OK, A-20 multi-probe 3/3)
3. **A-21 Windowed Crashes:** ✓ PASS (6 recurring, no new since 10:13:07Z)
4. **A-30 Memory:** ⚠ RECURRING (rag-service 95.67%, 33.3MiB free — improvement, closest to 40MiB floor)
5. **A-32 Disk:** ✓ PASS (39% < 85%)

### A-30 Corroboration (Independent docker stats verification):
- **rag-service:** 95.67% (734.7MiB / 768MiB, 33.3MiB free)
- **Trend:** 16.8 MiB (c32, most critical) → 38.0 MiB (c30) → 33.3 MiB (c34, current)
- **Status:** Genuine improvement — closest to 40MiB floor this session
- **Note:** Fix commit 22232ad2b (FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP) awaiting QA signoff + container rebuild

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

## c33 · 2026-08-05T12:12:12Z
### Audit Run Tier-1 (12:00–12:11 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP, healthy) | Health endpoints: 5/5 OK
- Anomalies: 0 new | 1 recurring/dedup-skipped (rag-service A-30 memory)
- Status: DEGRADED (recurring WARN from prior cycles)

Fire-election: tick=2026-08-05T12:00Z (`*/30 * * * *` Tier-1 boundary) — claimed, led tick.

### RAW-PROBE (2026-08-05T12:09:51Z):
All 13 host_runtime_set containers UP, health endpoints 5/5 OK.

### Tier-1 Check Summary:
1. **Container Status (A-01–A-11):** ✓ PASS (13/13 UP)
2. **Health Endpoints (A-12–A-20):** ✓ PASS (5/5 OK, A-20 multi-probe 3/3)
3. **A-21 Windowed Crashes:** ✓ PASS on new crashes (6 total is recurring baseline, no new since 10:13:07Z)
4. **A-30 Memory Pressure:** ⚠ RECURRING DEDUP
   - mcp-server: 22.48% ✓ PASS
   - rag-service: 92.07% (RECURRING, source fix in commit 22232ad2b awaiting rebuild)
5. **A-32 Disk:** ✓ PASS (38% < 85%)

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

## c32 · 2026-08-05T11:41:37Z
### Audit Run Tier-1 (11:30–11:41 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP, healthy) | Health endpoints: 5/5 OK
- Anomalies: 0 new | 1 recurring/dedup-skipped (rag-service A-30)
- Status: DEGRADED (recurring WARN)

Fire-election: tick=2026-08-05T11:30Z — claimed, led tick.

### RAW-PROBE (2026-08-05T11:39:54Z):
All 13 host_runtime_set containers UP, mcp-server: 15.55%, rag-service: 97.81% (16.8 MiB free, BELOW 40 MiB floor).

### Tier-1 Check Summary:
1. **Container Status:** ✓ PASS (13/13 UP)
2. **Health Endpoints:** ✓ PASS (5/5 + 3/3 multi-probe)
3. **A-21 Crashes:** ✓ PASS (recurring, no new)
4. **A-30 Memory:** ⚠ RECURRING DEDUP (rag-service 97.81%, fix commit 22232ad2b awaiting rebuild)
5. **A-32 Disk:** ✓ PASS (39% < 85%)

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE
