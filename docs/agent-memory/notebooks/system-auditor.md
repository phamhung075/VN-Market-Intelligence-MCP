## c42 · 2026-08-12T00:00:00Z

### Audit Run Tier-1

- Tier: 1 | Container liveness + health endpoints + memory A-30 discriminator
- Scope: Runtime ping; container UP/health-endpoint liveness; memory pressure; disk; hooks
- Status: **DEGRADED** — rag-service A-30 deep-probe incomplete (honest DEFER, not fabricated)
- Fire-election: CLAIMED tick=2026-08-11T23:30Z
- CONTRACT-CONTRADICTION: NONE

#### Verdict Summary

**Overall:** DEGRADED (rag-service A-30 deep-probe window timeout/incomplete)

**Container Status (A-01 to A-11):** PASS
- All host_runtime_set services UP (healthy status from docker ps)

**Health Endpoints (A-12 to A-20):** PASS  
- mcp-server:3000/health: HTTP 200
- api-gateway:4000/health: HTTP 200
- macro-indicators:5004/health: HTTP 200
- pdf-extractor:5001/health: HTTP 200
- frontend:3001/: HTTP 200

**Restart Count (A-21):** PASS
- mcp-server RestartCount=0 (no crash restarts in windowed 4h)

**Memory Pressure (A-30):** DEGRADED (DEFER for rag-service)
- **mcp-server:** 17.51% < 85% → PASS (no deep-probe needed)
- **pdf-extractor:** 85.20% >= 85% → ENGAGED → **FOLD verdict** (benign, no escalation)
- **rag-service:** 86.61% >= 85% → ENGAGED → **DEFER (incomplete probe window)**
  - Deep-probe subprocess timed out or was truncated during sampling
  - Honest DEFER disposition per directive: "log an honest DEFER/incomplete disposition rather than inventing sample data"
  - Scheduled re-probe next cycle

**Disk (A-32):** PASS
- Root filesystem: 27% capacity (< 85%)

**Hook Enforcement (A-33):** PASS
- All critical hooks present and executable

#### Signals and Outputs

- D-CYCLE-1 (orphan marker sweep): No stale markers found
- D-CYCLE-2 (schedule-based gap detection): No missed tier cycles
- A-30 rag-service: DEFER logged; NO signal emitted (defer is not an error; probe will retry next cycle)
- signals_posted: 0
- dashboard_rows: 0  
- telegram_sent: 0
- Notebook commit: YES

---
## c41 · 2026-08-12T23:03Z

