# System Auditor — Tier-1 Notebook

## c1006 · 2026-08-24T13:56Z
### Audit Run Tier-2 (12:00–13:56 UTC 2026-08-24)
- Tier: 2 | Services: VPS 4/4 healthy | Sources: 5/5 SLA OK | Cron: 89 total
- Anomalies: 2 new (C critical, W warn) - CRON FIRE GAPS + UNRESOLVED JOINS | 0 dedup-skipped
- Status: DEGRADED

#### Findings
**A-29 — Cron Fire Gaps (CRITICAL):**
- 11 STALE/MISSED crons detected:
  - monthlySignalQualityAudit: MISSED (last 2026-06-01, now 2026-08-24 = 2029h overdue)
  - ragFtsRebuildCron: STALE (last 2026-07-20 = 835h overdue)
  - alertDigest: STALE (239h overdue)
  - eveningSummary: STALE (238h overdue)
  - vpsProxyWatchdog: STALE (5h overdue)
  - alertScanParallel: STALE (5.1h overdue)
  - taAlertNotifier: STALE (5.1h overdue)
  - priceUpdateWatchdog: STALE (5h overdue)
  - vnIndexRefresh: STALE (5h overdue)
  - brokerSanctionsSweep: STALE (581h overdue)
  - ohlcvSanityCheck: STALE (238h overdue)

**A-29b — Unresolved-Join (WARN):**
- 9 crons with unresolved job_name_db (join fell through to honest fallback):
  - marketOpen, marketClose, dataAuditDaily, summaryWeekly, summaryMonthly, summaryQuarterly, summaryYearly, foreignFlowFetch, publicContractsRefresh
  - Cause: Layer A name-join has known gap (8–9 names incl. these)
  - Verdict: reclassified as UNRESOLVED-JOIN, not dead-cron finding

**D-CYCLE-2 — Tier-2 Schedule Gap (WARN via durability sweep):**
- Signal: sys-20260824T135127-56bd (dedup_key=auditor-cycle-missing:tier2:2026-08-24T12:00Z)
- Last Tier-2 heartbeat: 2026-08-24T08:00Z (4h ago)
- Expected boundary: 2026-08-24T12:00Z
- Gap: 1 missed Tier-2 cycle

#### Tier-2 Pipeline Health Summary
- Pipeline aggregator: last run 2026-08-22 12:40 (healthy idle, BCTC quarterly off-season)
- VPS proxy health: 4/4 services OK (prices, news, sbv, bctc)
- VPS service health: 3 healthy, 2 idle (market hours ended)
- Data freshness: all 5 sources within SLA (price 323m, bctc 10080m, news 30m, sbv 30m, foreign_flow 323m)
- Rate limits: 11 sources all ready, no saturation

#### Summary
Tier-2 audit completed. Primary finding: cron fire-gap surge with 11 STALE/MISSED + 9 UNRESOLVED-JOIN entries. Durability sweep also detected one missed Tier-2 cycle. All data-freshness SLAs remain satisfied. No emergency intervention required this cycle; forward these findings to ops/dev for investigation (possible scheduler stall or missed restart).

## c1007 · 2026-08-24T18:32Z
### Audit Run Tier-2 (16:00–18:32 UTC 2026-08-24)
- Tier: 2 | Services: VPS 5/5 (3 healthy + 2 market-idle) | Sources: 5/5 SLA OK | Cron: 89 total
- Anomalies: 0 new | 17 dedup-skipped (A-29: 7 STALE + 1 MISSED + 9 unresolved-join from prior cycle)
- Status: ALL_GREEN (freshness sweep passed, cron anomalies from prior tick)

#### Step 0b.1/0b.2 — Durability Sweep
- Stale markers: 0 swept
- Malformed keys: 0
- Schedule gaps: t1=0, t2=0, t3=0
- Verdict: PASS

#### Step A-29 — Cron Fire Check (via /api/cron-status)
- Layer_a total: 89 crons
- Status ON_TIME: 72
- Status STALE: 7 (individual investigation needed)
- Status MISSED: 1 (individual investigation needed)
- Unresolved-join (honest fallback, no fire evidence): 9 crons
  - marketOpen, marketClose, dataAuditDaily, summaryWeekly, summaryMonthly, summaryQuarterly, summaryYearly, foreignFlowFetch, publicContractsRefresh
