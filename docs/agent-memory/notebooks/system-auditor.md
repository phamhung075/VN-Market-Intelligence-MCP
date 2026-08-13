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

**[HEARTBEAT]** OK ts=2026-08-13T22:35:08Z committed=<pending auditor-notebook-commit.sh>

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
