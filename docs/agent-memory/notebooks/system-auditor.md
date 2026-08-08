

## c82 · 2026-08-08T06:36:08Z
### Audit Run Tier-1 (06:30–06:34 UTC 2026-08-08)
- Tier: 1 | Services: 12 checked | Health: 5 checked | Restarts: 1 checked
- Anomalies: 0 new (C critical, W warn, I info) | 1 dedup-skipped
- Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-08T06:33:17Z ===

--- docker ps -a ---
All containers UP (healthy status)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

--- restart count ---
mcp-server RestartCount=3

--- memory pressure ---
mcp-server MemPerc=33.24%

--- disk ---
Capacity 54% (PASS)
```

### Findings:
- A-30 rag-service: 96.24% memory (SKIP-dedup, recurring since 2026-08-08T06:05:41Z)
- [emit-signal] SKIP-dedup signal_id=10496
- [emit-dashboard] OK id=10496 check_id=A-30

## c81 · 2026-08-08T06:25:27Z
### Audit Run Tier-2 (06:24–06:25 UTC 2026-08-08)
- Tier: 2 | Freshness sweep completed | Anomalies: 1 (WARN) | Status: DEGRADED
- Cron Fire Check (A-29): Some crons in various states (LATE=3, STALE=8, NEVER_FIRED=9, ON_TIME=69) — needs review
- Data Freshness: C-06 WARNING (0 market_messages in 3h during trading hours) | C-07 OK (18 signals/24h)
- VPS Proxy Health (B-06, B-07): All routes OK ✓
- BCTC Checks: B-09 (0 bad SSC URLs) ✓ | B-13 (0 stale >72h) ✓
- Rate Limits (B-14): Most sources ready (12/14 OK) ✓
- Pipeline: Healthy | Macro snapshot fresh | SLA all OK ✓

## d4-auto · 2026-08-08T03:00:02.589Z
D4 candidates: R2-mismatch:bctc-dataquality:vnindex-crosstool-mismatch,R2-mismatch:bctc-dataquality:HPG:operating-profit-zero,R2-mismatch:bctc-dataquality:DXG:persistent-absence,R3-no-board-row:bctc-dataquality:vnindex-crosstool-mismatch,R3-no-board-row:bctc-dataquality:HPG:operating-profit-zero,R3-no-board-row:bctc-dataquality:DXG:persistent-absence

## c80 · 2026-08-08T01:08:04Z
### Audit Run Tier-1 (01:05–01:06 UTC 2026-08-08)
- Tier: 1 | Services: 12 host_runtime_set | Health: 5 probed
- Anomalies: 0 new (dedup-skipped 1) | Status: DEGRADED
- Verdict: Container/health all UP; A-30 memory pressure ESCALATE on mcp-server (96–97% sustained, zero reclamation dips) — within dedup window (19h < 7d prior)
- Container status [A-01–A-11]: All 12 UP (healthy) ✓
- Health endpoints [A-12–A-20]: All 5 OK (HTTP 200) ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count (mcp-server): RestartCount=2 (check windowed crashes)
- A-30 memory pressure discriminator:
  - **mcp-server (DEDUP-SKIPPED):** Current: 97.18% (2.915GiB / 3GiB) — same condition as c77, dedup applies
- A-32 disk: 51% < 85% ✓
- A-33 hook liveness: All load-bearing hooks OK ✓

## c79 · 2026-08-07T06:12:14Z
### Audit Run Tier-2 (06:12–06:12 UTC 2026-08-07)
- Tier: 2 | Freshness sweep completed | Anomalies: 0 | Status: HEALTHY
- Cron Fire Check (A-29): All major jobs firing correctly ✓
- VPS Proxy Health (B-06, B-07): All 4 routes OK ✓
- Rate Limits (B-12): All 12 sources ready ✓
- DB Freshness: C-06 (5 market_messages/3h), C-07 (79 agent_signals/24h) ✓
- BCTC Checks: B-09 (0 bad SSC URLs), B-13 (0 stale >72h) ✓
- Pipeline: Healthy | SLA all OK ✓