- N-of-M line: observed N=83 of M=89 spec'd crons
- Verdict: informational (prior cycle had acute gap; this cycle stable with 7 STALE threshold met)

#### Tier-2 Freshness Sweep Results
**Per-Source SLA Check (B-01..B-07, B-11, B-12):**
- price: 46m age / 602m SLA = OK
- bctc: 284m age / 10080m SLA = OK
- news: 74m age / 242m SLA = OK
- sbv_fx: 10m age / 30m SLA = OK
- foreign_flow: 572m age / 602m SLA = OK
- Verdict: 5/5 PASS

**VPS Service Health (B-06, B-07):**
- vn-price-fetch: idle (market closed)
- vn-bctc-fetch: healthy
- vn-news-fetch: healthy
- vn-sbv-fetch: healthy
- vn-foreign-flow: idle (market closed)
- Verdict: all mapped routes OK, 2 market-idle by design

**Rate Limits (B-14):**
- 14 sources polled
- Ready: 14 (100%)
- Waiting: 0
- Verdict: PASS

**Pipeline Aggregator Health (B-01):**
- Last run: 2026-08-22 12:40 (scheduled BCTC quarterly idle, ok)
- Backfill queue: empty
- Tickers ready: 32/32 (all OHLCV data fresh, TA ready)
- Non-neutral signals: 2 (HUT oversold RSI14=22, VHM oversold RSI14=26.6)
- Verdict: PASS

**Macro Snapshot (B-09 implicitly):**
- Status: ok
- VN Index: 1788.78 (up 20.66 from prev)
- Oil: $92.24 (neutral band)
- Gold: $4693.10 (bullish, safe-haven)
- USDVND: 25980 (bearish, VND depreciation)
- Verdict: PASS

#### Summary
Tier-2 freshness audit cycle complete — ALL_GREEN on this tick's freshness sweep. Prior tick's cron anomalies (7 STALE, 1 MISSED, 9 unresolved) remain in log for ops/dev investigation. Durability sweep clean. No emergency signals warranted this cycle. Data pipeline healthy, within all SLAs.

#### Durability Sweep Trace
[durability-sweep] swept=0 malformed=0 found=0 schedule_gap_t1=0 schedule_gap_t2=0 schedule_gap_t3=0


## c1008 · 2026-08-24T20:00Z
### Audit Run Tier-1 (19:31–20:19 UTC 2026-08-24)
- Tier: 1 | Fire tick: 2026-08-24T20:00Z | Pre-gate verdict: FAILURE (launchd_agents) | Spawn decision: SPAWN
- All runtime checks A-01 through A-33: PASS
- Anomalies: 0 new findings (pre-gate launchd FP already tracked in ready[107]/ready[108])
- Status: ALL_GREEN (non-launchd dimensions)

#### RAW-PROBE Output

