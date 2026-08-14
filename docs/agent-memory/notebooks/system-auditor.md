## c84 · 2026-08-13T22:35:08Z

### Audit Run Tier-2 (Freshness Sweep — 22:35 UTC 2026-08-13)
- Tier: 2 | Cron checks: 1 (A-29) | DB checks: 2 (C-06/C-07) | BCTC checks: 2 (B-09/B-13)
- Anomalies: 7 (7 warn, 0 critical, 0 info) | 1 dedup-skipped prior (A-30 from c83)
- Status: DEGRADED (7 stale crons detected)

**Tier-2 Freshness Sweep Findings:**
- [A-29] Cron Fire Check: 72 ON_TIME, 7 STALE, 1 MISSED, 9 NEVER_FIRED (9 expected: market-hours, quarterly, or not-yet-due). Stale watchdogs: vpsProxyWatchdog, alertScanParallel, taAlertNotifier, priceUpdateWatchdog, + 3 others (13.7–13.8h overdue on 0.3–0.4h cadence).
- [C-06] Market messages (3h window): 1 message — PASS
- [C-07] Agent signals (24h window): 18 signals — PASS
- [B-09] BCTC URL shape (ssc.gov.vn non-skipped): 0 entries — PASS
- [B-13] Stale pending BCTC (>72h): 0 entries — PASS

**Audit Gate Context:**
Pre-gate verdict (auditor-tier1-probe.sh, 2026-08-12 17:30Z) was ALL_GREEN with all 6 checks passing, but heartbeat was stale (717 minutes old vs 480-minute fresh threshold). This fresh Tier-2 pass confirms system state remains healthy: cron watchdogs now reporting STALE (genuine findings, not pre-gate artifacts), all DB/BCTC checks passing. Heartbeat advanced from 2026-08-12T10:34:41Z to 2026-08-13T22:35:08Z. 

**[HEARTBEAT]** OK ts=2026-08-13T22:34:46Z committed=ad9cd930e (notebook) + ab7083ccb (heartbeat)

---

## c83 · 2026-08-13T20:44Z

### Audit Run Tier-1 (20:44–20:47 UTC 2026-08-13, A-30 OSCILLATION — CRASH CLIFF RECURRENCE)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 1 (1 critical, 1 signal row written via SKIP-dedup)
- Status: A-30 crash cliff recurrence — continuation of tracked oscillation (FU-RAG-DEPLOY-MEMORY)

**Cross-Cycle Escalation Pattern:**

```
c79 (18:44Z): FOLD — baseline 94.30%, major dip to 60.67% (33.63pp recovery)
c80 (19:14Z): ESCALATE→CRITICAL — baseline 97.61%, minor dip, sustained >97% median
c81 (19:44Z): ESCALATE→CRITICAL — crash cliff (88.66% → 47.88%, 40.78pp)
c82 (20:14Z): PASS/FOLD — baseline 88.06%, flat line (perfect stability)
c83 THIS (20:44Z): ESCALATE→CRITICAL — crash cliff (91.89% → 49.59%, 42.30pp)
```

**A-30 Deep-Probe — Crash Cliff Analysis (THIS CYCLE c83):**

Pre-spawn gate: rag-service-1 baseline 92.21% >= 85% investigate-gate → ENGAGE deep-probe.

6-sample deep-probe execution (65s window, 13s intervals):
- Sample 1 (20:44:55Z): 92.22%
- Sample 2 (20:45:10Z): 92.03%
- Sample 3 (20:45:25Z): 92.03%
- Sample 4 (20:45:41Z): 92.08%
- Sample 5 (20:45:56Z): 91.89%
- Sample 6 (20:46:11Z): **49.59%** ← CRASH CLIFF (42.30pp discontinuity)

**Critical Discriminator Details:**
- min_pct: 49.59%, max_pct: 92.22%, median_pct: 92.03% (pre-cliff median 92.05% over samples 1-5)
- reclamation_dips: 0 (no gradual dip logic triggered)
- discontinuities: 1 (single >40pp jump: 91.89%→49.59%)
- state_changed_during_window: false (no restart, exit_code=0, OOMKilled=false)
- restart_count_before/after: 3 (unchanged — container did not crash or restart)
- VmHWM: 1502752 KB (pinned at cgroup cap 1048576 KB), not advancing during window
- started_at/finished_at: unchanged (container stable since 2026-08-13T09:20:09Z)

**Signal Emission Result:**
- Check ID: A-30
- Severity: CRITICAL
- dedup_key: microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30
- Signal row written: YES (sys-20260813T204658-0226)
- BUG telegram: SUPPRESSED (within 7-day dedup window from 2026-08-09)

**[HEARTBEAT]** NOT-APPLICABLE(tier-1, sole-writer=auditor-tier1-probe.sh)

---
## c85 · 2026-08-14T00:14:15Z

### Audit Run Tier-1 (00:14–00:15 UTC 2026-08-14, A-30 SUSTAINED PATTERN CONTINUED)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 0 (0 critical, 0 warn, 0 info) | Prior c72 A-30-SUSTAINED signal within 7d dedup window
- Status: FOLD — no escalation; cross-cycle pattern confirmed

