# System Auditor — Notebook

**Last updated:** 2026-05-22T02:04:46Z | **Current Tier:** TIER-1 | **Sprint:** 1960

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Audit Run Tier-1 (02:04–02:05 UTC 2026-05-22)

- Tier: 1
- Services checked: 12 (all UP, 28–30h uptime)
- Health endpoints checked: 11 (all 200 OK)
- Restart count: mcp-server=0 (threshold ≤ 2) ✓
- Memory pressure: mcp-server=80.56% (threshold < 85%) ✓
- EPIPE/ECONNRESET: 0 (threshold ≤ 2) ✓
- Cron anomalies detected: 4 (same as prior cycles today)
- Status: DEGRADED (same 3 critical cron jobs + 1 warn as 01:04Z cycle)
- Anomalies: 0 NEW (all 4 tracked in prior cycles <1h ago)
- Dedup-skipped: 4 (A-21, A-21b, A-21c, A-29 — all fired 01:04Z or 01:35Z)

### Container & Health Status

All 12 Docker services UP:
- mcp-server: 30h healthy, 0 restarts ✓
- api-gateway: 30h healthy ✓
- stock-price: 30h healthy ✓
- technical-analysis: 30h healthy ✓
- macro-indicators: 30h healthy ✓
- kinh-dich-service: 30h healthy ✓
- alert-engine: 30h healthy ✓
- pdf-extractor: 30h healthy ✓
- rag-service: 28h healthy ✓
- news-fetch: 30h healthy ✓
- frontend: 30h healthy ✓
- flaresolverr (infrastructure): 30h healthy ✓

### Health Endpoints

All 11 service health endpoints returning HTTP 200:
- Port 3000 (mcp-server): OK ✓
- Port 4000 (api-gateway): OK ✓
- Port 5010 (stock-price): OK ✓
- Port 5003 (technical-analysis): OK ✓
- Port 5004 (macro-indicators): OK ✓
- Port 5005 (kinh-dich-service): OK ✓
- Port 5006 (alert-engine): OK ✓
- Port 5001 (pdf-extractor): OK ✓
- Port 5002 (rag-service): OK ✓
- Port 5008 (news-fetch): OK ✓
- Port 3001 (frontend): OK ✓

### Restart Count

mcp-server: 0 (threshold ≤ 2) ✓

### Memory Pressure

mcp-server: 80.56% (threshold < 85%) ✓

### EPIPE/ECONNRESET

Last 30 minutes: 0 errors (threshold ≤ 2) ✓

---

## MCP System Status

**Circuit Breakers**: All 16 sources OK, no open/half-open states ✓

**Recent System Errors**: 10 vnstock rate-limited warnings (transient, acceptable, non-blocking) ✓

**Cron Health Review**: Same 4 anomalies as 01:04Z cycle (no recovery, no new fires):

1. **A-21: vnstockFundamentalsRefresh CRASHED** (4+ days, hung since 2026-05-18 01:00)
   - Status: CRASHED
   - Duration: 239,814 seconds (66.6 hours)
   - Success rate: 0%
   - **Dedup**: already fired 01:04Z; ROUTED to 1967-06 (gated 21Z unlock)

2. **A-21b: vnstockTradingStatsRefresh CRASHED** (4+ days, hung since 2026-05-18 08:30)
   - Status: CRASHED
   - Duration: 212,814 seconds (59.1 hours)
   - Success rate: 0%
   - **Dedup**: already fired 01:04Z; same gate as A-21

3. **A-21c: dailyDashboardJob ENOENT** (5+ days, path bug confirmed 01:35Z)
   - Status: ERROR
   - Error: ENOENT: /docs/data/project-stats.json (should be /app/data/)
   - Root cause: local projectRoot() helper in job file vs canonical getProjectRoot() elsewhere
   - **Dedup**: already fired 01:35Z; ROUTED to TASKS.md 1960-DAILYDASH (dev-mcp-server XS fix, in progress at QA)

4. **A-29: bctcReparseJob LOW SUCCESS** (success_rate 84.2%, threshold <90%)
   - Last run: 2026-05-20 19:40:18 (successful)
   - Total runs: 76
   - **Dedup**: already fired 01:04Z; DEFER per NFR-3 BCTC freeze (1954c owns root)

---

## Data Freshness (Market Hours Window)

VN market OPEN (02:00–08:59 UTC). Pipeline health check via MCP:

**Freshness Status**:
- Giá HOSE (prices): 0 min old (updated now) ✓ EXCELLENT
- News RSS: 14 min old (SLA 30min) ✓ GOOD
- Stock quotes: 0 min old ✓ EXCELLENT
- Commodities: 50 min old (SLA 60min) ✓ GOOD
- SBV FX rates: 5 min old (SLA 360min) ✓ EXCELLENT
- Polymarket predictions: 1.1h old (SLA 2h) ✓ GOOD
- **BCTC**: 30.4h old (SLA 120-168h depending on window) ⚠ OBSERVING (per OBSERVE-1960-B-08 freeze)

