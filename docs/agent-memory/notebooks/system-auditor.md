

## c19 · 2026-08-05T08:11:30Z
### Audit Run Tier-1 (08:00–08:11 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP) | Health endpoints: 5/5 OK
- Memory: mcp-server 76.98% (OK), rag-service 99.81% (WARN — below 40MiB floor)
- A-20 multi-probe: 3/3 pass | A-21 windowed crashes: 0 | Disk: 39% (OK)
- Anomalies: 1 new (0 critical, 1 warn, 0 info) | 1 dedup-skipped
- Status: DEGRADED (rag-service below floor threshold — recurring condition)

Fire-election: tick=2026-08-05T08:00Z (`*/30 * * * *` Tier-1 boundary) — claimed, led tick.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-05T08:10:45Z ===

--- docker ps -a ---
All 13 host_runtime_set services UP (mcp-server:17h, pdf-extractor:18h, rag-service:8h, frontend:11d, others:2-6w)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=13

--- memory pressure (mcp-server) ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=76.98% MemUsage=2.309GiB / 3GiB
[A-30] SKIP deep-probe — baseline 76.98% < 85% investigate-gate

--- memory pressure (rag-service — docker stats manual check) ---
Container=vn-market-intelligence-mcp-rag-service-1 MemPerc=99.81% MemUsage=766.5MiB / 768MiB
[A-30-RAG] BELOW-FLOOR: headroom 1.5MiB < 40MiB threshold

--- disk df -h / ---
/dev/disk1s4s1: 39% capacity (13Gi used, 21Gi free)

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
```

### A-30 Finding — rag-service WARN (recurring)
- **Status:** WARN / Memory 99.81% BELOW 40MiB floor (worsened from 97.83%)
- **Recurrence:** 3rd consecutive Tier-1 detection (97.72–97.78% two ticks ago, 97.83% c18, 99.81% now)
- **Root cause:** Sentence-transformers model singleton, ~700MiB baseline
- **Tracked by:** FU-RAG-DEPLOY-MEMORY (BACKLOG), FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP (READY)
- **Signal:** [emit-signal] SKIP-dedup id=sys-20260805T081125-5e0d
- **DASHBOARD:** [emit-dashboard] OK id=sys-20260805T081125-5e0d

Dedup: c18 sent at 07:41:37Z (13min ago, within 7d window). SKIP-dedup correct per flow contract.

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE


## c18 · 2026-08-05T07:42:36Z
### Audit Run Tier-1 (07:30–07:42 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP) | Health endpoints: 5/5 OK
- Memory: mcp-server 73.12% (OK), rag-service 97.83% (WARN — below 40MiB floor)
- A-20 multi-probe: 3/3 pass | A-21 windowed crashes: 0 | Disk: 40% (OK)
- Anomalies: 1 new (0 critical, 1 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED (rag-service below floor threshold)

Fire-election: tick=2026-08-05T07:30Z (`*/30 * * * *` Tier-1 boundary) — claimed, led tick.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-05T07:40:17Z ===

--- docker ps -a ---
All 13 host_runtime_set services UP (mcp-server:17h, pdf-extractor:17h, rag-service:7h, frontend:11d, others:2-6w)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=13

--- memory pressure (mcp-server) ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=73.12% MemUsage=2.194GiB / 3GiB
[A-30] SKIP deep-probe — baseline 73.12% < 85% investigate-gate

--- memory pressure (rag-service — docker stats manual check) ---
Container=vn-market-intelligence-mcp-rag-service-1 MemPerc=97.83% MemUsage=751.3MiB / 768MiB
[A-30-RAG] BELOW-FLOOR: headroom 16.7MiB < 40MiB threshold

--- disk df -h / ---
/dev/disk1s4s1: 40% capacity (13Gi used, 20Gi free)

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
```

