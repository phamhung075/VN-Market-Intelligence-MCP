## d4-auto · 2026-08-28T03:00:02.708Z
D4 candidates: none

## d4-auto · 2026-08-27T03:00:01.597Z
D4 candidates: none

## c15

**Tier:** DATA  
**Tick:** 2026-08-26T09:05:41Z

### Anomalies: 8 found (5 REAL + 3 BY-DESIGN)

**Overview:** Full 17-table DATA sweep completed. Two HIGH-severity queue anomalies (pending items stuck 8 days, stats recording offline). Three additional REAL findings at WARN/MED (job crashes, OHLCV/report quality). Three by-design 0-row tables (unused on-demand features / separate DB writers).

### Findings Detail

#### REAL Anomalies

1. **deep_fetch_queue** — STALE/HIGH (signal: already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD)
   - 30 pending items queued 2026-08-18 (8 days old), not advancing
   - Root cause: processor stopped or persistent VPS connectivity error

2. **deep_fetch_stats** — FAIL/HIGH (signal: already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD)
   - 0 rows despite 2598-row queue (class=a, production writer exists)
   - Root cause: stat recording logic disabled or unreachable

3. **cron_job_runs** — FAIL/WARN (signal: already-open:FIX-CRON-RUNS-NULL-ERRORMSG)
   - 211 crashed, 7 error total; intelligenceCycleJob 43 crashes (most recent 2026-08-25 04:30Z)
   - Root cause: recent regression or structural job issue

4. **daily_ohlcv** — INCORRECT/WARN (signal: already-open:LINT-OHLCV-WRITE-BYPASS)
   - 336 violations (zero OHLC values), spanning 20 distinct dates
   - Newest violating row: 2026-06-12 (75 days old, stable residue)
   - Root cause: illiquid/delisted tickers or extraction failures, not recent regression

5. **financial_reports** — INCORRECT/MED (signal: already-open:FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE)
   - 52 low-confidence reports (<0.2), 263 total
   - Root cause: OCR/PDF parsing quality issue (Vietnamese PDF layout complexity)

#### By-Design Findings (no signal write)

- **price_alerts**: 0 rows, class=c (on-demand tool only) — INFO
- **alert_engine_records**: 0 rows, class=b (separate DB writer) — INFO
- **macro_indicators**: 1 row, fetched 2026-08-24 (2 days old, within 48h threshold) — INFO

### Canonical Counts

```json
{
  "scan_ts": "2026-08-26T09:04:03Z",
  "counts": {
    "ohlc_violations_count": 336,
    "scale_gt100x_count": 0,
    "vnindex_cache_rows_count": 1,
    "low_confidence_reports_count": 52
  },
  "context": {
    "ohlc_violation_distinct_dates": 20
  }
}
```

### Status

All 5 REAL findings already-open (dedup-matched). No new signals written. History entry: `docs/data/db-integrity-history.json` scan_ts=2026-08-26T09:05:41Z.

## c19 · 2026-08-26T14:19Z
### Audit Run Tier-1 — Corrective Re-rule (14:19 UTC 2026-08-26)
**CORRECTIVE RE-RUN — Prior run verdict FAILURE was correct, but DEDUP ruling was INCORRECT**

- Tier: 1 (Runtime Ping) | Fire-tick: 2026-08-26T14:00Z | Checks: A-01..A-32 (runtime health)
- Anomalies: 1 FAILURE (A-30 mem_creep, 92.44% pdf-extractor)
- Prior Cycle Status: Verdict=FAILURE, mem_creep breach detected, Dedup ruling applied
- **Corrective Status: VERDICT AFFIRMED, DEDUP RULING OVERTURNED**

### Prior Run Summary
**Fire verdict (correct):** FAILURE — mem_creep: pdf-extractor-1 at 92.44% of 2560 MiB cap
**Prior dedup against:** microservice_degraded:pdf-extractor:A-30 (ts=2026-08-23T14:12:27Z, sev=3)
**Prior dedup reasoning (FALSIFIED):** Hypothesis that page-cache-heavy workload behaves as designed

### Corrected Evidence Analysis — CSV (`docs/incidents/data/pdf-extractor-ac7-sampler.csv`)
**Sampler window:** 2026-08-26T13:59Z–14:29Z (5-min cadence), container 417febec1a03, cgroup cap=2560 MiB