**Foreign Flow**: Currently active (market hours). Status depends on VPS proxy health (B-12 OBSERVE per prior cycles).

---

## DB & WAL Status

- market.db: 150.15 MB ✓ HEALTHY
- WAL file: 7.82 MB ✓ HEALTHY (< 50MB threshold)
- DB integrity: PRAGMA checks pending (Tier-3 only, scheduled 02:00 UTC next day)
- Circuit breaker anomalies: 0 (all 16 sources OK)

---

## Summary

**Tier-1 STATUS: DEGRADED** (unchanged from 01:04Z cycle)

### Status by Layer
- **Runtime layer (containers)**: PASS ✓ — all 12 UP, 0 restarts, memory healthy
- **Health endpoints**: PASS ✓ — 11/11 returning 200 OK
- **Resource utilization**: PASS ✓ — mcp-server 80.56% mem, 0 restarts
- **Cron layer**: DEGRADED ⚠ — 4 anomalies (3 critical, 1 warn), NO RECOVERY in <1h gap
- **Data freshness**: GOOD-TO-OBSERVE ⚠ — prices/news/SBV all fresh; BCTC/foreign-flow under freeze/observation
- **Circuit breakers**: PASS ✓ — 16/16 sources OK, 0 open/half-open
- **DB integrity**: PENDING (Tier-3 checks at 02:00 UTC daily, next cycle 2026-05-23T02:00Z)

### Dedup & Routing Status
- **A-21, A-21b**: DEDUP (fired 01:04Z); routed 1967-06 (gated 2026-05-22T21:00Z unlock)
- **A-21c**: DEDUP (fired 01:35Z); routed TASKS.md 1960-DAILYDASH (QA in progress, commit 2f0a74e9)
- **A-29**: DEDUP (fired 01:04Z); deferred NFR-3 BCTC freeze (1954c owns root)
- **B-04, B-08, B-12**: Prior Tier-3 findings, OBSERVE-gated or DEFER-frozen per po c245 triage

### No New Anomalies
This cycle (02:04Z) detected same 4 cron issues as 01:04Z cycle <1h earlier. No self-recovery observed. No new failures or fresh signals. All anomalies in DASHBOARD.md with zone assignments and status gates.

---

## Tier-1 Rollout Summary

| Cycle | Start | Duration | Containers | Health | Cron | Status | New | Dedup-skip | Action |
|---|---|---|---|---|---|---|---|---|---|
| 01:04Z | 01:04:00Z | 1min | 12/12 UP | 11/11 OK | 4 anom | DEGRADED | 4 NEW | 0 | BUG alerts sent |
| 01:35Z | 01:35:09Z | <1min | 11/11 UP | 5 sampled OK | 4 same | DEGRADED | 1 NEW (path bug) | 3 | BUG alert sent, DASHBOARD row |
| 02:04Z | 02:04:46Z | <1min | 12/12 UP | 11/11 OK | 4 same | DEGRADED | 0 NEW | 4 | No BUG, no DASHBOARD (all pre-populated) |

---

## Next Steps

**Immediate (< 2h)**:
1. Monitor 1960-DAILYDASH QA progress (commit 2f0a74e9 awaiting ops rebuild smoke test)
2. Await 1967-06 unlock at 2026-05-22T21:00Z for vnstock crash investigation

**Tier-2 Sweep**: Scheduled 03:30Z (next 4-hour cadence) — will re-check B-04/B-08/B-12 freshness under market-open window

**Tier-3 Deep**: Scheduled 2026-05-23T02:00Z (next daily) — DB integrity checks + WAL sizing + cross-table consistency

---

## Alerts Sent

**This cycle (02:04Z)**: No BUG channel alerts (all 4 anomalies already fired in prior cycles today)

**Prior cycles (same date)**:
- 01:04Z: Messages 2550–2553 (A-21, A-21b, A-21c, A-29) sent to BUG channel
- 01:35Z: Message 2554 (A-29 path bug root cause confirmed) sent to BUG channel
- DASHBOARD.md: Rows 1960-A-21-VNSTOCK, 1960-A-21b-VNSTOCK, 1960-A-21c-DAILYDASH, 1960-A-29-BCTC-REPARSE, 1960-A-29-CRON-REPEAT all appended in ops section

**Telegram WORK**: Sent 02:04Z — "[system-auditor] Tier-1 complete 02:04 UTC — 12/12 services UP, all health OK, 4 known anomalies (no new). Status: DEGRADED"

---

## System Health Index

- **Uptime (container layer)**: 100% (12/12 UP)
- **API availability (health endpoints)**: 100% (11/11 OK)
- **Cron success rate**: 93.6% (56 pass + 4 fail out of ~60 tracked jobs in 7d window)
- **Resource utilization**: 80.56% memory (safe)
- **Data freshness (primary sources)**: 95%+ (prices/news/SBV current; BCTC/flow under freeze/observation)
- **Overall system**: DEGRADED (cron layer blocker, no impact to user-facing data flows yet)

---
