
## c21 · 2026-08-05T08:42:26Z
### Audit Run Tier-1 (08:30–08:40 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP) | Health endpoints: 5/5 OK
- Memory: mcp-server 92.50% (FOLD — transient spike recovered), rag-service restarted 9min ago
- A-20 multi-probe: 3/3 pass | A-21 windowed crashes: 0 | Disk: 40% (OK)
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | Status: HEALTHY
- State transition: DEGRADED→HEALTHY (recovered from c19 rag-service floor breach)

Fire-election: tick=2026-08-05T08:30Z claimed.

### RAW-PROBE (2026-08-05T08:40:05Z):
- All 13 host_runtime_set UP; Health: 5/5 OK; A-20: 3/3 pass; A-21: 0 crashes; Disk: 40%
- **mcp-server memory:** 92.50% (FOLD verdict, benign GC, recovered from 94.59% transient)
- **Analysis:** max 93.61%, min 92.52%, 0 reclamation dips — transient pressure, no OOMKilled

### Findings: NONE — All checks PASS
- mcp-server A-30: FOLD (no emit, transient spike recovered per multi-probe discriminator)
- Status change from DEGRADED to HEALTHY warrants notebook entry

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE

## c20 · 2026-08-05T08:19:21Z
### Audit Run Tier-DATA (08:15–08:19 UTC 2026-08-05)
- Tier: DATA | Tables: 17 checked (daily_ohlcv, alerts, financial_reports, macro_indicators, etc.)
- DB queries: 15+ aggregate checks executed | DB integrity: PRAGMA check = ok
- Anomalies: 1 new WARN (recurring), 0 CRITICAL, 0 INFO
- Status: HEALTHY (recent 24h data clean; 1 known recurring alert-signal gap)

Fire-election: NOT TIER-1/2/3 — manual DATA-tier invocation (AUDIT_TIER=DATA).

**Scan Findings:**
- **C-01:** daily_ohlcv distinct codes: 98 (expected ≥25) ✓ PASS
- **C-02:** daily_ohlcv total rows: 194 (expected >0) ✓ PASS
- **C-03:** financial_reports Q1-2026 action_codes: 45 (expected ≥26) ✓ PASS
- **C-04:** Low-confidence extractions (last 7d): 30 total, 0 recent 24h ✓ PASS (stale)
- **C-05:** SSC portal URLs in bctc_vps_queue: 0 (expected 0) ✓ PASS
- **C-06:** market_messages last 3h: 4 rows ✓ PASS
- **C-07:** agent_signals last 24h: 39 rows ✓ PASS
- **C-08:** Orphaned alerts (no agent_signals): 22 (expected 0) ⚠ WARN — RECURRING
- **C-09:** macro_indicators Vietnam (26h): 3 indicators (expected ≥3) ✓ PASS
- **DB Integrity:** PRAGMA integrity_check = ok ✓ PASS
- **Zero-volume anomalies:** 591 rows, but all from May-June 2026 (stale), 0 in recent 24h ✓ BY-DESIGN

**C-08 Finding (Recurring):**
- Orphaned alerts (left join alerts.id = agent_signals.alert_id, s.id IS NULL): 22 rows in last 24h
- Severity distribution: 1 high, 2 low, 14 medium, 5 warning
- Examples: FPT news mention, FRT overbought (RSI 72.6), HUT oversold (RSI 14.6)
- Signal ID: sys-20260805T081846-1853 (NEW row written, Telegram dedup-skipped — last sent 2026-07-30)
- DASHBOARD: [emit-dashboard] OK id=sys-20260805T081846-1853 check_id=C-08

DB history appended: scan_ts=2026-08-05T08:18:40Z, history_len 139→140 (capped at 200).

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE


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
