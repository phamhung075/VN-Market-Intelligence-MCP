## c50 · 2026-08-08T13:30Z

### Audit Run Tier-1

**Fire-election:** CLAIMED — cron:auditor-t1:2026-08-08T13:30Z

#### RAW-PROBE (2026-08-08T13:34:32Z)
```
=== AUDITOR PROBE 2026-08-08T13:34:32Z ===

--- docker ps -a ---
All 13 services UP (healthy status)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=77.04% MemUsage=2.311GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 77.04% < 85% investigate-gate

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

--- disk df -h / ---
Capacity: 64% < 85% — PASS
```

#### Container Status (A-01 through A-11)
[RAW-PROBE] All host_runtime_set services UP and healthy.

#### Health Endpoints (A-12 through A-20)
[RAW-PROBE] All checked services responding HTTP 200 — PASS.

##### A-20 Multi-Probe (pdf-extractor event-loop)
[RAW-PROBE] 3 in-container probes: pass_count=3/3 — PASS.

#### Restart Count (A-21)
[RAW-PROBE L6] mcp-server RestartCount=3. Windowed crash-only query: crashRestarts=0 — PASS.

#### Memory Pressure (A-30)

**Per-container memory audit:**
- mcp-server: 77.04% (2.311GiB / 3GiB) — OK
- rag-service: 98.68% (1010MiB / 1GiB) — WARN (free: ~13MiB, BELOW floor=40MiB)
- frontend: 8.86% — OK
- news-fetch: 6.27% — OK
- technical-analysis: 3.84% — OK
- kinh-dich-service: 3.05% — OK
- stock-price: 2.38% — OK
- pdf-extractor: 2.68% — OK
- macro-indicators: 2.25% — OK
- flaresolverr: 2.58% — OK
- api-gateway: 2.63% — OK
- alert-engine: 2.18% — OK
- mcp-gateway: 0.25% — OK

**A-30 INCIDENT CONTINUATION — rag-service memory escalation:**
- **Current:** 1010 MiB / 1 GiB = 98.68% (from per-container audit)
- **Free headroom:** ~13 MiB — BELOW critical floor (40 MiB)
- **Health:** Healthy (no OOMKilled, no crashes)
- **Last A-30 baseline:** 2026-08-07T03:35:32Z (>33h stale)
- **Trend:** Sustained critical memory pressure since prior cycle (c49, 2026-08-08T13:00Z at 98.71%)
- **Verdict:** A-30 WARN (continuation of incident — no escalation to CRITICAL without OOM/crash evidence)
- **Signal emitted:** [emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 last_sent=2026-08-06T08:16:21Z id=sys-20260808T133635-432b
- **DASHBOARD row appended:** [emit-dashboard] OK id=sys-20260808T133635-432b check_id=A-30

Incident tracking: FU-RAG-DEPLOY-MEMORY (DONE_VERIFIED); deployment landed; current tight headroom reflects memory-cap enforcement in place during transition. Incident is tracked in BUG channel (dedup 7d); monitoring required.

#### Disk (A-32)
[RAW-PROBE L21] Capacity: 64% < 85% threshold — PASS.

#### Hook Enforcement Liveness (A-33)
Check hooks (4 load-bearing + 3 LOW-tier) — all present, executable, registered — PASS.

#### MCP System Status
All mcp-server dependencies operational; no correlated system-level failures.

**[OUTPUT-CONTRACT]** signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1

**CONTRACT-CONTRADICTION:** NONE

---

**RETURN:** tier-1 cycle complete. Anomaly count: 1 (A-30 rag-service mem_creep, continuation of tracked incident). NEXT: po (via orch-state.json .signal_queue row + DASHBOARD.md).

---

## c49 · 2026-08-08T13:00Z

### Audit Run Tier-1

**Fire-election:** CLAIMED — cron:auditor-t1:2026-08-08T13:00Z

#### RAW-PROBE (2026-08-08T13:07:16Z)
```
=== AUDITOR PROBE 2026-08-08T13:07:16Z ===

--- docker ps -a ---
All 13 services UP (healthy status)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=74.66% MemUsage=2.24GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 74.66% < 85% investigate-gate

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

--- memory pressure — supplemental (rag-service) ---
Container=vn-market-intelligence-mcp-rag-service-1 MemPerc=98.71% MemUsage=1011MiB / 1GiB

--- disk df -h / ---
Capacity: 64% < 85% — PASS
```

#### Container Status (A-01 through A-11)
[RAW-PROBE] All host_runtime_set services UP and healthy.

#### Health Endpoints (A-12 through A-20)
[RAW-PROBE] All checked services responding HTTP 200 — PASS.

##### A-20 Multi-Probe (pdf-extractor event-loop)
[RAW-PROBE] 3 in-container probes: pass_count=3/3 — PASS.

#### Restart Count (A-21)
[RAW-PROBE L6] mcp-server RestartCount=3. Windowed crash-only query: crashRestarts=0 — PASS.

#### Memory Pressure (A-30)
[RAW-PROBE L8] mcp-server baseline: 74.66% < 85% investigate-gate — SKIP deep-probe — PASS.

**A-30 INCIDENT CONTINUATION — rag-service memory escalation:**

Per trigger context (cron-detect-loop Tier-1 pre-gate), mem_creep incident on rag-service continues:
- **Current:** 1011 MiB / 1 GiB = 98.71% (from supplemental probe L17)
- **Free headroom:** ~13 MiB — BELOW critical floor (40 MiB)
- **Health:** Healthy (no OOMKilled, no crashes)
- **Last healthy baseline:** 2026-08-07T03:35:32Z (>33h stale)
- **Trend:** Sustained critical memory pressure since prior cycle (c48, 2026-08-08T11:04Z at 98.53%)
- **Verdict:** A-30 WARN (continuation of incident — no escalation to CRITICAL without OOM/crash evidence)
- **Signal emitted:** [emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 id=sys-20260808T130859-7527
- **DASHBOARD row appended:** [emit-dashboard] OK id=sys-20260808T130859-7527 check_id=A-30

Escalation context (prior cycle, c48): FU-RAG-DEPLOY-MEMORY marked DONE_VERIFIED; deployment landed; current tight headroom reflects the memory-cap enforcement in place during transition. Incident is tracked in BUG channel (dedup 7d); requires monitoring and potential intervention by ops/developer.

#### Disk (A-32)
[RAW-PROBE L21] Capacity: 64% < 85% threshold — PASS.

#### Hook Enforcement Liveness (A-33)
Check hooks (4 load-bearing + 3 LOW-tier) — all present, executable, registered — PASS.

#### MCP System Status
All mcp-server dependencies operational; no correlated system-level failures.

**[OUTPUT-CONTRACT]** signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1

**CONTRACT-CONTRADICTION:** NONE

---

**RETURN:** tier-1 cycle complete. Anomaly count: 1 (A-30 rag-service mem_creep, continuation of tracked incident). NEXT: po (via orch-state.json .signal_queue row + DASHBOARD.md).

---