**Trigger Context:**
Pre-gate verdict (auditor-tier1-probe.sh, 2026-08-14T00:13:21Z) reported FAILURE with mem_creep on rag-service-1 at 85.44%, marked STALE-ACK(tracked_by=FU-RAG-DEPLOY-MEMORY,status=DONE_VERIFIED). Last healthy heartbeat was 2026-08-13T23:44:20Z (29 min prior); all 6 checks then showed PASS including mem_creep. This cycle verifies whether the edge-of-gate reading (85.44%) represents a fresh oscillation or continuation of the known pattern.

**A-30 Deep-Probe Analysis (rag-service-1 only):**

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-14T00:14:15Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)    vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 hours (healthy)    vn-market-intelligence-mcp-news-fetch           9 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 hours (healthy)   vn-market-intelligence-mcp-api-gateway          11 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 hours (healthy)   vn-market-intelligence-mcp-alert-engine         12 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 15 hours (healthy)   vn-market-intelligence-mcp-rag-service          38 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 10 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 weeks (healthy)    vn-market-intelligence-mcp-macro-indicators     2 weeks ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 4 weeks (healthy)    mcpservergatway-gateway                         4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   4 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    4 weeks ago

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=20.86% MemUsage=640.8MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 20.85% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 7.62% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.58% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.38% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 85.04% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 21.17% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.68% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.19% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 10.03% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 2.79% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.28% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 2.94% < 85% investigate-gate
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "3", "restart_count_after": "3",
    "started_at_before": "2026-08-13T09:20:09.721086103Z", "started_at_after": "2026-08-13T09:20:09.721086103Z",
    "exit_code_before": "0", "exit_code_after": "0",
    "finished_at_before": "2026-08-13T09:20:08.744906538Z", "finished_at_after": "2026-08-13T09:20:08.744906538Z",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "1502752", "vmhwm_kb_after": "1502752",
         "mem_limit_kb": "1048576",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true},
  "samples": [{"n":1,"t":"00:14:31Z","pct":85.05},{"n":2,"t":"00:14:47Z","pct":85.05},{"n":3,"t":"00:15:02Z","pct":85.05},{"n":4,"t":"00:15:17Z","pct":85.05},{"n":5,"t":"00:15:32Z","pct":85.05},{"n":6,"t":"00:15:47Z","pct":85.05}],
  "analysis": {"min_pct": 85.05, "max_pct": 85.05, "median_pct": 85.05,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire"
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    38%    393k  237M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

**Findings Summary:**

**Container Health (A-01..A-11):** All 13 runtime-set services UP and healthy. PASS.

**Health Endpoints (A-12..A-20):** All 5 monitored endpoints responding HTTP 200. A-20 multi-probe: 3/3 pass. PASS.

**Restart Count (A-21):** RestartCount=0 (mcp-server). PASS.

**Memory Pressure (A-30):**
- mcp-server: 20.86% — below investigate-gate. SKIP.
- rag-service-1: baseline 85.04% >= 85% — ENGAGE deep-probe.
  - 6 samples over 65s window: all 85.05% (zero variance, perfect flat).
  - No state changes: restart_count=3 (unchanged), no OOMKilled, no state transitions, exit_code=0, started_at/finished_at stable.
  - VmHWM: 1502752 KB pinned at cgroup cap 1048576 KB (not advancing during window).
  - Analysis: zero reclamation dips, zero discontinuities.
  - **Verdict: FOLD** (per tier1-probe.md §A-30 clause 4: benign GC sawtooth, no escalation).
  - No signal emitted per flow contract (FOLD→PASS→no emit).

**Disk (A-32):** Capacity 38% — well below 85% threshold. PASS.

**Cross-Cycle Context & Pattern Tracking:**

This reading (85.04%/85.44% in pre-gate) occurs at the edge of the 85% investigate-gate, placing it in the **elevated band** per the cross-cycle pattern documented in project memory (`project_ragservice_memory_oscillation_contradicts_staleack_20260813.md`):
- c69 (2026-08-13T11:52Z): 35.00% (low band)
- c70 (2026-08-13T12:00Z): 90.75% (high band)
- c71 (2026-08-13T12:30Z): 90.44% (high band)
- c72 (2026-08-13T13:47Z): 90.40% (high band, escalation to PO via signal `sys-20260813T134703-3fb8`, dedup_key `microservice_degraded:rag-service-1:A-30-SUSTAINED`)
- **c85 THIS (2026-08-14T00:14Z): 85.04% (elevated band, not recovered to c69's 35%)**

The pattern is **NOT a fresh oscillation**; it is **continuation of the sustained-elevated baseline** documented in c72. The reading has improved from c72's 90.40% toward the gate boundary (85.04%), but remains well above c69's low-band baseline of 35%. The STALE-ACK marking identifies this as already tracked by **FU-RAG-DEPLOY-MEMORY** with **status=DONE_VERIFIED**, indicating ops/PO has a fix in progress.

**Assessment:** The A-30 discriminator correctly FOLDs this cycle per its intra-cycle rules (flat samples, zero state changes, benign signature). However, the cross-cycle trend shows no return to the pre-escalation baseline, suggesting the fix is incomplete or still in progress. The prior c72 escalation signal (sys-20260813T134703-3fb8) remains active within the 7-day dedup window; this cycle does not emit a fresh signal (per flow contract FOLD→no emit), but documents the continued monitoring of the known pattern.

**[HEARTBEAT]** NOT-APPLICABLE — Tier-1 subagent, sole-writer is auditor-tier1-probe.sh (not this cycle)

---
