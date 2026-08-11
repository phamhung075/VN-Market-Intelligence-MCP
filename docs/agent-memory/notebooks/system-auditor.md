## c34 · 2026-08-11T18:30Z

### Audit Run Tier-1 (18:35–18:45 UTC 2026-08-11)
- Tier: 1 | Container liveness + health endpoints + memory pressure A-30 discriminator
- Anomalies: 1 warn (A-30: rag-service regression), 0 critical, 0 cycle-loss alerts
- Status: **DEGRADED** (rag-service memory regression from prior baseline)

#### Memory Pressure Deep-Probe (A-30) — Regression Analysis

**RAG Service (vn-market-intelligence-mcp-rag-service-1) — ESCALATE VERDICT (WARN):**
[RAW-PROBE 2026-08-11T18:40:19–18:41:33Z]
- Baseline: 93.43% >= 85% investigate-gate → ENGAGE deep-probe
- Window: 6 probes at 13s intervals (65s total)
- Samples: all exactly 93.43% (perfectly stable, zero variance)
  - min=93.43%, median=93.43%, max=93.43%
- Reclamation dips: 0 (no memory relief observed)
- Discontinuities: 0 (no crash-cliff pattern, no state change)
- State during window: OOMKilled=false, RestartCount=10 (unchanged), exit_code=0 stable
- VmHWM: 1040556 KB (1016.6 MiB), pinned at 1 GiB cgroup limit, NOT advancing
- **Reason:** 'all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; 0 dip(s) ≤40pp observed, 0 discontinuity(ies) observed)'
- **Verdict mapping:** sustained >93% + zero dips → ESCALATE
- **Severity:** WARN

#### Regression Data
- **Prior baseline (c10, 2026-08-09T01:33:22Z):** 89.55% (FOLD/benign)
- **Current (c34, 2026-08-11T18:40Z):** 93.43% (ESCALATE/WARN)
- **Change:** +3.88 percentage points over 2.5 days
- **Pattern shift:** Prior had reclamation dips (visible in c10 disposition); current shows loss-of-reclamation with memory held at floor
- **Container health:** No OOM, no restarts, no exit code changes → process is stable, not in distress

#### Root Cause & Disposition
**FU-RAG-DEPLOY-MEMORY task status:** DONE_VERIFIED (2026-08-08T10:59:52Z)
- Task decided the rag-service cap trade and resident-set deployment
- Prior measurement showed rag-service reaching 97.65% of 768 MiB baseline (embedder model singleton, ~700 MiB)
- Task completion status DONE_VERIFIED means this high baseline is the accepted, designed outcome
- **Assessment:** Regression is real (89.55%→93.43%), but aligns with known embedder model design and task acceptance
- **Not a detector defect:** Memory reading is correct; ACK expiration is correct per FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY

#### ACK Suppression Status
- ACK entry tracked_by: FU-RAG-DEPLOY-MEMORY
- Task status: DONE_VERIFIED (completed 2026-08-08T10:59:52Z)
- **ACK correctly expired:** Code-enforced staleness check (FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY) refuses to suppress when tracked_by task reaches DONE_VERIFIED
- **Headroom:** 67.3 MiB free (above 40 MiB safety floor)
- **STALE-ACK tag:** Correct indicator that suppression no longer applies despite task completion

#### Signal Emission Summary
- A-30 WARN: rag-service regression 89.55%→93.43%, loss-of-reclamation
  - [emit-signal] OK id=sys-20260811T184040-rag30 check_id=A-30
  - [emit-dashboard] OK id=sys-20260811T184040-rag30 check_id=A-30

---

## c35 · 2026-08-11T20:00Z

### Audit Run Tier-1 (20:00–20:05 UTC 2026-08-11)
- Tier: 1 | Container liveness + health endpoints + memory A-30 discriminator
- Anomalies: 2 warn (A-30: pdf-extractor boundary + rag-service regression), 0 critical
- Status: **DEGRADED** (memory creep on 2 containers)

#### A-30 Memory Pressure Findings

**pdf-extractor-1 (85.11%):**
- Baseline at investigate-gate boundary (≥85%)
- State: stable, no OOM, no restarts
- Verdict: WARN (boundary condition)
- [emit-signal] OK id=audit-20260811-t1-pdf check_id=A-30

**rag-service-1 (90.37%, STALE-ACK):**
- Memory: 90.37% of capacity, 98.6 MiB free
- Baseline: 93.43% observed (from prior c34 measurement)
- Pattern: sustained high, loss of reclamation
- ACK status: DONE_VERIFIED (FU-RAG-DEPLOY-MEMORY task completed)
- Verdict: WARN (elevated, ACK expired)
- [emit-signal] OK id=audit-20260811-t1-rag check_id=A-30

**Summary:** Two memory pressure events detected. rag-service behavior aligns with known embedder model design. pdf-extractor at critical boundary.

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
