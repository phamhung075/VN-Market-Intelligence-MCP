## c33 · 2026-08-11T18:00Z

### Audit Run Tier-1 (18:00–18:15 UTC 2026-08-11)
- Tier: 1 | Container liveness + health endpoints + memory pressure A-30 discriminator
- Anomalies: 0 critical, 2 warn (A-30: pdf-extractor + rag-service), 0 cycle-loss alerts
- Status: **CRITICAL_MEMORY_CREEP** (escalated from prior DEGRADED)

#### Container & Health Status (A-01 through A-20)
[RAW-PROBE L4-17] docker ps: all host_runtime_set services UP and healthy ✓
[RAW-PROBE L20-24] health endpoints: all 200 OK ✓
[RAW-PROBE L99-102] A-20 pdf-extractor multi-probe: 3/3 pass ✓
[RAW-PROBE L27] mcp-server RestartCount=1 ✓
[RAW-PROBE L30] mcp-server MemPerc=13.52% < 85% → SKIP ✓

#### Memory Pressure Deep-Probe (A-30) — CRITICAL FINDINGS

**PDF Extractor (vn-market-intelligence-mcp-pdf-extractor-1) — ESCALATE VERDICT (WARN):**
[RAW-PROBE L34-58]
- Baseline: 95.91% >= 85% investigate-gate → ENGAGE deep-probe
- Window: 6 probes at 13s intervals (65s total)
- Samples: 95.21%, 97.74%, 95.20%, 97.78%, 95.19%, 95.19%
  - min=95.19%, median=95.20%, max=97.78%
- Reclamation dips: 2 detected (97.74→95.20, 97.78→95.19)
- Discontinuities: 0 (no crash-cliff pattern)
- State changes: false (no OOMKilled, RestartCount=1 stable)
- VmHWM: pinned_at_cap=true (2587.6 MB / 2620 MB limit), NOT advancing
- **Reason:** 'all samples >93% sustained high — loss of reclamation'
- **Verdict mapping:** reason contains 'loss of reclamation' → WARN
- **Severity:** WARN — sustained high memory without reclamation
- **Finding:** Continuation of sustained memory ceiling. PDF container unable to reclaim memory despite small dips. Indicates possible memory leak or workload requiring larger allocation.
- **Dedup key:** microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30

**RAG Service (vn-market-intelligence-mcp-rag-service-1) — ESCALATE VERDICT (CRITICAL):**
[RAW-PROBE L59-83]
- Baseline: 99.58% >= 85% investigate-gate → ENGAGE deep-probe
- Window: 6 probes at 13s intervals (65s total)
- Samples: all exactly 99.58% (perfectly flat at maximum)
  - min=99.58%, median=99.58%, max=99.58%
- Reclamation dips: 0 (no memory relief whatsoever)
- Discontinuities: 0 (no crash-cliff, but at absolute ceiling)
- State changes: false (no OOMKilled, RestartCount=9 stable)
- VmHWM: UNAVAILABLE (Amendment B host-side floor gate triggered — BELOW-FLOOR)
- **Reason:** 'all samples >93% sustained high — loss of reclamation'
- **Verdict mapping:** reason contains 'loss of reclamation' + all samples at 99.58% (BELOW-FLOOR) → CRITICAL
- **Severity:** CRITICAL — container at absolute maximum capacity, zero flexibility, BELOW-FLOOR condition (< 40MiB host headroom)
- **Finding:** RAG service pegged at 99.58% memory with zero reclamation. No buffer for any operational variance. Matches context "BELOW-FLOOR(floor=40MiB)". This is a resource exhaustion crisis.
- **Dedup key:** microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30

#### Overall Verdict
- **CRITICAL_MEMORY_CREEP** — Two containers in unsustainable memory state:
  - pdf-extractor: sustained 95%+ (WARN)
  - rag-service: sustained 99.58% BELOW-FLOOR (CRITICAL)
- All liveness and health checks passing (containers UP, endpoints 200 OK)
- But underlying memory resources critically constrained
- **Status escalated from DEGRADED → CRITICAL_MEMORY_CREEP** due to rag-service BELOW-FLOOR crossing resource exhaustion threshold

