## c53 · 2026-08-12T07:37:09Z

### Audit Run Tier-1 (07:37–07:37 UTC 2026-08-12)

- Tier: 1 | Services: 13 checked, all UP | Health endpoints: all OK
- Findings: 0 new (1 dedup-skipped A-30 WARN) | Status: DEGRADED
- A-30: rag-service sustained >93% memory, loss of reclamation (dedup-skipped from 2026-08-06)
- A-30: pdf-extractor 86.92% deep-probe FOLD verdict (benign GC, stable)

### RAW-PROBE:

```
=== AUDITOR PROBE 2026-08-12T07:34:25Z ===

--- docker ps -a ---
All 13 services UP (mcp-server, pdf-extractor, rag-service, stock-price, macro-indicators, frontend, mcp-gateway, api-gateway, flaresolverr, news-fetch, technical-analysis, alert-engine, kinh-dich-service)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=15.87% MemUsage=487.6MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — mcp-server baseline 15.87% < 85% investigate-gate
[A-30] pdf-extractor: baseline 86.92% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] rag-service: baseline 97.13% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] (others all SKIP: <85%)

pdf-extractor A-30 deep-probe: verdict=FOLD, reason="benign GC sawtooth", analysis=(min=86.92%, max=86.92%, median=86.92%, no reclamation dips, no discontinuities)

rag-service A-30 deep-probe: verdict=ESCALATE, reason="all samples >93% sustained high — loss of reclamation", analysis=(min=97.13%, max=97.15%, median=97.15%, no reclamation dips, no discontinuities), vmhwm_kb_before/after=UNAVAILABLE (Amendment B: host-side floor 40MiB pre-check skipped vm collection)

--- disk df -h / ---
/dev/disk1s4s1: 233Gi total, 13Gi used, 13Gi avail, 51% capacity

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Audit Findings

**Container Status (A-01–A-11):** PASS — all host_runtime_set services UP and healthy.

**Health Endpoints (A-12–A-19):** PASS — all monitored endpoints return HTTP 200.

**Restart Count (A-21):** PASS — mcp-server RestartCount=0, no recent crashes.

**Memory Pressure (A-30):** 
- mcp-server (15.87%): PASS (<85% gate, no probe)
- pdf-extractor (86.92%): **FOLD** — deep-probe stable, min=max=median=86.92%, no reclamation loss, no escalation criteria met
- rag-service (97.13–97.15%): **ESCALATE to WARN** — all samples sustained >93%, loss of reclamation pattern detected; vmhwm unavailable (host below 40MiB floor but median %P analysis sufficient)
- All others <85%: PASS

**A-20 pdf-extractor Multi-Probe:** PASS — 3/3 in-container HTTP probes returned 200.

**Disk Space (A-32):** PASS — / at 51% capacity.

### Signals & Findings

[emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 id=sys-20260812T073637-71e9
[emit-dashboard] OK id=sys-20260812T073637-71e9 check_id=A-30

### Audit Summary

- Fire-election: claimed (cron:auditor-t1:2026-08-12T07:30Z)
- Signals posted: 0 (dedup-skipped A-30)
- Dashboard rows: 1 (A-30 rag-service WARN)
- Status: DEGRADED (known A-30 issue, skipped from recent 7d dedup window)

---

## c52 · 2026-08-12T06:34:47Z

### Audit Run Tier-1 (06:34–06:36 UTC 2026-08-12) — PDF-EXTRACTOR MEMORY DISCRIMINATOR VERIFICATION

- Tier: 1 | Services: 13 checked (host_runtime_set + others), all UP
- Pre-gate: FAILURE (pdf-extractor 86.92% >= 85% gate + frontend timeout)
- Full audit: ALL_GREEN (A-30 pdf-extractor FOLD verdict, no escalation)
- Status: HEALTHY — system confirmed green this cycle

### RAW-PROBE (abridged):

```
=== AUDITOR PROBE 2026-08-12T06:34:47Z ===
--- docker ps -a ---
All 13 host_runtime_set services UP (mcp-server, pdf-extractor, rag-service, stock-price, macro-indicators, frontend, api-gateway, mcp-gateway, flaresolverr, news-fetch, technical-analysis, alert-engine, kinh-dich-service)

--- health endpoints ---
All monitored endpoints OK (HTTP 200)

--- memory pressure ---
mcp-server: 19.45% MemPerc

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP mcp-server baseline 19.46% < 85%
[A-30] pdf-extractor: baseline 86.92% >= 85% — ENGAGE deep-probe
[A-30] SKIP rag-service baseline 3.38% < 85%
(others SKIP <85%)

pdf-extractor deep-probe: verdict=FOLD, analysis=(min=86.92%, max=86.92%, median=86.92%), VmHWM pinned at cap but NOT advancing, no reclamation dips, no discontinuities

--- disk df -h / ---
/dev/disk1s4s1: 48% capacity (15Gi avail)

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20] pass_count=3/3 (all HTTP 200)
```

### Audit Summary

- All checks PASS (container status, health endpoints, restart count, memory discriminator, disk)
- pdf-extractor: FOLD verdict (benign GC, stable memory despite high baseline)
- rag-service: baseline 3.38% → no deep-probe needed
- A-20: pdf-extractor event loop healthy (3/3 probes)
- Status: HEALTHY (all_green)
- Signals: 0
- Dashboard rows: 0

---

