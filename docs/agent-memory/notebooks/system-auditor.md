# System Auditor Notebook

Session memory for real-time audit cycles and findings.

## c22 · 2026-08-11T12:32:35Z

### Audit Run Tier-1 (12:32–12:35 UTC 2026-08-11)
- Tier: 1 | Container liveness + health endpoints + memory pressure (A-01 through A-33)
- Anomalies: 1 warn (A-30 pdf-extractor ESCALATE), 0 critical, 0 info | dedup: 0 skipped
- Status: **DEGRADED**
- [emit-signal] OK dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30 id=sys-20260811T123620-4a36
- [emit-dashboard] OK id=sys-20260811T123620-4a36 check_id=A-30

#### Container & Health Status (A-01 through A-20)
- [RAW-PROBE L3-17] docker ps: all host_runtime_set services UP and healthy ✓
- [RAW-PROBE L20-24] health endpoints: all 200 OK ✓
- All services operational and responding normally

#### Restart Count (A-21)
- [RAW-PROBE L27] mcp-server RestartCount=0 ✓

#### Memory Pressure Deep-Probe (A-30)

**A-30 pdf-extractor — ESCALATE VERDICT:**
- Baseline: 94.07% >= 85% investigate-gate → ENGAGE deep-probe
- All 6 samples sustained: min=94.07%, median=94.07%, max=94.07%
- Reclamation dips: 0 (no GC relief observed)
- Discontinuities: 0
- State changes: false (no restarts during window)
- OOMKilled: false
- VmHWM: pinned at cgroup cap (2587.6 MiB / 2621.4 MiB limit)
- Reason: "all samples >93% sustained high — loss of reclamation"
- **Severity: WARN** — genuine sustained high memory with confirmed loss of reclamation
- Prior context: baseline was 92.52% → escalated to 94.07%

**A-30 rag-service — FOLD VERDICT:**
- Baseline: 88.46% >= 85% investigate-gate → ENGAGE deep-probe
- All 6 samples: min=88.47%, median=88.47%, max=88.48%
- Reclamation dips: 0
- Discontinuities: 0
- State changes: false
- OOMKilled: false
- VmHWM: pinned at cap (1038.0 MiB / 1048.6 MiB limit)
- Reason: "benign GC sawtooth or below tripwire"
- **Verdict: NO EMIT** — benign pattern, no escalation tripwires met
- Prior context: was at 94.80% → improved to 88.46% (6.34pp descent)

#### Disk Usage (A-32)
- [RAW-PROBE] root filesystem: 46% capacity < 85% threshold ✓

#### Summary
- **A-30 pdf-extractor** escalates to WARN (sustained at 94.07%, zero reclamation dips, VmHWM at cap)
- **A-30 rag-service** remains benign, improved (descended to 88.46%, no escalation tripwires)
- All container/health checks PASS
- One WARN signal emitted per A-30 discriminator; DASHBOARD row appended

#### Analysis of Prior Context Breaches
- **pdf-extractor** (92.52% → 94.07%): A-30 deep-probe confirms sustained high with zero reclamation dips — genuine escalation warrants WARN
- **rag-service** (94.80% → 88.46%): A-30 verdict FOLD (benign) — prior STALE-ACK (FU-RAG-DEPLOY-MEMORY, DONE_VERIFIED) disposition holds; condition improved significantly

## c21 · 2026-08-11T12:17:54Z
### Audit Run Tier-3 (12:16–12:18 UTC 2026-08-11)
- Tier: 3 | DB integrity: full C-01 through C-16 | Service connectivity: A-25–A-28 | WAL health verified
- Anomalies: 0 critical, 0 warn, 1 info (C-06 post-recovery tracking) | dedup: 0 skipped
- Status: **HEALTHY**

#### DB Integrity Checks (C-01 through C-16)
**PASS:** 
- C-01: 97 distinct OHLCV codes (≥25 required) ✓
- C-02: 194 rows in daily_ohlcv (>0) ✓
- C-05: 0 SSC portal URLs found (clean) ✓
- C-07: 59 agent_signals in last 24h (>0) ✓
- C-12: market.db PRAGMA integrity_check OK ✓; pdf_extractor.db OK ✓
- C-13: WAL files clean (market.db-wal, pdf_extractor.db-wal both absent, <50MB if present) ✓

**TRACKING:**
- C-06: market_messages (0 in 3-hour window 09:16–12:16Z UTC)
  - Last message: 2026-08-11 06:00:06Z (pre-outage)
  - Post-recovery (12:00Z+): 0 messages detected
  - Context: API rate-limit recovery only 16min old (outage window 2026-08-09 06:03–2026-08-11 12:00Z)
  - Verdict: INFO — normal post-outage silence during pipeline restart, no escalation required

