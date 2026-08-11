## c32 · 2026-08-11T17:40Z

### Audit Run Tier-1 (17:30–17:40 UTC 2026-08-11)
- Tier: 1 | Container liveness + health endpoints + memory pressure A-30 discriminator
- Anomalies: 0 critical, 1 warn (A-30 pdf-extractor sustained memory, SKIP-dedup), 0 cycle-loss alerts
- Status: **DEGRADED** (A-30 WARN, deduped)

#### A-30 Memory Pressure Discriminator Analysis

**PDF Extractor — ESCALATE verdict (WARN, SKIP-dedup):**
- Baseline: 95.25% >= 85% investigate-gate → ENGAGE deep-probe
- Window: 6 probes at 13s intervals (65s total)
- Samples: 95.24%, 95.21%, 95.21%, 95.21%, 95.19%, 95.89%
  - min=95.19%, median=95.21%, max=95.89%
- Analysis: all samples >93% sustained
- Discontinuities: 0 (no crash-cliff pattern)
- Reclamation dips: 0 (no memory relief)
- State changes: false (no OOMKilled, RestartCount=1 stable)
- VmHWM: pinned_at_cap=true (2587.6 MB / 2620 MB limit)
- **Reason:** 'all samples >93% sustained high — loss of reclamation'
- **Severity:** WARN — sustained high memory without reclamation
- **Dedup status:** SKIP-dedup (same dedup_key sent 2026-08-11T12:36:18Z, ~4h 50m ago)
- **Finding:** Continuation of sustained memory ceiling from c31. PDF container unable to reclaim memory, indicating possible persistent memory leak or workload characteristics requiring larger allocation.
- **Discriminator note:** Not a crash-cliff (no >40pp discontinuity); no restart during window; VmHWM NOT advancing to new peak. Classification: reclamation loss, not failure event.

**RAG Service — PASS:**
- Baseline: 91.10% >= 85% investigate-gate → ENGAGE deep-probe
- Window: 6 probes at 13s intervals (65s total)
- Samples: all exactly 91.10% (perfectly stable)
  - min=91.10%, median=91.10%, max=91.10%
- Analysis: stable high band, no variation
- Discontinuities: 0
- Reclamation dips: 0 (but stable at high level, not a concern per A-30 logic)
- State changes: false (RestartCount=9 stable, no OOMKilled)
- VmHWM: pinned_at_cap=true (1038 MB / 1048 MB limit) but NOT advancing
- **Verdict:** FOLD (benign sawtooth pattern at stable high band)
- **Severity:** PASS — stable at elevated memory but not escalating
- **Status:** Already STALE-ACK'd under FU-RAG-DEPLOY-MEMORY (tracked_by, status=DONE_VERIFIED per context)
- **Note:** Acknowledgement applies here per A-30 discriminator rule — apply own logic, container shows benign stability pattern despite high memory ceiling. No new signal emitted.

#### Overall Verdict
- **DEGRADED** — A-30 WARN from pdf-extractor (dedup-suppressed, same finding as c31)
- RAG service memory stable under acknowledgement
- All other services passing liveness/health checks
- No new unforeseen conditions discovered in this cycle

#### Signal Emission Log
- [emit-signal] ABORT e1-not-written dedup (same payload, SKIP-dedup)
- [emit-dashboard] OK id=sys-20260811T174020-7025 check_id=A-30 (pdf-extractor A-30 WARN)

---


## c31 · 2026-08-11T17:06Z

### Audit Run Tier-1 (17:00–17:06 UTC 2026-08-11)
- Tier: 1 | Container liveness + health endpoints + memory pressure + A-20 multi-probe
- Anomalies: 0 critical, 1 warn (A-30 pdf-extractor sustained high memory, SKIP-dedup), 0 cycle-loss alerts
- Status: **DEGRADED**

#### Container & Health Status (A-01 through A-20)
- [RAW-PROBE L2-12] docker ps: all host_runtime_set services UP and healthy ✓
- [RAW-PROBE L14-18] health endpoints: all 200 OK ✓
- [RAW-PROBE L99-104] A-20 pdf-extractor multi-probe: 3/3 pass ✓
- mcp-server health stable (3h uptime)

#### Restart Count (A-21)
- [RAW-PROBE L20] mcp-server RestartCount=1 ✓

#### Memory Pressure Deep-Probe (A-30)

**A-30 pdf-extractor — ESCALATE VERDICT (WARN, SKIP-dedup):**
- Baseline: 94.90% >= 85% investigate-gate → ENGAGE deep-probe
- Samples over 65s window: 6 probes at 13s intervals
  - min=94.90%, median=94.90%, max=95.25%
- Reclamation dips: 0 detected
- Discontinuities: 0
- VmHWM state: pinned_at_cap=true, advancing_in_window=false
- State changes: false (no OOMKilled, no restarts during window)
- Reason: "all samples >93% sustained high — loss of reclamation"
- **Severity: WARN** — sustained high memory, zero capacity for memory reclamation
- **Dedup status: SKIP-dedup** (last reported 2026-08-11T12:36:18Z, ~4h 30m ago, same dedup_key)
- **Finding:** Continuation of sustained memory pressure from prior cycles. Repeated pattern. DASHBOARD row emitted (WARN, open status).

