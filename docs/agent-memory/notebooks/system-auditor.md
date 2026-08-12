# System Auditor Notebook

[Notebook initialized - Tier-2 audit cycle c53]

## c55 · 2026-08-12T15:30Z
### Audit Run Tier-1 (15:30–15:35 UTC 2026-08-12)
- Tier: 1 | Status: DEGRADED
- Anomalies: 2 found (1 new, 1 dedup-known)
- Wall time: ~4min
- Summary: A-30 memory pressure on two containers; pdf-extractor escalation continuing; rag-service tracked

**RAW-PROBE:** [2026-08-12T15:33:31Z]
All services UP (docker ps ✓), all health endpoints 200 ✓, disk 48% ✓

**Container Status (A-01..A-11):** All PASS
**Health Endpoints (A-12..A-19):** All PASS  
**A-20 (pdf-extractor multi-probe):** 3/3 probes 200 OK → PASS
**A-21 (Restart count):** mcp-server RestartCount=0 → PASS
**A-32 (Disk):** 48% capacity → PASS

**A-30 (Memory Pressure — Multi-Probe Verdict):**

- **vn-market-intelligence-mcp-rag-service-1:** baseline 95.57%
  - Verdict: ESCALATE — "all samples >93% sustained high — loss of reclamation"
  - severity: WARN (sustained >93% floor, no state change/OOMKilled/discontinuity/vmhwm advance)
  - Signal: [emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 last_sent=2026-08-06T08:16:21Z id=sys-20260812T153534-59fc
  - DASHBOARD row: [emit-dashboard] OK id=sys-20260812T153534-59fc check_id=A-30
  - Note: Dedup-skipped (within 7-day window from prior send 2026-08-06)

- **vn-market-intelligence-mcp-pdf-extractor-1:** baseline 95.36%
  - Verdict: ESCALATE — "all samples >93% sustained high — loss of reclamation"
  - severity: WARN (sustained >93% floor, no state change/OOMKilled/discontinuity/vmhwm advance)
  - Signal: [emit-signal] OK dedup_key=microservice_degraded:pdf-extractor:A-30 id=sys-20260812T153538-7fe5
  - DASHBOARD row: [emit-dashboard] OK id=sys-20260812T153538-7fe5 check_id=A-30
  - Escalation trend confirmed: 88.95% → 78.16% (SKIP) → 93.92% → 95.23% → 95.36% (current)
  - Pattern analysis: sustained loss of reclamation without crash cliff indicates workload growth or inefficiency

**Other Containers:** All baseline <85% → SKIP gate → PASS

**Summary:** Both rag-service and pdf-extractor show sustained memory >93% with loss of reclamation pattern. No death indicators (OOMKilled/state change/discontinuity). pdf-extractor shows genuine escalation trend (4-cycle climb from 88.95% baseline). Tracked findings; rag-service known from prior work, pdf-extractor new emit this cycle.

**Signals:**
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 last_sent=2026-08-06T08:16:21Z id=sys-20260812T153534-59fc
- [emit-signal] OK dedup_key=microservice_degraded:pdf-extractor:A-30 id=sys-20260812T153538-7fe5
- [emit-dashboard] OK id=sys-20260812T153534-59fc check_id=A-30
- [emit-dashboard] OK id=sys-20260812T153538-7fe5 check_id=A-30

**[OUTPUT-CONTRACT]** signals_posted=2 | telegram_sent=1 | signal_queue_rows_written=2 | dashboard_rows=2 | dedup_skipped=1

**[HEARTBEAT]** no heartbeat written this cycle (Tier-1 subagent never touches auditor-tier1-last-healthy.json)

**[CONTRACT-CONTRADICTION]** NONE

---

## c53 · 2026-08-12T14:21Z
### Audit Run Tier-2 (14:21–14:22 UTC 2026-08-12)
- Tier: 2 | Services checked: N/A (Tier-2 freshness sweep) | Sources: 28 checked
- Anomalies: 1 new (1 WARN) | 0 dedup-skipped
- Status: DEGRADED

**Findings:**
- **B-07 (VPS Service Health):** vn-bctc-fetch reported unhealthy. BCTC data pipeline at risk. Signal: sys-20260812T142118-1332
- [emit-signal] OK dedup_key=microservice_degraded:vn-bctc-fetch:B-07 id=sys-20260812T142118-1332
- [emit-dashboard] OK id=sys-20260812T142118-1332 check_id=B-07

**Tier-1 Context (caller dispatch):**
- PDF-extractor memory escalating: 88.95% → 78.16% (c52 PASS) → 93.92% (current)
- Genuinely escalating trend, not transient noise. A-30 engage on next Tier-1 cycle.

**Freshness Summary:** All sources PASS (pipeline healthy, SLA compliance OK, VPS proxy ok/idle)

## c52 · 2026-08-12T14:00Z
### Audit Run Tier-1 (14:00–14:04 UTC 2026-08-12)
- Tier: 1 | Status: ALL_GREEN
- Anomalies: 0 new | Wall time: 4min
- Summary: pdf-extractor mem recovery (78.16%, SKIP gate) → ALL_GREEN

**A-30:** pdf-extractor baseline 78.16% < 85% gate → SKIP, PASS
- Note: Pre-spawn detected 88.95%, recovered to 78.16%

**Signals:** 0 (all PASS)

## c51 · 2026-08-12T13:30Z
### Audit Run Tier-1 (13:30–13:35 UTC 2026-08-12)
- Tier: 1 | Status: DEGRADED
- Anomalies: 2 found (1 new, 1 dedup-known)
- Summary: Durability alert + rag-service memory (88.54%, dedup-known)

**D-CYCLE-2:** Tier-1 heartbeat stale >3h. Signal: sys-20260812T133441-7e30 (NEW)
**A-30 rag-service:** 88.54% memory. Signal dedup-skipped (known tracking)

## c54 · 2026-08-12T15:00Z
### Audit Run Tier-1 (15:00–15:07 UTC 2026-08-12)
- Tier: 1 | Status: DEGRADED
- Anomalies: 1 tracked (A-30 pdf-extractor) | 0 new this cycle (dedup-known)
- Wall time: ~2min
- Summary: A-30 memory pressure escalation on pdf-extractor (95.23% sustained); rag-service benign (FOLD)

**RAW-PROBE:** [2026-08-12T15:05:06Z]
All services UP (docker ps ✓), all health endpoints 200 ✓, disk 51% ✓

**Container Status (A-01..A-11):** All PASS
**Health Endpoints (A-12..A-19):** All PASS  
**A-20 (pdf-extractor multi-probe):** 3/3 probes 200 OK → PASS
**A-21 (Restart count):** mcp-server RestartCount=0 → PASS
**A-32 (Disk):** 51% capacity → PASS

**A-30 (Memory Pressure — Multi-Probe Verdict):**
- **vn-market-intelligence-mcp-rag-service-1:** baseline 91.81%
  - Verdict: FOLD (benign GC sawtooth below tripwire)
  - 6 samples: all 91.81% (stable, no dips, no crashes) → PASS, no emit
  
- **vn-market-intelligence-mcp-pdf-extractor-1:** baseline 95.23%
  - Verdict: ESCALATE — "loss of reclamation" (all 6 samples >93% sustained, min=95.23%, median=95.23%, 0 dips)
  - severity: WARN (escalate on >93% sustained-floor, no death indicators present)
  - Signal emitted: sys-20260812T150735-2e4e
  - Dedup: SKIP-dedup (last sent 2026-08-11T12:36:18Z — within 7-day window)
  - DASHBOARD row appended (id=sys-20260812T150735-2e4e)

**Other Containers:** All baseline <85% SKIP gate → PASS

**Summary:** pdf-extractor memory persistent high (95.23% sustained above 93% floor) — no crash cliff, no OOMKilled, no state change during window. Tracked finding. Escalation pattern (88.95%→78.16%→93.92%→95.23% across c51–c54) indicates legitimate workload growth or inefficient reclamation, not transient jitter.

**Signals:** 
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30 last_sent=2026-08-11T12:36:18Z id=sys-20260812T150735-2e4e
- [emit-dashboard] OK id=sys-20260812T150735-2e4e check_id=A-30


**[OUTPUT-CONTRACT]** signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1

**[HEARTBEAT]** no heartbeat written this cycle (Tier-1 subagent never touches auditor-tier1-last-healthy.json)

**[CONTRACT-CONTRADICTION]** NONE

---

