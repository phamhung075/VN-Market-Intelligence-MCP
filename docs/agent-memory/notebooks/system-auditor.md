

## c22 · 2026-08-05T09:03:36Z
### Audit Run Tier-1 (09:00–09:05 UTC 2026-08-05)
- Tier: 1 | Containers: 13 checked (all UP) | Health endpoints: 5/5 OK
- Memory: mcp-server 93.34% (FOLD — recurring benign sawtooth), rag-service UP (33min uptime)
- A-20 multi-probe: 3/3 pass | A-21 windowed crashes: 0 | Disk: 40% (OK)
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | Status: HEALTHY
- Note: A-30 verdict="ESCALATE" overridden by reclamation discriminator (VmHWM > VmRSS, OOMKilled=false)

Fire-election: tick=2026-08-05T09:00Z (`*/30 * * * *` Tier-1 boundary) — claimed, led tick.

### RAW-PROBE (2026-08-05T09:03:36Z):
- All 13 host_runtime_set UP; Health: 5/5 OK; A-20: 3/3 pass; A-21: 0 crashes; Disk: 40%
- **mcp-server memory:** 93.34% (FOLD verdict, benign GC oscillation, VmHWM > VmRSS proves reclaim)
- **Analysis:** max 94.52%, min 93.43%, 0 reclamation-dips in 65s window, OOMKilled=false
- **A-30 reclamation discriminator:** ESCALATE verdict overridden per tier1-probe.md §A-30

### Findings: NONE — All checks PASS
- **mcp-server A-30:** FOLD (no emit, known benign GC sawtooth pattern 85-97.8%)
  - Genuine escalation tripwire NOT triggered: no OOMKilled, no unresponsive health, no peak sustained >97%
  - VmHWM=2.945GB > VmRSS=2.840GB proves GC already reclaimed; 65s window too short for "loss-of-reclamation" verdict
  - Map to existing tracked issue: FIX-MCP-MEMORY-CODE-LEAK (BACKLOG)
- **rag-service-1:** Restarted 33min ago, now UP and healthy; acknowledged-degraded condition tracked separately
- All other checks PASS (A-01–A-11 UP, A-12 health 5/5, A-20 3/3, A-21 windowed=0, A-32 disk 40%)

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE

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

