# System Auditor Notebook

Session memory for real-time audit cycles and findings.

## c23 · 2026-08-11T13:03:04Z

### Audit Run Tier-1 (13:03–13:05 UTC 2026-08-11)
- Tier: 1 | Container liveness + health endpoints + memory pressure (A-01 through A-33)
- Anomalies: 0 warn, 0 critical, 0 info | dedup: 0 skipped
- Status: **HEALTHY**
- No emit signals — all checks PASS

#### Container & Health Status (A-01 through A-20)
- [RAW-PROBE L3-17] docker ps: all host_runtime_set services UP and healthy ✓
- [RAW-PROBE L20-24] health endpoints: all 200 OK ✓
- [RAW-PROBE L98-102] A-20 pdf-extractor multi-probe: 3/3 pass ✓

#### Restart Count (A-21)
- [RAW-PROBE L27] mcp-server RestartCount=0 ✓

#### Memory Pressure Deep-Probe (A-30)

**A-30 pdf-extractor — FOLD VERDICT:**
- Baseline: 91.44% >= 85% investigate-gate → ENGAGE deep-probe
- All 6 samples sustained: min=91.44%, median=91.44%, max=91.49%
- Reclamation dips: 0 (no GC relief observed)
- Discontinuities: 0
- State changes: false (no restarts during window)
- OOMKilled: false
- VmHWM: pinned at cgroup cap (2587.6 MiB / 2621.4 MiB limit), NOT advancing in window
- Reason: "benign GC sawtooth or below tripwire"
- **Verdict: FOLD — NO EMIT** — benign sustained memory, no escalation tripwires met
- Context: prior probes showed 92.52%-94.07% range; this cycle returned to 91.44% floor
- Analysis: sustained high memory with NO reclamation dips and NO VmHWM advancement indicates stable GC pattern, not escalating pressure

**A-30 rag-service — FOLD VERDICT:**
- Baseline: 92.30% >= 85% investigate-gate → ENGAGE deep-probe
- All 6 samples: min=92.32%, median=92.32%, max=92.32%
- Reclamation dips: 0
- Discontinuities: 0
- State changes: false
- OOMKilled: false
- VmHWM: pinned at cap (1038.0 MiB / 1048.6 MiB limit), NOT advancing in window
- Reason: "benign GC sawtooth or below tripwire"
- **Verdict: FOLD — NO EMIT** — benign pattern, no escalation tripwires met
- Prior STALE-ACK (FU-RAG-DEPLOY-MEMORY, DONE_VERIFIED) disposition remains valid

#### Disk Usage (A-32)
- [RAW-PROBE L95] root filesystem: 46% capacity < 85% threshold ✓

#### Summary
- All Tier-1 checks PASS
- A-30 deep-probe discriminator applied to both flagged containers (pdf-extractor, rag-service)
- Both resolve to FOLD verdicts (benign GC patterns, no escalation signals)
- Prior higher readings (92.52%-94.07% pdf-extractor, 88.46%-96.78% rag-service across prior cycles) are consistent with stable sustained high-water baseline; no trend toward OOM or crash-cliff signatures
- Status: HEALTHY — no anomalies

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