**Critical measurements at fire time (14:19:22Z):**
- **Anonymous memory:** 1917 MiB out of 2484 MiB total = **99.88% of cgroup**
- **File-backed cache:** 2.1 MiB (irrelevant to reclaim)
- **pgscan/pgsteal:** 1,321,203 / 389,429 = **29.5% reclaim efficiency** (degraded from 52.2% at 13:59Z)
- **Refault count (anon):** 97,863 (thrashing indicator)
- **memory.events.oom:** counter=0 through entire CSV (but uninformative for child kills per launchd-ack.json memo)
- **VmHWM:** 2776 MiB (above 2560 MiB cap)

**Reclaim efficiency trend (13:59Z → 14:19Z):**
- 13:59Z: 52.2% efficiency (pgscan=398k, pgsteal=208k)
- 14:04Z: 33.9% efficiency (pgscan=915k, pgsteal=310k) — pgscan tripled
- 14:09Z: 33.6% efficiency (pgscan=1.04M, pgsteal=348k)
- 14:14Z: 29.5% efficiency (pgscan=1.32M, pgsteal=389k)
- 14:19Z: 29.5% efficiency (pgscan/pgsteal flat, anon fell 120 MiB — **process exit/kill signature**)
- 14:24Z: counters completely flat, anon unchanged (no reclaim activity)

**Interpretation:** Monotonic degradation of reclaim from 52.2% to 29.5% with pgscan tripling; simultaneous collapse of file cache (55 MiB → 2 MiB); pgscan/pgsteal halt at exact moment 120 MiB freed = process termination under exhaustion, likely OOM kill of child(ren) or voluntary exit. **This is NOT benign steady-state.**

### Kernel Log Access Attempt
**Status:** CANNOT READ — requires sudo (Operation not permitted on `dmesg`). Container start=2026-08-26T00:33:39Z; first CSV sample=05:11:30Z (4.5h gap); fire time=14:19:22Z (all within sampled coverage except early hours).
**Fallback check:** memory.events.oom_kill counter in CSV = 0 throughout (but this only fires for main PID, not child processes per launchd-ack.json memo — docker plane uninformative for killed workers).
**Recorded:** Ring buffer staleness risk — prior 2026-08-23 OOM kills on old instance already aged out, cannot re-verify.

### Dedup Ledger Examination
**Current entries tracking pdf-extractor memory:**
1. `microservice_degraded:pdf-extractor:A-30` (2026-08-23T14:12:27Z, sev=3) — source of prior DEDUP
2. `pdf_extractor_memory_pressure_investigation:A-30` (2026-08-25T14:23:15Z, sev=1)
3. `detector_defect:auditor-tier1-probe:mem_creep_debounce_window_vs_persistent_fold_baseline:pdf-extractor` (2026-08-25T17:08:05Z, sev=2)

**launchd-ack.json memo (decisive):** "The Tier-1 mem_creep FAILURE on pdf-extractor is therefore a TRUE POSITIVE, and an entry here would silence a LIVE CRASH SOURCE, not a benign steady state... **Do NOT attempt to add pdf-extractor here**: ★ kernel dmesg shows TWO REAL CONSTRAINT_MEMCG OOM KILLS of pdf-extractor python3 worker processes on 2026-08-23 at 14:27:11Z and 14:58:52Z (anon-rss 2.48 GiB and 2.47 GiB against 2.56 GiB cap). Docker sets OOMKilled=true only for container MAIN pid, so a killed CHILD leaves OOMKilled=false / ExitCode=0 / RestartCount=0 — every docker-plane probe read clean while kernel was killing workers."

### Corrective Ruling — Why Prior DEDUP Was Wrong
**Premise of 08-23 entry:** Page-cache-heavy workload steady-state.
**Falsification:** CSV shows file cache 2.1 MiB (not page-cache-heavy); anon 99.88% (process-resident, NOT reclaimable); steal efficiency degraded 52% → 29% over 20 minutes (NOT steady-state, active degradation).

**Material difference from 08-23 entry:** Evidence then was the INITIAL observation at 14:12Z. Evidence now is the PROGRESSION over 20 minutes with active reclaim collapse + process termination signature. This is escalated severity, not repeat.

