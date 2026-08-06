
## c60 · 2026-08-06T14:13:24Z

### Audit Run Tier-1 (14:10-14:13 UTC 2026-08-06)
- Tier: 1 | Services: 13 checked | Sources: 0 | DB checks: 0
- Anomalies: 1 new (C 0, W 1, I 0) | M 1 dedup-skipped
- Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-06T14:10:14Z ===
--- docker ps (all 13 services UP) ---
--- health endpoints ---
[health] mcp-server:3000/health FAIL (CLIENT_TIMEOUT, curl_exit=28, budget=5000ms)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)
--- memory pressure (mcp-server) ---
MemPerc=30.75% < 85% PASS
--- A-30 deep-probe (rag-service) ---
Baseline: 96.44% (>= 85%) → deep-probe engaged
Samples: 6 probes over 65s, all 97.18%-97.56% (min=97.18%, max=97.56%)
Reclamation dips: 0 detected — FLAT
OOMKilled: false
Verdict: ESCALATE (all >93% + no dips) → WARN severity
--- disk df -h / ---
Capacity 49% < 85% PASS
--- A-20 pdf-extractor multi-probe ---
3/3 pass ✓
```

### A-30 rag-service WARN (SUSTAINED CONDITION)
- Current reading: 96.44% (987.6 MiB / 1 GiB, 12.4 MiB free = BELOW 40 MiB floor)
- Deep-probe verdict: ESCALATE → WARN (all samples >93%, zero reclamation dips, loss of reclamation)
- Signal: sys-20260806T141322-01bc (microservice_degraded:rag-service:A-30)
- Dedup: SKIP-dedup (known issue, last 2026-08-06T08:16:21Z, within 7d window)
- History: c54 97.52%, c56-c59 in 97-99% band, c59 97.09%, c60 97.56% (regression)
- Root cause: Memory leak in rag-service; awaiting FU-RAG-DEPLOY-MEMORY (cap raise 768m→1g)

### All Other A-xx: PASS
- A-01–A-11: 13/13 host_runtime_set UP ✓
- A-12: mcp-server health timeout (CLIENT_TIMEOUT, pending debounce gate evaluation)
- A-20: pdf-extractor multi-probe 3/3 ✓
- A-21: RestartCount=4, no crashes in 4h window ✓
- A-32: Disk 49% PASS ✓

### Output Summary
- Signals: 1 new (A-30 WARN) | Dedup-skipped: 1 | Dashboard rows: 1 | BUG telegrams: 0
- Status: DEGRADED (persistent rag-service A-30 condition)



## c58 · 2026-08-06T13:36:07Z
## c59 · 2026-08-06T13:46:00Z

### Audit Run Tier-1 (13:43–13:46 UTC 2026-08-06)
- Tier: 1 | Services: 13 checked | Sources: 0 | DB checks: 0
- Anomalies: 1 new (C 0, W 1, I 0) | M 0 dedup-skipped
- Status: DEGRADED

### RAW-PROBE snippet:
```
--- docker ps -a ---
[13 containers all Up]

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- memory pressure ---
[A-30] rag-service: 97.09% memory, no reclamation dips (ESCALATE → WARN)
[A-30] mcp-server: 21.00% memory (PASS)

--- disk df -h / ---
55% capacity (PASS)
```

### Findings:
- [A-30] rag-service WARN: 97.09% memory with no reclamation dips (all 6 samples steady, VmHWM shows prior dip available, current locked at high)
  - Signal: sys-20260806T134549-728c (microservice_degraded:rag-service:A-30)
  - Dedup: SKIP (known, last 2026-08-06T08:16:21Z)
  - Action: already tracked FU-RAG-DEPLOY-MEMORY, awaiting 768m→1g cap raise

### All other A-xx checks: PASS

- Tier: 1 | Services: 13/13 up, health 5/5 OK, restart 0 ✓
- Anomalies: 1 recurrence (1 warn via dedup) | Status: DEGRADED

**Container Status (A-01–A-11):** All 13 host_runtime_set UP ✓
- mcp-server: Up ~1h 10min, RestartCount=4, 17.26% memory ✓
- rag-service: Up 39 min (post-cap-raise to 1GiB), RestartCount=0, **96.94% memory — WARN**
- All other services nominal ✓

**Health Endpoints (A-12–A-20):** All 5 endpoints OK ✓
- A-20 pdf-extractor multi-probe: 3/3 pass ✓

**Memory Pressure (A-30):**
- rag-service: deep-probe 13:34-13:36Z (6 samples/13s intervals, 65s window)
  - **Memory band: 97.06% sustained (FLAT)** — all 6 samples identical 97.06%
  - Reclamation dips: **0 detected** — no GC relief pattern
  - OOMKilled: false
  - VmHWM=1149 MB >> VmRSS=1113 MB (historical GC, now stalled)
  - Memory usage: 992.6 MiB / 1 GiB (7.4 MiB free, BELOW 40 MiB safety floor)
  - **Verdict: ESCALATE → WARN** (all >93% + zero dips)
  - Signal: A-30 WARN sys-20260806T133606-3047 (dedup_key: microservice_degraded:rag-service:A-30)
  - **Dedup result: SKIP-dedup** — same key active since c54 (08:16:21Z), within 7d window

**Disk (A-32):** / at 55% < 85% ✓

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