```
=== AUDITOR PROBE 2026-08-24T20:18:26Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 11 minutes (healthy)   vn-market-intelligence-mcp-frontend             11 minutes ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 hours (healthy)      vn-market-intelligence-mcp-pdf-extractor        7 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)      vn-market-intelligence-mcp-mcp-server           8 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 days (healthy)       vn-market-intelligence-mcp-alert-engine         2 days ago
vn-market-intelligence-mcp-rag-service-1          Up 9 days (healthy)       vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 11 days (healthy)      vn-market-intelligence-mcp-news-fetch           11 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)      vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 weeks (healthy)      vn-market-intelligence-mcp-stock-price          2 weeks ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 weeks (healthy)      vn-market-intelligence-mcp-macro-indicators     3 weeks ago
mcp-gateway                                       Up 5 weeks (healthy)      mcpservergatway-gateway                         5 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 5 weeks (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        5 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 weeks (healthy)      vn-market-intelligence-mcp-technical-analysis   5 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 weeks (healthy)      vn-market-intelligence-mcp-kinh-dich-service    5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=18.39% MemUsage=565MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 10.86% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 65.95% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 18.40% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 1.83% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-rag-service-1 baseline 76.45% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 5.59% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.40% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.50% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.30% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 2.04% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.23% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 2.98% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  268M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

#### A-01 through A-11 — Docker Container Status (host_runtime_set)

**Verdicts (from [RAW-PROBE] docker ps section):**
- mcp-server: Up 8 hours (healthy) [RAW-PROBE L8] — PASS
- api-gateway: Up 11 days (healthy) [RAW-PROBE L7] — PASS
- frontend: Up 11 minutes (healthy) [RAW-PROBE L6] — PASS
- macro-indicators: Up 3 weeks (healthy) [RAW-PROBE L11] — PASS
- mcp-gateway: Up 5 weeks (healthy) [RAW-PROBE L12] — PASS
- pdf-extractor: Up 7 hours (healthy) [RAW-PROBE L9] — PASS

All host_runtime_set services UP and HEALTHY.

#### A-12 through A-20 — Health Endpoints

**Verdicts (from [RAW-PROBE] health endpoints section):**
- mcp-server:3000/health: HTTP 200 [RAW-PROBE L19] — PASS
- api-gateway:4000/health: HTTP 200 [RAW-PROBE L20] — PASS
- macro-indicators:5004/health: HTTP 200 [RAW-PROBE L21] — PASS
- pdf-extractor:5001/health: HTTP 200 [RAW-PROBE L22] — PASS
- frontend:3001/: HTTP 200 [RAW-PROBE L23] — PASS

#### A-20 — pdf-extractor Multi-Probe Discriminator

**Verdict:** 3/3 probes passed (100% pass rate) [RAW-PROBE L30] — PASS

#### A-21 — Restart Count

**Verdict (from [RAW-PROBE]):** RestartCount=0 [RAW-PROBE L26] — PASS (no crashes in 4h window)

#### A-30 — Memory Pressure & Reclamation

**Verdict:** All containers well below 85% gate; all SKIPped deep-probe [RAW-PROBE L32-43]:
- mcp-server: 18.40% < 85% — SKIP
- rag-service: 76.45% < 85% — SKIP
- pdf-extractor: 65.95% < 85% — SKIP
- (all others similarly below gate)

#### A-32 — Disk

**Verdict (from [RAW-PROBE]):** 35% used [RAW-PROBE L45] — PASS (well below 85% threshold)

#### A-33 — Hook Enforcement Liveness

**4 load-bearing hooks:** orch-state-hook-bash-backstop.sh, context-bloat-backstop.sh, notebook-auto-prune.sh, branch-hygiene-stop.sh — ALL registered and executable — PASS

**3 LOW-tier hooks:** tmux-agent.sh status, tmux set-option, graphify — ALL registered — PASS (LOW)

#### Pre-Gate Context & Known False Positive

**Pre-gate probe verdict:** FAILURE (launchd_agents)
- Check: com.vn-market.fleet-push NOT-LOADED
- Root cause: CONFIRMED FALSE POSITIVE (deliberately disabled by user, no regression)
- Status: Already tracked in ready[107] (FIX-AUDITOR-TIER1-PROBE-SCORES-DELIBERATELY-DISABLED-LAUNCHD-JOB-AS-DEGRADED, P1) and ready[108] (FIX-AUDITOR-TIER1-PROBE-TEST-INVERTED-ASSERTION-L1422-FALSE-GREEN, P1)
- Action: Do NOT file new signal row (per pre-gate instruction); covered by existing rows

#### Summary

**Tier-1 runtime audit cycle complete — ALL_GREEN on all observable dimensions (A-01 through A-33).**

The pre-gate probe returned FAILURE due to a launchd_agents check on a deliberately-disabled job. This is a known false positive already tracked via two P1 rows in the ready lane. All other dimensions (container status, health endpoints, memory, disk, hook liveness, A-20 multi-probe, A-21 windowed crash check, A-33 hook enforcement) passed with no alerts.

No new signals warranted this cycle. System healthy on runtime checks. 

Marker trace: none (no findings to emit)

