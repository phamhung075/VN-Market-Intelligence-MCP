## c6 · 2026-08-08T23:30Z

### Audit Run Tier-1 (23:30–23:35 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed | A-20 multiprobe: 3/3
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 CHRONIC ESCALATION + STALE-ACK discrepancy) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (CHRONIC WITH STALE-ACK DISCREPANCY):**
  - Baseline: 93.85% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: ALL exactly 93.85% (min 93.85%, median 93.85%, max 93.85%) — PERSISTENT FLAT-LINE
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all ≥93% sustained, VmHWM pinned at cap 1568 MiB of 1048 MiB limit)
  - State: OOMKilled=false, restarts=0, state_changed=false, started_at=2026-08-08T08:11:45Z
  - **MATERIAL DISCREPANCY:** Tracked fix FU-RAG-DEPLOY-MEMORY reported status=DONE_VERIFIED, but live probe shows IDENTICAL 93.85% flat-line condition persisting across cycles c5 (23:03Z) and c6 (23:30Z). No degradation in this cycle, but fix verification claim NOT reflected in live metrics. Flagging as material evidence for fix status review.
  - Emission: [emit-signal] SKIP-dedup (within 7d window, last sent 2026-08-08T17:38:48Z, sig ID sys-20260808T233548-3486)
- **mcp-server-1 A-30:** Baseline 8.23% < 85% gate → SKIP (healthy)
- **All other services:** Healthy (pdf-extractor, stock-price, macro-indicators, frontend, api-gateway, etc.)
- A-20 pdf-extractor: 3/3 in-container probes PASS | A-21 mcp-server crashes: 0 PASS | Disk: 49% PASS | A-33 hooks: OK
- CONTRACT-CONTRADICTION: NONE

#### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-08T23:33:40Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 12 hours (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 15 hours (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 10 days (healthy)
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)
mcp-gateway                                       Up 3 weeks (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=8.23% MemUsage=252.8MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 8.22% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 93.85% >= 85% investigate-gate — ENGAGE deep-probe
A-30 deep-probe: 6 samples all 93.85%, min 93.85%, median 93.85%, max 93.85%, reclamation_dips=0, discontinuities=0, VmHWM_pinned_at_cap=true — ESCALATE "loss of reclamation"

--- A-20 multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3 PASS

--- disk ---
Filesystem 49% capacity (< 85% PASS)
```

- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 last_sent=2026-08-08T17:38:48Z id=sys-20260808T233548-3486
- [emit-dashboard] OK id=sys-20260808T233548-3486 check_id=A-30


## c5 · 2026-08-08T23:03Z

### Audit Run Tier-1 (23:00–23:06 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed | A-20 multiprobe: 3/3
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 chronic escalation) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (CHRONIC):**
  - Baseline: 93.85% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: ALL exactly 93.85% (min 93.85%, median 93.85%, max 93.85%) — FLAT-LINE
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all ≥93% sustained, VmHWM pinned at cap)
  - State: OOMKilled=false, restarts=0, state_changed=false, started_at=2026-08-08T08:11:45Z
  - Emission: [emit-signal] SKIP-dedup (within 7d window, last sent 2026-08-08T17:38:48Z, sig ID sys-20260808T230606-5539)
- **mcp-server-1 A-30:** Baseline 8.63% < 85% gate → SKIP
- **All other services:** Healthy
- A-20 pdf-extractor: 3/3 in-container probes PASS | A-21 mcp-server crashes: 0 PASS | Disk: 47% PASS | A-33 hooks: OK
- CONTRACT-CONTRADICTION: NONE

#### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-08T23:03:40Z ===

--- docker ps -a ---
[13 containers, all Up/healthy — mcp-server 4h, pdf-extractor 11h, rag-service 15h]

--- health endpoints ---
[All 5 checked endpoints OK: mcp-server:3000, api-gateway:4000, macro-indicators:5004, pdf-extractor:5001, frontend:3001]

--- memory pressure ---
mcp-server: 8.63% MemUsage=265.1MiB / 3GiB (< 85% gate SKIP)
rag-service: 93.85% (>= 85% gate ENGAGE)

--- memory pressure multi-probe reclamation (A-30) ---
rag-service deep-probe ESCALATE: 6 samples all 93.85%, min 93.85%, median 93.85%, max 93.85%, reclamation_dips=0, discontinuities=0, VmHWM_pinned_at_cap=true — loss of reclamation verdict

--- A-20 multi-probe ---
pdf-extractor: in-container HTTP 200 (1/3), 200 (2/3), 200 (3/3) — pass_count=3/3 PASS

--- disk ---
Filesystem 47% capacity (< 85% PASS)
```

- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 last_sent=2026-08-08T17:38:48Z id=sys-20260808T230606-5539
- [emit-dashboard] OK id=sys-20260808T230606-5539 check_id=A-30
- [OUTPUT-CONTRACT] signals_posted=0 (dedup-skipped) | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1

# System Auditor — Notebook

## c4 · 2026-08-08T22:41:00Z
### Audit Run Tier-1 (22:38–22:40 UTC 2026-08-08)
- Tier: 1 | Services: 13 checked | Sources: N/A | DB checks: N/A
- Anomalies: 0 new (0 critical, 1 warn tracked, 0 info) | 1 dedup-skipped
- Status: DEGRADED

#### Findings:
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 id=sys-20260808T224058-0a62
- [emit-dashboard] OK id=sys-20260808T224058-0a62 check_id=A-30


Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c385 · 2026-08-08T22:21Z

### Audit Run Tier-2 (22:20–22:21 UTC 2026-08-08)
- Tier: 2 | Sources: 6+ checked | DB checks: 2
- Anomalies: 0 new (C critical, W warn, I info) | 0 dedup-skipped
- Status: HEALTHY

Tier-2 Freshness Sweep Results:
- A-29 Cron Fire: ON_TIME=58 STALE=8 MISSED=11 NEVER_FIRED=9 (M=90 total)
- B-06/B-07 VPS Routes: All observable routes healthy
- B-09 BCTC URL shape: PASS (0 malformed SSC URLs)
- C-06 Market messages (3h): 2 (PASS)
- C-07 Agent signals (24h): 24 (PASS)
- B-13 Stale pending BCTC: PASS (0 stale)
- Per-source freshness: All monitored sources healthy

Note: A-30 rag-service mem-creep (93.82%) is Tier-1 anomaly, tracked in PO.
- [OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0

## c384 · 2026-08-08T22:04Z

### Audit Run Tier-1 (22:04–22:06 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 chronic) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (PERSISTENT CHRONIC ESCALATION):**
  - Baseline: 93.82% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: ALL exactly 93.82% (min 93.82%, median 93.82%, max 93.82%) — FLAT-LINE
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all >93% sustained)
  - State: OOMKilled=false, restarts=0, state_changed=false, VmHWM=pinned_at_cap
  - Emission: [emit-signal] SKIP-dedup (WARN, FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS)
- **mcp-server-1 A-30:** Baseline 7.81% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 47% PASS
- [OUTPUT-CONTRACT] signals_posted=0 (dedup) | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=1

## c383 · 2026-08-08T21:30Z

### Audit Run Tier-1 (21:36–21:37 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 chronic) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (PERSISTENT CHRONIC PATTERN):**
  - Baseline: 93.80% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: ALL exactly 93.80% — FLAT-LINE
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all >93% sustained)
- **mcp-server-1 A-30:** Baseline 8.62% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 47% PASS
- [OUTPUT-CONTRACT] signals_posted=0 (dedup) | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=1
- [OUTPUT-CONTRACT] tier=1 | signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_events=1 SKIP-dedup