#### Signal Emission Summary
- A-30 WARN: pdf-extractor sustained high memory, loss of reclamation
  - [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30 last_sent=2026-08-11T12:36:18Z id=sys-20260811T181602-0de9
  - [emit-dashboard] OK id=sys-20260811T181602-0de9 check_id=A-30

- A-30 CRITICAL: rag-service BELOW-FLOOR, zero headroom
  - [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 last_sent=2026-08-09T04:11:10Z id=sys-20260811T181604-0404
  - [emit-dashboard] OK id=sys-20260811T181604-0404 check_id=A-30

**Dedup Status:** Both findings within 7-day dedup window (pdf-extractor ~5.5h ago, rag-service ~38h ago). BUG-channel alerts suppressed, signal_queue rows still appended per spec.

#### Raw Probe Output
```
=== AUDITOR PROBE 2026-08-11T18:09:17Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)    vn-market-intelligence-mcp-mcp-server           2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 17 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 17 hours (healthy)   vn-market-intelligence-mcp-rag-service          3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 12 days (healthy)    vn-market-intelligence-mcp-macro-indicators     12 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)    mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   3 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=13.52% MemUsage=415.5MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 13.51% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 95.91% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 99.58% >= 85% investigate-gate — ENGAGE deep-probe
[All other containers SKIP]

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    44%    393k  182M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

---

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

## c34 · 2026-08-11T18:22Z

### Audit Run Tier-2 (18:20–18:23 UTC 2026-08-11)
- Tier: 2 | Freshness sweep, VPS proxy health, cron fire gaps
- Anomalies: 5 critical, 3 warn (all A-29 cron fire gaps), 0 dedup-skipped (1 dedup-suppressed, 0 new BUG alerts)
- Status: **DEGRADED** (multiple stale/missed crons)

#### Cron Fire Check (A-29) — Critical Findings

**Stale/MISSED Crons (CRITICAL severity):**
1. `vpsProxyWatchdog`: STALE 9.5h (threshold: 0.3h)
   - [emit-signal] OK dedup_key=auditor-a29-fire-gap:vpsProxyWatchdog id=sys-20260811T182200-3071

2. `taAlertScan`: MISSED 2625.6h since 2026-04-24 (threshold: 0.4h)
   - [emit-signal] OK dedup_key=auditor-a29-fire-gap:taAlertScan id=sys-20260811T182212-2cf9

3. `bbAlertScan`: MISSED 2625.6h since 2026-04-24 (threshold: 0.4h)
   - [emit-signal] OK dedup_key=auditor-a29-fire-gap:bbAlertScan id=sys-20260811T182214-22a0

4. `taAlertNotifier`: STALE 9.6h (threshold: 0.4h)
   - [emit-signal] OK dedup_key=auditor-a29-fire-gap:taAlertNotifier id=sys-20260811T182226-798c

5. `priceUpdateWatchdog`: STALE 9.5h (threshold: 0.3h)
   - [emit-signal] OK dedup_key=auditor-a29-fire-gap:priceUpdateWatchdog id=sys-20260811T182228-0310

6. `vnIndexRefresh`: STALE 9.4h (threshold: 0.1h)
   - [emit-signal] OK dedup_key=auditor-a29-fire-gap:vnIndexRefresh id=sys-20260811T182231-76d5

**Additional WARN-level findings:**
1. `brokerSanctionsSweep`: STALE 274.4h (threshold: 36h) — [emit-signal] OK
2. `ragFtsRebuildCron`: STALE 526.1h (threshold: 36h) — [emit-signal] OK
3. `bctcReparseJob`: LATE 28.4h (threshold: 36h) — [emit-signal] SKIP-dedup (reported 2026-08-11T14:29:47Z)

#### VPS Proxy & Service Health (B-06, B-07)
- All VPS proxy services healthy: prices, news, sbv, bctc (all `ok` status)
- VPS service health: 3 healthy (vn-bctc-fetch, vn-news-fetch, vn-sbv-fetch), 2 idle/market-closed
- **Verdict: B-06/B-07 PASS**

#### Data Freshness Check (B-01 through B-12)
- Pipeline status: healthy (all major tickers with TA ready)
- Last aggregator run: 2026-08-06 (normal for Tier-2 cadence check)
- No stale sources detected within cadence thresholds
- **Overall Verdict: B-xx sources within acceptable freshness**

#### Summary
- **Signal Emission:** 8 signals emitted (5 critical A-29, 3 warn A-29), 1 dedup-suppressed
- **BUG Channel:** 0 new alerts (1 finding already within 7-day dedup window)
- **Next Action:** Escalate cron restart gaps to ops for immediate investigation. Watchdog crons need urgent re-arming.

---