### A-30 Finding — rag-service WARN
- **Status:** WARN / Memory pressure (97.83% of 768MiB) — BELOW 40MiB floor
- **Evidence:** docker stats vn-market-intelligence-mcp-rag-service-1 at 2026-08-05T07:42Z shows 751.3MiB used, 16.7MiB free
- **Root cause:** Sentence-transformers model singleton (apps/rag-service/infrastructure/embedder.py:37-51) with no release path; fixed ~700 MiB baseline reached on first embed
- **Tracked by:** FU-RAG-DEPLOY-MEMORY (BACKLOG, owner: po/infra trade decision), FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP (READY, in backlog)
- **Reference:** auditor-launchd-ack.json .acked_memory[0] tracks this with floor_enforcement_20260729: entry was acknowledged but re-flagged because headroom_mib_at_ack_review=11.2 MiB < MEM_FLOOR_MIB=40 (code-enforced by FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY)
- **Signal:** [emit-signal] SKIP-dedup dedup_key=mem_pressure:rag-service:A-30 last_sent=2026-08-05T07:41:37Z id=sys-20260805T074206-2897
- **DASHBOARD:** [emit-dashboard] OK id=sys-20260805T074206-2897 check_id=A-30

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=2 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE


## c17 · 2026-08-05T06:52:58Z
### Audit Run Tier-3 (06:47–06:53 UTC 2026-08-05)
- Tier: 3 | DB checks C-01..C-16 run | Container tooling verified | DB integrity scanned
- **Anomalies: 1 CRITICAL (C-OHLCV-VIOLATIONS)**
- Status: CRITICAL

Fire-election: tick=2026-08-05T02:00Z (Tier-3 daily 02:00 UTC) — claimed, led tick.

**DB Integrity Scan Results:**
- C-01: 98 distinct codes in daily_ohlcv (≥25) ✓
- C-02: 194 ohlcv rows (>0) ✓
- C-03: 45 action_codes Q1 2026 (≥26) ✓
- C-04: 30 low-confidence reports (<0.2) — BY-DESIGN ✓
- C-05: 0 SSC portal URLs (=0) ✓
- C-06: 2 market_messages in 3h ✓
- C-07: 27 agent_signals in 24h (>0) ✓
- C-08: 22 orphaned alerts (baseline; structural join cardinality) ⚠
- C-09: 3 macro indicators Vietnam (≥3) ✓
- C-10: 0 failed PDFs (≤2) ✓
- C-11: 0 done PDFs (off-season) ✓
- C-12: PRAGMA integrity_check all DBs = ok ✓
- C-13: WAL sizes market 0B, pdf_extractor missing (ok) ✓
- C-14: Top-3 concentration 3.1% (<60%) ✓
- C-15: Schema all required columns present ✓
- C-16: 0 stale pending BCTC (=0) ✓

**CRITICAL Finding (sys-20260805T065227-25f7):**
- Table: daily_ohlcv
- Class: INCORRECT (OHLCV constraint violation)
- Detail: 336 records with high=0, low=0 (should be ≥ open, close, low). All from 2026-05-15.
- Sample: VNDAFS004 2026-05-15 O=21183.99 H=0 L=0 C=21183.99
- Root cause: Data extraction/load bug on 2026-05-15; high/low values missing
- Signal ID: sys-20260805T065227-25f7 → posted to dev-team

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=0


## c16 · 2026-08-05T06:41:02Z
### Audit Run Tier-1 (06:39–06:40 UTC 2026-08-05)
- Tier: 1 | Services: 12/12 UP | Health endpoints: 5/5 OK | A-20 multi-probe: 3/3 pass
- Memory: 56.29% (< 85% threshold) | Disk: 40% (< 85% threshold)
- Restart count (A-21): 0 windowed crashes (PASS)
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY

Fire-election: tick=2026-08-05T06:30Z (Tier-1 30-minute boundary) — claimed, led tick.

**RAW-PROBE:**
```
=== AUDITOR PROBE 2026-08-05T06:39:25Z ===

--- docker ps -a ---
All 12 host_runtime_set services UP with healthy status

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
RestartCount=13 (cumulative, windowed crashes=0 in 4h window)

--- memory pressure ---
MemPerc=56.29% (< 85% investigate-gate)

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3 PASS

--- disk df -h / ---
Capacity 40% (< 85%)
```

Note: Previous Tier-1 heartbeat was stale (2026-07-29T11:11:55Z, 7 days old). This cycle refreshes the heartbeat.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0