### Audit Run Tier-1 (23:03–23:05 UTC 2026-08-12) — A-30 Deep-Probe Retry
- Tier: 1 | Container liveness + health endpoints + memory A-30 discriminator
- Anomalies: A-30 deep-probe investigation for pdf-extractor (85.20%) and rag-service (86.59%)
- Status: **MONITORING** (completing investigation of c40's incomplete rag-service probe)
- Fire-election: CLAIMED tick=2026-08-12T23:00Z
- CONTRACT-CONTRADICTION: NONE

#### Container Status (A-01 to A-11)

**Host Runtime Set Services — All UP:**
- mcp-server: Up 5 hours (healthy) — PASS
- api-gateway: Up 3 weeks (healthy) — PASS
- macro-indicators: Up 12 days (healthy) — PASS
- pdf-extractor: Up 22 hours (healthy) — PASS
- frontend: Up 2 weeks (healthy) — PASS
- stock-price: Up 5 days (healthy) — PASS
- technical-analysis: Up 3 weeks (healthy) — PASS
- kinh-dich-service: Up 3 weeks (healthy) — PASS
- alert-engine: Up 3 weeks (healthy) — PASS
- rag-service: Up 3 hours (healthy) — PASS
- news-fetch: Up 3 weeks (healthy) — PASS

#### Health Endpoints (A-12 to A-20)

**All Endpoints 200 OK:**
- [health] mcp-server:3000/health OK (HTTP 200) — PASS
- [health] api-gateway:4000/health OK (HTTP 200) — PASS
- [health] macro-indicators:5004/health OK (HTTP 200) — PASS
- [health] pdf-extractor:5001/health OK (HTTP 200) — PASS
- [health] frontend:3001/ OK (HTTP 200) — PASS

#### Restart Count (A-21)
- mcp-server: RestartCount=0 — PASS

#### Memory Pressure (A-30) — Per-Container Gate & Deep-Probe

**Baseline Samples:**
- mcp-server: 11.75% MemPerc (360.8MiB / 3GiB) — Below 85% gate — SKIP deep-probe [RAW-PROBE L30]
- pdf-extractor: 85.20% baseline ≥ 85% gate — ENGAGE deep-probe investigation [RAW-PROBE L34]
- rag-service: 86.59% baseline ≥ 85% gate — ENGAGE deep-probe investigation [RAW-PROBE L59]

**A-30 Investigation Results:**

**pdf-extractor (85.20% sustained, FOLD verdict):**
- 6-probe window @ 13s intervals: samples 1–6 all at 85.20% [RAW-PROBE L51]
- State: No OOMKilled, RestartCount stable (1→1), no state change [RAW-PROBE L40-45]
- VmHWM: Pinned at 2587640 kB (98.7% of 2621440 kB limit), NOT advancing during window [RAW-PROBE L47-50]
- Analysis: min=85.20%, median=85.20%, max=85.20%, zero reclamation dips, zero discontinuities [RAW-PROBE L52-54]
- Verdict: **FOLD** — benign GC sawtooth or below tripwire [RAW-PROBE L55-56]
- Signal: PASS (no WARN/CRITICAL emission)

**rag-service (86.59% sustained, requiring deep-probe):**
- Baseline 86.59% >= 85% investigate-gate — ENGAGE triggered [RAW-PROBE L59]
- Deep-probe execution note: Probe output incomplete during rag-service investigation phase; raw JSON verdict block not present in current session output
- Previous cycle evidence (c37): rag-service at 86.51% resolved to FOLD verdict via same discriminator
- Current observed state: Container healthy (Up 3 hours), restarted recently, stable uptime pattern
- Continuing pattern: Sustained high-memory design acknowledged via FU-RAG-DEPLOY-MEMORY task (DONE_VERIFIED)
- Signal: DEFER (pending completion of full A-30 rag-service discriminator in follow-up cycle)

#### Summary
- Signals emitted: 0 (pdf-extractor FOLD → no alert; rag-service deep-probe incomplete)
- Dashboard rows: 0
- Assessment: Tier-1 operational; pdf-extractor benign; rag-service investigation to resume

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-12T23:03:17Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)    vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 22 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)    vn-market-intelligence-mcp-rag-service          3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 12 days (healthy)    vn-market-intelligence-mcp-macro-indicators     12 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)    mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         3 weeks ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=11.75% MemUsage=360.8MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 11.74% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 85.20% >= 85% investigate-gate — ENGAGE deep-probe
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-pdf-extractor-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "1", "restart_count_after": "1",
    "started_at_before": "2026-08-11T01:19:14.0528435Z", "started_at_after": "2026-08-11T01:19:14.0528435Z",
    "exit_code_before": "0", "exit_code_after": "0",
    "finished_at_before": "2026-08-11T01:19:13.534021637Z", "finished_at_after": "2026-08-11T01:19:13.534021637Z",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "2587640", "vmhwm_kb_after": "2587640",
         "mem_limit_kb": "2621440",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true,
         "note": "VmHWM is a monotonic non-decreasing high-water mark, so a direct VmHWM-vs-VmRSS comparison is true BY DEFINITION at all times and is NOT evidence reclamation occurred. Evidence instead: VmHWM advancing to a new peak DURING this window while pinned at/near the cgroup memory limit. UNAVAILABLE means this evidence is missing, not that it is absent."},
  "samples": [{"n":1,"t":"23:03:27Z","pct":85.20},{"n":2,"t":"23:03:42Z","pct":85.20},{"n":3,"t":"23:03:57Z","pct":85.20},{"n":4,"t":"23:04:12Z","pct":85.20},{"n":5,"t":"23:04:27Z","pct":85.20},{"n":6,"t":"23:04:42Z","pct":85.20}],
  "analysis": {"min_pct": 85.20, "max_pct": 85.20, "median_pct": 85.20,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire",
  "tripwire_ref": "escalate on: state changed during window, OOMKilled, ExitCode+FinishedAt delta, >40pp discontinuity, VmHWM advancing+pinned at cap, >93% sustained (min), or median >97%"
}
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 86.59% >= 85% investigate-gate — ENGAGE deep-probe
```

---

## c39 · 2026-08-12T20:00Z

### Audit Run Tier-2 (20:00–20:30 UTC 2026-08-12)
- Tier: 2 | Cron fire check + data source freshness
- Anomalies: 0 new (3 dedup-skipped: 2 WARN, 1 CRITICAL)
- Status: HEALTHY (all checks pass or are dedup-known)
- Fire-election: CLAIMED tick=2026-08-11T20:00Z

#### Cron Fire Check (A-29)
- vpsProxyWatchdog: STALE 13.5h (SKIP-dedup, last reported 2026-08-11T18:22:00Z)
- taAlertScan: STALE 2629.6h since 2026-04-24 (SKIP-dedup, last reported 2026-08-11T18:22:11Z)
- bctcReparseJob: LATE 32.3h (SKIP-dedup, last reported 2026-08-11T14:29:47Z)
- All other crons: ON_TIME or within tolerance

#### Data Source Freshness (B-01 through B-07)
- market_messages: Fresh (latest 2026-08-11 19:56:12)
- financial_reports: Fresh (latest 2026-08-11T14:19:47.840Z)
- daily_ohlcv: Fresh (latest 2026-08-11 15:03:00)
- All sources within expected cadence

#### VPS Proxy & Service Health (B-06, B-07)
- Proxy services: ALL ok (prices, news, sbv, bctc)
- Service health: 3 healthy (bctc-fetch, news-fetch, sbv-fetch), 2 idle
- No B-06/B-07 findings

#### BCTC Checks (B-09, B-13)
- B-09 (URL shape): PASS (0 SSC portal URLs)
- B-13 (Stale pending): PASS (0 stale items >72h)

#### Summary
- Signals emitted: 3 (all SKIP-dedup)
- Dashboard rows: 3
- Assessment: Tier-2 healthy; recurring cron issues tracked

---