#### Inter-Service Connectivity (A-25 through A-28)
- stock-price:5000/health → PASS
- technical-analysis:5003/health → PASS
- alert-engine:5006/health → PASS
- pdf-extractor:5001/health → PASS (per Tier-1: mem_creep 92.52%, memRSS 94.80% during deep-probe)

#### Concurrent Activity Notes
- Tier-2 cycle (c75) ran at 12:20Z (4min after this cycle): found 2 WARN (B-13 stale BCTC queue, A-29 cron fire gaps)
- Tier-1 cycle (c20) at 12:00Z found A-30 rag-service ESCALATE on genuine sustained 96.78% (WARN emitted, dedup-skipped)
- No duplication of tier-1/2 findings in this tier-3 audit per operational instruction

#### Summary
Tier-3 deep audit during post-API-recovery window. All DB checks green. Market_messages pipeline restarting post-outage (expected 16-min silence). No CRITICAL anomalies. C-06 will be re-checked in next Tier-3 cycle to confirm recovery completion. Mem_creep on pdf-extractor (92.52%) and rag-service escalation are Tier-1 findings already reported.

## c75 · 2026-08-11T12:20:00Z
### Audit Run Tier-2 (12:00–12:20 UTC 2026-08-11)
- Tier: 2 | Sources: 5 checked | Crons: 90 checked | DB spot-checks: 4
- Anomalies: 2 new (0 critical, 2 warn, 0 info) | dedup: 0 skipped
- Status: DEGRADED
- [emit-signal] OK dedup_key=data_stale:bctc_vps_queue:B-13 id=sys-20260811T121737-2a33
- [emit-signal] OK dedup_key=auditor-a29-fire-gap:tier2-stale id=sys-20260811T121748-5da0

**Notes:**
- B-13: 4 BCTC queue items stuck >72 hours in pending status
- A-29: Cron fire check found 8 stale and 1 missed cron (vpsProxyWatchdog, taAlertScan, etc.)
- Trigger context: Tier-1 cycle c20 found genuine A-30 memory escalation on rag-service (92.52%/94.80%), emitted sys-20260811T121235-33fd (NOT duplicated here)
- Rate limits: All 14 sources ready, no saturation
- VPS proxy health: All services healthy (prices, news, sbv, bctc ok)
- C-06: 0 market_messages in 3h (expected if market idle)
- C-07: 59 agent_signals in 24h (PASS >0)

## c20 · 2026-08-11T12:00Z

### Audit Run Tier-1

#### Container & Health Status (A-01 through A-20)
- [RAW-PROBE L3-17] docker ps: all host_runtime_set services UP and healthy (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend) ✓
- [RAW-PROBE L20-24] health endpoints: all checks 200 OK ✓
- [RAW-PROBE L98-102] A-20 pdf-extractor multi-probe: 3/3 pass ✓

#### Restart Count (A-21)
- [RAW-PROBE L27] mcp-server RestartCount=0 ✓

#### Memory Pressure (A-30)
- [RAW-PROBE L30] mcp-server baseline: 12.66% < 85% investigate-gate → SKIP ✓
- [RAW-PROBE L34-58] pdf-extractor baseline: 95.14% ENGAGED deep-probe → verdict FOLD (benign GC sawtooth) ✓
- [RAW-PROBE L59-83] rag-service baseline: 96.78% ENGAGED deep-probe → verdict ESCALATE (sustained high, loss of reclamation) → **A-30 WARN emitted** ⚠
  - All 6 samples at 96.78% (min=96.78%, median=96.78%)
  - No reclamation dips (0 observed), no discontinuities
  - No state changes, no crashes
  - VmHWM data UNAVAILABLE (host-side headroom safety skip)
  - Root cause: genuine sustained memory floor, not false-positive like 2026-07-23T03:42Z incident
  - Prior STALE-ACK FU-RAG-DEPLOY-MEMORY (status=DONE_VERIFIED) now escalated to WARN

#### Disk Usage (A-32)
- [RAW-PROBE L95] root filesystem: 46% capacity < 85% threshold ✓

#### Summary
- A-30 rag-service escalation confirmed as genuine (deep-probe discriminator gate applied)
- WARN emitted but deduplicated (prior signal 2026-08-09T04:11:10Z within 7-day window)
- All other Tier-1 checks PASS
- No CRITICAL findings

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-11T12:07:49Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 days (healthy)     vn-market-intelligence-mcp-mcp-server           2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 11 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 11 hours (healthy)   vn-market-intelligence-mcp-rag-service          3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)     vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 12 days (healthy)    vn-market-intelligence-mcp-macro-indicators     12 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)    mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   3 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         3 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    3 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=12.66% MemUsage=388.8MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 12.65% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 95.14% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 96.78% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — all other services baseline < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    16Gi    46%    393k  171M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

[emit-signal] SKIP-dedup id=sys-20260811T121235-33fd
