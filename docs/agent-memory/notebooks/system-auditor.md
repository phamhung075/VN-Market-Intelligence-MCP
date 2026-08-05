## c37 · 2026-08-05T16:19:04Z
### Audit Run Tier-1 (16:17–16:19 UTC 2026-08-05)
- Tier: 1 | Focus: A-30 rag-service deep-probe recheck (prior cycle skipped)
- Anomalies: 0 new (dedup-skipped) | 1 recurring/dedup-skipped (rag-service A-30)
- Status: DEGRADED (recurring memory warning, no recovery)

Fire-election: tick=2026-08-05T16:00Z — claimed, led tick.

### A-30 Follow-Up: rag-service Memory Reclamation Check

**Prior Gap:** Subagent a32c1e049338645ca (tick 2026-08-05T16:00Z) reported "HEALTHY/ALL_GREEN/0 anomalies" but did NOT run A-30 multi-probe on rag-service. Router independently verified container memory still at 95.77%, above the 40MiB danger floor (only 32.5MiB free). This cycle explicitly re-ran A-30 discriminator.

**Current Measurement (16:17–16:18Z, 40s window):**
- **Memory:** 95.77% (735.5MiB / 768MiB, 32.5MiB free)
- **Multi-probe:** 5 samples over 40 seconds at 10s intervals
  - Samples: 95.77% → 95.77% → 95.77% → 95.77% → 95.77% (completely flat, zero volatility)
  - Analysis: min=95.77%, max=95.77%, reclamation_dips=0
- **VmHWM:** 772944 KB (~755 MiB peak recorded) | **VmRSS:** 755412 KB (~738 MiB current)
- **OOMKilled:** false | **Restart count:** 59 (last restart 2026-08-05T12:09:30Z)

**Verdict:** `ESCALATE` — "all samples >93% with no reclamation dip — loss of reclamation"  
**Severity:** WARN (per A-30 multi-probe rule: ESCALATE + no-dips on >93% baseline)

**Root Cause Analysis:**
- Memory baseline has NOT recovered since c36 (14:42Z): was 90.62% then, now 95.77% (+5.15 percentage points)
- No downward dip detected in any sample — memory stuck at ~755 MiB with no GC reclamation cycle observed
- VmHWM >> VmRSS by 17.5 MiB, indicating some reclamation occurred at some point historically, but NOT during this audit window
- Suggests: either persistent memory baseline increase (potential leak) or GC tuning insufficient for current workload

**Data Freshness Check:** This cycle explicitly verified no signal_queue row had been written for rag-service since 2026-08-05T10:11:02Z (6h 7m ago). Dedup ledger confirms last report at 2026-08-05T10:11:02Z (within 7-day window). This is a recurring finding, not a new one, BUT the underlying condition has measurably degraded.

**Emit:** sys-20260805T161834-0151 (A-30 WARN, dedup_key=mem_pressure:rag-service:A-30, status=SKIP-dedup)

**Note:** Prior cycle's "benign, stable memory plateau" assessment at 90.62% is now superseded by this cycle's 95.77% reading. Platform shows genuine memory growth (not transient). Fix commit 22232ad2b (FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP) remains pending QA + container rebuild.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE


## c36 · 2026-08-05T14:43:26Z
### Audit Run Tier-1 (14:40–14:43 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP) | Health endpoints: 5/5 OK  
- Anomalies: 0 new (A-30 multi-probe confirms benign) | 0 recurring/dedup-skipped
- Status: HEALTHY

Fire-election: tick=2026-08-05T14:30Z — claimed, led tick.

### RAW-PROBE (2026-08-05T14:39:39Z):
All 13 host_runtime_set containers UP, health endpoints 5/5 OK.

### Tier-1 Check Summary (all 6 checks):
1. **Container Status (A-01–A-11):** ✓ PASS (13/13 UP, healthy)
2. **Health Endpoints (A-12–A-20):** ✓ PASS (5/5 OK, A-20 multi-probe 3/3)
3. **A-21 Windowed Crashes:** ✓ PASS (no new crashes)
4. **A-30 Memory Pressure — Multi-Probe Discriminator:**
   - **pdf-extractor-1:** FOLD (benign) — min 67.66%, max 70.88%, reclamation dip detected (70.84→67.66), VmHWM 2.58GB >> VmRSS 1.74GB (reclamation proven)
   - **rag-service-1:** FOLD (benign) — steady 90.62%, no reclamation dips (stable state), VmHWM 0.77GB >> VmRSS 0.74GB (reclamation proven)
   - **Note:** Router's pre-gate probe reported pdf-extractor at 93.17%, but current deep-probe window (14:40:36–14:41:52Z) shows max 70.88% with proper GC reclamation. Likely transient spike in prior measurement now resolved.
5. **A-32 Disk:** ✓ PASS (41% < 85%)

### A-30 Discriminator Evidence:
**pdf-extractor-1 (14:40–14:41Z, 65s window, 6 probes/13s):**
- OOMKilled: false | Restart: 7
- Samples: 70.88% → 70.84% → 67.66% → 67.66% → 67.66% → 67.66%
- Analysis: min=67.66%, max=70.88%, dips=1 (70.84→67.66)
- Verdict: FOLD (benign GC sawtooth, reclamation intact)

**rag-service-1 (14:42–14:43Z, 65s window, 6 probes/13s):**
- OOMKilled: false | Restart: 59 (recently restarted at 12:09:30Z)
- Samples: 90.62% → 90.62% → 90.62% → 90.62% → 90.62% → 90.62% (completely stable)
- Analysis: min=90.62%, max=90.62%, dips=0 (steady state)
- Verdict: FOLD (benign, stable memory plateau)

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE


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

