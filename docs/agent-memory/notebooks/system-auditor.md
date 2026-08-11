# System Auditor Notebook

Session memory for real-time audit cycles and findings.

## c24 · 2026-08-11T14:15:44Z

### Audit Run Tier-1 (14:13–14:15 UTC 2026-08-11)
- Tier: 1 | Container liveness + health endpoints + memory pressure (A-01 through A-33)
- Anomalies: 0 warn, 0 critical, 0 info | dedup: 0 skipped
- Status: **HEALTHY**
- No emit signals — all checks PASS

#### Container & Health Status (A-01 through A-20)
- [RAW-PROBE L3-13] docker ps: all host_runtime_set services UP and healthy ✓
- [RAW-PROBE L16-20] health endpoints: all 200 OK ✓
- [RAW-PROBE L47-49] A-20 pdf-extractor multi-probe: 3/3 pass ✓

#### Restart Count (A-21)
- [RAW-PROBE L23] mcp-server RestartCount=0 ✓

#### Memory Pressure Deep-Probe (A-30)

**A-30 pdf-extractor — FOLD VERDICT:**
- Baseline: 88.47% >= 85% investigate-gate → ENGAGE deep-probe
- All 6 samples sustained: min=88.32%, median=88.60%, max=89.55%
- Reclamation dips: 0
- Discontinuities: 0
- State changes: false (no restarts during window)
- OOMKilled: false
- VmHWM: pinned at cgroup cap (2587.64 MiB / 2621.44 MiB limit), NOT advancing in window
- Reason: "benign GC sawtooth or below tripwire"
- **Verdict: FOLD — NO EMIT** — sustained moderate-high memory with no GC relief gaps, no tripwires triggered

**A-30 rag-service — SKIP:**
- Baseline: 75.96% < 85% investigate-gate → skip deep-probe

#### Disk Usage (A-32)
- [RAW-PROBE L43] root filesystem: 46% capacity < 85% threshold ✓

#### Summary
- All Tier-1 checks PASS
- A-30 deep-probe discriminator applied to pdf-extractor (baseline 88.47%)
- pdf-extractor resolves to FOLD verdict (benign sustained pattern, no escalation signals)
- rag-service baseline dropped to 75.96% (below investigate-gate) — healthy idle condition
- Status: HEALTHY — no anomalies
- **Note:** CORRECTIVE RE-DISPATCH cycle — prior dispatch ran full A-30 probe but failed to persist findings; this fresh measurement confirms pdf-extractor stable (88%), rag-service healthy idle (75.96%)


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

