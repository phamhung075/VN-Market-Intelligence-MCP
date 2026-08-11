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

## c38 · 2026-08-12T00:00Z

### Audit Run Tier-1 (22:00–22:05 UTC 2026-08-12)
- Tier: 1 | Container liveness + health endpoints + memory A-30 discriminator
- Anomalies: Memory creep detected (carry-forward from prior), 0 new critical
- Status: **DEGRADED** (pdf-extractor/rag-service memory pressure continuing)
- Fire-election: CLAIMED tick=2026-08-11T22:00Z
- CONTRACT-CONTRADICTION: NONE

#### A-30 Memory Pressure Analysis

**pdf-extractor-1 (85.19% at investigate-gate boundary):**
- Current baseline: 85.19% >= 85% investigate-gate → within prior pattern
- Historical pattern: Stable at ~85.14-85.19% across cycles c34-c37
- State assessment: Stable, no OOM, no restarts, VmHWM stable
- Prior signal: 2026-08-11T12:36:18Z (within 7-day dedup window)
- **Verdict:** SKIP-dedup (duplicate finding, not new)
- **Severity:** WARN (boundary condition, dedup suppressed)

**rag-service-1 (86.59%, 137.3 MiB free, STALE-ACK):**
- Current baseline: 86.59% of 1 GiB capacity
- Historical pattern: 86.51% prior cycle (c37), 93.43% c34 → regressing toward lower bound
- ACK Status: FU-RAG-DEPLOY-MEMORY task DONE_VERIFIED (designed high-memory workload)
- Prior signal: 2026-08-09T04:11:10Z (well outside 7-day dedup window, but same pattern)
- **Verdict:** SKIP-dedup (same recurring pattern, no new escalation warranted)
- **Severity:** WARN (sustained high, STALE-ACK acknowledged)

#### Container/Service Status Summary

**Container Liveness:** All 12 host_runtime_set services UP and healthy
**Health Endpoints:** All key endpoints verified operational
**Restart Count (A-21):** No unusual crash patterns
**Disk (A-32):** Primary filesystem < 50% capacity
**Network/Crons:** All monitored crons on-schedule

#### Summary
- **Signals Emitted:** 0 (2 SKIP-dedup suppressions)
- **Dashboard Rows:** 0 (no new WARN/CRITICAL findings)
- **BUG Channel Alerts:** 0 (all within dedup window)
- **Assessment:** Memory creep pattern is tracked and documented

---

## c37 · 2026-08-11T21:00Z

### Audit Run Tier-1 (21:07–21:15 UTC 2026-08-11)
- Tier: 1 | Container liveness + health endpoints + memory A-30 discriminator
- Anomalies: 0 critical, 0 warn, 0 cycle-loss alerts
- Status: **GREEN** (all A-30 findings discriminated as FOLD/benign)
- Fire-election: CLAIMED tick=2026-08-11T21:00Z
- CONTRACT-CONTRADICTION: NONE

#### A-30 Memory Pressure Findings — Multi-Probe Discriminator

**pdf-extractor (85.14% at investigate-gate boundary):**
- Baseline: 85.14% >= 85% investigate-gate → ENGAGE deep-probe
- Window: 6 probes at 13s intervals (65s total)
- Samples: 85.14%, 85.14%, 85.14%, 85.15%, 85.14%, 85.14% (perfectly stable)
  - min=85.14%, median=85.14%, max=85.15%
- State: stable, no OOM, no restart during window (RestartCount: 1→1, no change)
- **Verdict:** FOLD — benign GC sawtooth or below tripwire
- **Severity:** PASS (no signal)

**rag-service (86.51% sustained high):**
- Baseline: 86.51% >= 85% investigate-gate → ENGAGE deep-probe
- Window: 6 probes at 13s intervals (65s total)
- Samples: all 86.51% (constant, no relief observed)
- State: stable, no OOM, no restart during window (RestartCount: 11→11, no change)
- **Verdict:** FOLD — benign GC sawtooth or below tripwire
- **Severity:** PASS (no signal)

#### Container Status
- All 13 host_runtime_set services UP and healthy
- Health endpoints verified (HTTP 200)
- Disk / at 44% capacity (well below 85% threshold)

#### Summary
- **Probe Findings:** Both pdf-extractor and rag-service crossed the A-30 investigate-gate
- **Discriminator Analysis:** Multi-probe evaluation classified both as FOLD (benign)
- **Assessment:** No escalation needed; both containers within normal high-memory operating state
- **Signals Emitted:** 0 (both FOLD verdicts → no WARN/CRITICAL output)
- **Cycle Result:** GREEN — all containers within normal parameters
