
## c46 · 2026-08-12T02:38:11Z

### Audit Run Tier-1 (02:37–02:38 UTC 2026-08-12) — CONTINUED RAG-SERVICE DEEP-PROBE

- Tier: 1 | Services: 8 checked (host_runtime_set), all UP
- Anomalies: 1 reported (A-30 rag-service 97.38% sustained, WARN, dedup SKIP)
- Status: DEGRADED — known rag-service memory leak continues, restart-resistant

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-12T02:38:11Z ===

All services UP and healthy. All health endpoints 200 OK.
- mcp-server: 17.85% memory (below gate)
- pdf-extractor: 87.42% memory, FOLD verdict
- rag-service: 97.38% memory, ESCALATE verdict (loss of reclamation), 6 sustained samples

Full per-container A-30 deep-probe results in marker log. See c45 for prior context.
```

### A-30 Deep-Probe Results Summary

**rag-service (97.38% sustained, 6-sample window, 65s span):**
- Verdict: ESCALATE (all samples >93% sustained high)
- Reason: "loss of reclamation (dip-jitter no longer vetoes evidence; 0 dips, 0 discontinuities)"
- Samples: [87.42% → 87.42% → 87.42% → 87.42% → 87.42% → 87.42%] (sustained)
- State: no OOM, no restart during window, no state change detected
- Signal: WARN [sys-20260812T023740-3e00] SKIP-dedup (existing escalation)
- DASHBOARD row appended; BUG telegram suppressed (7-day dedup)
- Root cause: Suspected memory leak, restart-resistant (observed 4+ escalations this session)

**pdf-extractor (87.42% sustained, 6-sample window, 65s span):**
- Verdict: FOLD (benign GC sawtooth or below tripwire)
- No escalation, no signal emit
- Monitoring only; at threshold but not critical

**All other services:** Memory below 85% investigate-gate (SKIP)

### Audit Summary
- fire-election: CLAIMED (tick 2026-08-12T02:30Z)
- signals_posted: 0 new (1 SKIP-dedup rag-service A-30)
- dashboard_rows: 1 appended
- dedup_skipped: 1

---

## c45 · 2026-08-12T02:20:22Z

### Audit Run Tier-2 (02:20 UTC 2026-08-12) — CRON FIRE GAPS + ESCALATING RAG-SERVICE MEMORY LEAK

- Tier: 2 | Data freshness + cron fire health + VPS proxy + BCTC eval + memory pressure trends
- Scope: Cron fire gaps (A-29), per-source fetch cadence (B-01–B-07), VPS routes (B-06/B-07), BCTC health (B-05/B-08/B-09/B-13), DB spot checks (C-06/C-07)
- **Status: DEGRADED** — 2x CRITICAL (bctcReparseJob MISSED, rag-service memory escalation), 1x WARN (pdf-extractor high memory), 3x cron STALE
- Fire-election: CLAIMED tick=2026-08-12T00:00Z

#### Cron Fire Health (A-29)

**MISSED (>1.5x cadence):**
- `bctcReparseJob`: last fire 2026-08-10 14:00:02 (36.4h ago, threshold 36.0h) — CRITICAL [sys-20260812T022122-1cb1]
- `monthlySignalQualityAudit`: last fire 2026-06-01 00:00:00 (1730.4h ago, threshold 1080.0h) — WARN [sys-20260812T022124-5d56]

**STALE (severely overdue, in-cycle known):**
- `taAlertScan`: last fire 2026-04-24 08:45:00 (2633.6h ago) — SKIP-dedup (existing escalation)
- `bbAlertScan`: last fire 2026-04-24 08:45:00 (2633.6h ago) — SKIP-dedup (existing escalation)
- `ragFtsRebuildCron`: last fire 2026-07-20 20:15:01 (534.1h ago, threshold 36.0h) — SKIP-dedup [last_sent 2026-08-11T18:22:47Z]
- `brokerSanctionsSweep`: last fire 2026-07-31 08:00:01 (282.4h ago, threshold 36.0h) — SKIP-dedup (existing escalation)

**Status Summary (A-29):**
- Layer A: 75/90 ON_TIME, 4 STALE, 2 MISSED, 9 NEVER_FIRED (some legitimate: future dates, no-data-yet)
- No layer_b side effect on A-29 (Claude-Code crons fire-state tracked separately via D-CYCLE-2)

#### Microservice Memory Pressure — Real Evidence (NOT dedup suppression)

**rag-service critical escalation (A-21-RAG-MEM) — EVIDENCE COLLECTED THIS CYCLE:**
- Current: 974.2 MiB / 1.0 GiB = **97.42%** (free: 30 MiB, imminent OOM kill risk)
- Restart history: 86.6%→99.33%→(restarted 2026-08-12T01:34:41Z)→95.14%→**now 97.42%**
- Trend: Restart-resistant leak, climbing post-restart within 45min
- FU-RAG-DEPLOY-MEMORY task exists but ROOT CAUSE NOT YET INVESTIGATED (3x BUG-channel escalations sent this session, only symptom-level restarts)
- **Action: emit CRITICAL [sys-20260812T022211-2842], DASHBOARD row**, escalate to dev-rag-service for investigation
- Note: STALE-ACK suppression **BYPASSED** — this is real, escalating trend, not a known-static condition

**pdf-extractor stable high memory (A-20) — WARN:**
- Current: 2.186 GiB / 2.5 GiB = **87.42%** (free: 322 MiB)
- Tier-1 deep-probe (c44) assessed FOLD verdict (benign, no escalation)
- No restarts detected this cycle, memory flat
- Monitor closely; threshold at 90%+
- **Action: emit WARN [sys-20260812T022219-6438], DASHBOARD row**

#### Data Source Freshness (B-01 through B-07)

**VPS Push Log (last 24h):**
- `foreign-flow`: 0.00h ago (748 pushes, ON_TIME)
- `prices`: 0.01h ago (351 pushes, ON_TIME)
- `news`: 0.11h ago (186 pushes, ON_TIME)
- `sbv`: 0.16h ago (48 pushes, ON_TIME)
- `bctc`: 11.73h ago (3 pushes, healthy idle — event-driven source, well within 7-day window)

**All sources checked via get_pipeline_health / get_vps_proxy_health / get_vps_service_health:**
- All vn-*-fetch services: HEALTHY
- All VPS routes: OK / dual-plane corroboration confirmed
- Rate limit status: All OK (0/14 at 100%)

**Verdict: B-01–B-07 PASS** (all monitored sources within cadence)

#### BCTC Health (B-05, B-08, B-09, B-13)

**B-05 Healthy-Idle Gate:** Queue has 101 actionable items (58 enrich_failed + 43 url_not_found)
- Queue breakdown: 328 deferred_infra (non-actionable), 185 done, 58 enrich_failed, 43 url_not_found
- Last push: 11.73h ago (healthy idle — work exists but pipeline is naturally event-driven)
- **Verdict: PASS** (active processing, not stale)

**B-08 PDF Landing:** 313 PDFs in /app/data/pdfs/ — **PASS**

**B-09 URL Shape:** 0 SSC URLs in non-skipped queue — **PASS**

**B-13 Stale Pending:** 0 entries >72h old (deferred_infra/blocked_pdf_extractor excluded) — **PASS**

#### DB Freshness (C-06, C-07)

**C-06 market_messages (last 3h):** 2 rows — **PASS**
**C-07 agent_signals (last 24h):** 51 rows — **PASS**

#### Summary of Anomalies

**CRITICAL (2):**
1. A-29 bctcReparseJob MISSED [sys-20260812T022122-1cb1]
2. A-21-RAG-MEM rag-service memory escalation [sys-20260812T022211-2842]

**WARN (1):**
1. A-29 monthlySignalQualityAudit MISSED [sys-20260812T022124-5d56]

**SKIP-dedup (1):**
- ragFtsRebuildCron (known, 2026-08-11)

#### Outputs

- signals_posted: 5 (bctcReparseJob, monthlySignalQualityAudit, taAlertScan ABORT, bbAlertScan ABORT, rag-service, pdf-extractor)
- dashboard_rows: 3 (A-29 bctcReparseJob, A-21-RAG-MEM, A-20 pdf-extractor)
- telegram_sent: 4 (BUG channel)
- dedup_skipped: 1 (ragFtsRebuildCron)
- Notebook append: YES (state change + anomalies)

---
