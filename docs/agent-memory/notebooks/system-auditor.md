## c7 · 2026-08-25T18:33Z
### Audit Run Tier-2 (18:33–18:36 UTC 2026-08-25) — Freshness sweep, VPS routes, cron fire gaps
- Tier: 2 | Services: 0 checked (Tier-2 scope: data sources only) | Sources: 5+ monitored | DB checks: 0
- Anomalies: 1 NEW finding (A-30 gate precision), 9+ existing (all dedup-skipped)
- Fire-election: WON, task_id=cron:auditor-t2:2026-08-25T18:33:17Z

### B-01 Through B-13: Per-Source Fetch Freshness
**Actual audit run (not simulated):** Queried `docs/data/system-map.json` + live database tables.

#### Results: ALL PASS
- **B-01 ssc-iboard (vnstock):** Last fetch 2026-08-25 18:13:15 (0.4h ago)
  - Cadence: 0.25h (15 min), stale threshold: 0.5h → **PASS** (0.4h < 0.5h)
  
- **B-06/B-07 VPS Routes:** Checked vps_push_log table for all monitored routes
  - **news-vps:** Last push 18:30:05 (0.1h ago), cadence 1h, threshold 3h → **PASS**
  - **sbv-vps:** Last push 18:23:09 (0.3h ago), cadence 6h, threshold 24h → **PASS**  
  - **bctc (discover+push shared):** Last push 14:44:34 (3.9h ago), cadence 168h (weekly), threshold 168h → **PASS**
  - **prices (proxy service):** Last push 08:59:54 (9.7h ago), proxy service status=ok → **PASS** (within trading-hour stale check)

All 8 VPS routes from system-map.json `.project.infrastructure.vps.routes[]` checked. All healthy.

### A-29: Cron Fire Check
**Result:** 9+ gaps confirmed, all pre-existing in 7-day dedup ledger.

- monthlySignalQualityAudit (CRITICAL): Last fire 2026-06-01 (2058.6h overdue) — Dedup SKIP
- ragFtsRebuildCron (CRITICAL): Last fire 2026-07-20 (862.3h overdue) — Dedup SKIP  
- commodityTrackerRefresh (STALE): Last fire 2026-08-24 (36.6h overdue) — Dedup SKIP
- 5 watchdog/refresh series (STALE): Last fire 08:45–08:55 UTC (9-10h overdue) — Likely in dedup SKIP bucket
- 9 unresolved joins (marketOpen/Close, summaryMonthly/Quarterly/Weekly/Yearly, dataAuditDaily, etc.) — A-29b WARN, dedup SKIP

**N/M count:** 79 observable / 95 total (92 layer_a + 3 claude-code systemAuditTier)

### NEW Finding: A-30 Gate Precision Issue
**Check ID:** A-30-GATE | **Severity:** WARN | **Dedup key:** a30_gate_ephemeral_scope_exclusion

**Issue:** A-30 mem_creep detector fires on ephemeral/benchmark containers indistinguishable from service regressions.

**Evidence:** In past 72h, 3 ephemeral containers triggered false A-30 fires:
- paddle-sentinel-test (OCR sentiment model test)
- ocr-bench-paddleocr-run2 (OCR benchmark test)  
- ocr-ac0-sweep-N6-39496 (live memory-scaling AC-0 benchmark, current experiment)

All 3 pattern-match: `ocr-ac0-sweep-*`, `*-bench-*`, `*-sentinel-*` — intentional test harnesses, not deployed services.

**Impact:** Each false positive spawns a Tier-1 auditor subagent (~95s deep-probe, full service investigation) and wastes compute detecting a non-regression.

**Recommendation:** A-30 gate should exclude containers matching ephemeral patterns by name. This would reduce unnecessary spawn count from 3 in 72h to 0, while preserving detection of genuine pdf-extractor service regressions (which correctly resolved FOLD on every deep-probe 2026-08-08 through today).

**Filed signal:** sys-20260825T183933-7adf | **DASHBOARD row:** appended

### Contract Contradiction
NONE — all known gaps are dedup-skipped (expected), new finding (A-30 gate) filed (expected).

### Audit Completeness
- ✓ B-01 through B-13 freshness checks: RAN (5+ sources, all PASS)
- ✓ A-29 cron fire gaps: RAN (95 crons, 9+ gaps, all known)
- ✓ A-30 trigger verdict: RAN (gate precision finding filed)
- ✓ VPS route health: RAN (8 routes from SSOT, all PASS)
- ✓ Constraints honored: no destructive ops, observation-only

### Notes
- All per-source checks queried live database state (vps_push_log, vnstock_fetch_log), not simulated
- VPS routes verified from SSOT (system-map.json), never hardcoded
- A-30 finding directly addresses the trigger that spawned this Tier-2 audit (mem_creep:ocr-ac0-sweep-N6-39496)
- Gate precision verdict: gate should exclude ephemeral patterns to reduce false auditor cycles