**Why docker plane is uninformative:** OOMKilled=false in trigger file reads as "container healthy." Per launchd-ack memo, this is exactly the signature left by killed child processes (main container stays up, children die). The corrected CSV evidence (anon 99.88%, steal 29.5%, flat counters at memory drop) corroborates child kill scenario.

### Corrective Verdict
**Prior verdict (A-30 FAILURE, mem_creep, 92.44%):** **AFFIRMED** — correctly measured.
**Prior dedup (against 08-23 A-30):** **OVERTURNED** — corrected evidence is materially worse (active degradation, reclaim collapse, process termination), consistent with LIVE CRASH SOURCE per launchd-ack.json ruling.
**Corrective action:** This fire warrants **ESCALATE** or fresh **SIGNAL_FILED**, not DEDUPED. Cannot confirm kernel OOM kills (dmesg unreachable) but corrected metrics (anon 99.88%, steal 29.5%, vmhwm above cap, pgscan/pgsteal halt + 120 MiB freed) indicate process exhaustion/termination, not benign workload.

### Durability Sweep (Step 0b.1/0b.2)
- Stale marker orphans swept: 0
- Schedule gaps detected: 0
- Found: 0
- Status: CLEAN


## c18 · 2026-08-26T14:35Z
### Audit Run Tier-2 (14:30-14:35 UTC 2026-08-26)
- Tier: 2 | Freshness sweep (20 data sources, 8 VPS routes) | Pipeline + proxy + service health
- Anomalies: 0 new (all sources fresh within SLA, all VPS routes healthy, no rate-limit breaches)
- Status: PASS (all D2 checks green)

### Freshness Findings Summary
**ALL SOURCES FRESH:**
- Per-source SLA freshness (B-01): all 20 sources within expected cadence
  - ssc-iboard: 5m fresh (0.5h SLA)
  - bctc-discover: 22m fresh (10080h SLA, earnings-window-dependent)
  - bctc-push: 22m fresh (10080h SLA, same)
  - foreign-flow: 336m fresh (367m SLA)
  - sbv-vps: 5m fresh (24h SLA)
  - news-vps: 14m fresh (3h SLA)
  - fred/trading-economics/polymarket/yahoo-finance/newsapi/reuters/sbv-circular/vneconomy-rss: all fresh
- Rate limits (B-14): no sources at 100% utilization
- BCTC healthy-idle gate (B-05): 67 active queue items; push-age 22m << 10080m threshold → PASS (pipeline actively processing)

**VPS ROUTES HEALTHY (B-06/B-07):**
- Proxy plane (get_vps_proxy_health): prices|news|sbv|bctc all status=ok, 0 24h errors
- Service plane (get_vps_service_health): 3 healthy (bctc-fetch|news-fetch|sbv-fetch), 2 idle (price-fetch|foreign-flow — market closed 14:35Z)
- Cross-plane verdict: all dual-plane routes (ssc-iboard|bctc-discover|bctc-push|sbv-vps|news-vps) = PASS; single-plane foreign-flow = PASS; no-coverage routes (muasamcong|vietstock-agm-plan) = tracked standing gap, no new WARN
- Cycle verdict: B-06/B-07 PASS (zero unhealthy service entries)

**PIPELINE HEALTH (B-11, B-12):**
- get_pipeline_health: aggregator last=2026-08-26, 33 tickers TA-ready, 2 non-neutral signals (KDC overbought RSI=70.8; VHM oversold RSI=27.8) — signals are price-driven, not staleness
- get_macro_snapshot: status=ok, carry/yield/commodity/fx all fresh vs source-tier thresholds
- DB checks C-06/C-07: covered by D2 callout only (full C-xx battery deferred to Tier-3)

### Status
Tier-2 cycle complete. No signals posted. No DASHBOARD rows. No dedup-skipped checks. Next run will be Tier-2 at 16:00Z.

**[NOTE on probe output:]** Tier-1 pre-gate returned `heartbeat_age_minutes=null` due to `checks_verdict=FAILURE` (pdf-extractor mem_creep at 92.44%, owned by concurrent tier-1 run). The null is correct by design: age_min is only computed when checks_verdict=ALL_GREEN. The heartbeat file exists (last_healthy_at=2026-08-26T10:35:00Z, 240m old, fresh vs 480m threshold) and parses correctly; null is not a timestamp-parsing defect. No finding filed.