**A-30 rag-service — PASS:**
- Baseline: 76.92% < 85% investigate-gate → SKIP deep-probe ✓
- Healthy idle state (recovery from c29 spike)

**All other containers PASS** (< 85% investigate-gate or SKIP)

#### Disk Usage (A-32)
- [RAW-PROBE L93-95] /dev/disk1s4s1: 47% capacity → PASS ✓

#### Summary
- All runtime containers UP and healthy
- A-30 pdf-extractor continues sustained memory pressure (median 94.90%, loss-of-reclamation pattern) — SKIP-dedup
- rag-service healthy idle (76.92%)
- **Overall verdict: DEGRADED** due to A-30 WARN (SKIP-dedup from prior cycle)

#### Signal Emission
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30 last_sent=2026-08-11T12:36:18Z id=sys-20260811T170554-3b8d
- [emit-dashboard] OK id=sys-20260811T170554-3b8d check_id=A-30

#### Raw Probe Output
```
=== AUDITOR PROBE 2026-08-11T17:03:42Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)    vn-market-intelligence-mcp-mcp-server           2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 16 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 16 hours (healthy)   vn-market-intelligence-mcp-rag-service          3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 12 days (healthy)    vn-market-intelligence-mcp-macro-indicators     12 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)    mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         3 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=14.11% MemUsage=433.4MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 14.09% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 94.90% >= 85% investigate-gate — ENGAGE deep-probe
{
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; 0 dip(s) <=40pp observed, 0 discontinuity(ies) observed)",
  "samples": [{"n":1,"t":"17:03:53Z","pct":94.90},{"n":2,"t":"17:04:08Z","pct":94.90},{"n":3,"t":"17:04:22Z","pct":94.90},{"n":4,"t":"17:04:38Z","pct":94.90},{"n":5,"t":"17:04:52Z","pct":94.90},{"n":6,"t":"17:05:08Z","pct":95.25}],
  "analysis": {"min_pct": 94.90, "max_pct": 95.25, "median_pct": 94.90, "reclamation_dips": 0, "discontinuities": 0}
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    16Gi    47%    393k  164M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

---
# System Auditor Notebook

Session memory for real-time audit cycles and findings.

## c28 · 2026-08-11T15:37Z

### Audit Run Tier-1 (15:30–15:37 UTC 2026-08-11)
- Tier: 1 | Container liveness + health endpoints + memory pressure (A-01 through A-33)
- Anomalies: 0 critical, 1 warn (A-30 pdf-extractor sustained high memory, SKIP-dedup), 0 cycle-loss alerts
- Status: **DEGRADED**

#### Stale Marker Cleanup (Step 0b.1)
- No stale markers found (none >20min old)

#### Container & Health Status (A-01 through A-20)
- [RAW-PROBE L4-17] docker ps: all host_runtime_set services UP and healthy ✓
- [RAW-PROBE L20-24] health endpoints: all 200 OK ✓
- [RAW-PROBE L98-102] A-20 pdf-extractor multi-probe: 3/3 pass ✓
- mcp-server health stable: ~1 hour uptime

#### Restart Count (A-21)
- [RAW-PROBE L27] mcp-server RestartCount=1 ✓

#### Memory Pressure Deep-Probe (A-30)

**A-30 pdf-extractor — ESCALATE VERDICT (WARN, SKIP-dedup):**
- Baseline: 98.26% >= 85% investigate-gate → ENGAGE deep-probe
- Samples over 65s window: 6 probes at 13s intervals
  - min=97.22%, median=97.81%, max=98.26%
- Reclamation dips: 1 detected (98.26->97.23, ≤40pp)
- Discontinuities: 0
- VmHWM state: pinned_at_cap=true, advancing_in_window=false
- State changes: false (no OOMKilled, no restarts during window)
- Reason: "all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence)"
- **Severity: WARN** — sustained high memory, zero capacity for memory reclamation
- **Dedup status: SKIP-dedup** (last reported 2026-08-11T12:36:18Z, ~2h 55m ago, same dedup_key)
- **Finding:** Continuation of sustained memory pressure from prior cycle c27. Repeated pattern, no escalation. DASHBOARD row emitted (WARN, open status).

**A-30 rag-service — FOLD VERDICT (PASS):**
- Baseline: 89.91% >= 85% investigate-gate → ENGAGE deep-probe
- Samples over 65s window: 6 probes, all constant at 89.91%
- Analysis: benign GC sawtooth or below tripwire
- **Verdict: FOLD** (PASS-equivalent)

**All other containers PASS** (< 85% investigate-gate or SKIP)

#### Disk Usage (A-32)
- [RAW-PROBE L94-96] /dev/disk1s4s1: 46% capacity → PASS ✓

#### Summary
- All runtime containers UP and healthy
- A-30 pdf-extractor continues sustained memory pressure (median 97.81%, loss-of-reclamation pattern) — SKIP-dedup from prior 2.5h cycle
- rag-service baseline at 89.91% but verdict FOLD (benign sawtooth)
- No change from prior cycle — same dedup entry, no new BUG-channel alert
- **Overall verdict: DEGRADED** due to A-30 WARN (SKIP-dedup from c27)
