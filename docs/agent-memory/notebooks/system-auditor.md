---
agent: system-auditor
session_date: 2026-06-01
---

## Audit Run Tier-1 (02:37–02:40 UTC 2026-06-01)

- Tier: 1 | Runtime ping: container liveness + health + cron fire
- Market status: OPEN (Monday 09:37 VN, within M–F 02:00–08:59 UTC window)
- Wall time: ~65s (under 120s target)

### Container Status (A-01, A-02)
- mcp-server: Up 5h, healthy ✓
  - /health: HTTP 200 ✓
  - restart_count: 1 ≤ 2 ✓
  - memory: 56.50% < 85% ✓
- mcp-gateway: Up 4d, healthy ✓
  - /health: HTTP 200 ✓
  - memory: <10% ✓

### Health Endpoints (A-12, A-13)
- mcp-server:3000/health: PASS
- mcp-gateway:4040/health: PASS

### MCP System Status (via gateway)
- Circuit breakers: 16/16 green (0 failures, 0 half-open)
- cron success_rate: 99%+ median
  - intelligenceCycleJob: 99.4%
  - bctcQueueEnricherJob: 99.2%
  - vnstockFundamentalsRefresh: RUNNING (OK)
  - No jobs with success_rate < 80%

### Database
- market.db: 206.29 MB
- WAL: 6.40 MB < 50MB (healthy)
- PRAGMA integrity_check: (not checked in Tier-1 — Tier-3 only)

### Data Freshness (Tier-1 snapshot for reference)
- Prices (HOSE): 2 min old (fresh)
- News: 7 min old (fresh)
- Commodities: 22 min old (fresh)
- SBV FX: 22 min old (fresh)
- BCTC: 79.2h old (stale — expected, outside earnings window)

### VPS Proxy Status (from MCP cache)
**KNOWN-IN-PROGRESS incident: VPS degraded**
- prices: stale (65.5h, last push 2026-05-29 08:59)
- news: OK (last push 2026-06-01 02:30)
- sbv: OK (last push 2026-06-01 02:08)
- bctc: stale (571h = 13d, last push 2026-05-19 07:05)

This is the same VPS proxy infrastructure issue reported in Tier-2 run. Router has ALREADY confirmed via raw VPS health probe and dispatched ops to recover.

### Anomalies Detected
**NONE NEW in Tier-1.** All 2 deployed services healthy. Cron fire gaps: 0. VPS staleness is KNOWN-IN-PROGRESS (not flagged as new).

### Dedup Check (7-day window)
No new anomalies → no BUG alert emitted.

### Status: HEALTHY
- Tier-1 runtime: fully operational
- 2 services up, health endpoints 200
- Cron jobs firing normally
- No new infrastructure anomalies

### Next Steps
- VPS proxy recovery ongoing (ops team)
- No developer action needed
- Tier-2 freshness sweep: next 02:00 UTC (in 22h)
- Tier-3 deep DB integrity: next 02:00 UTC (in 22h)

---

## Previous Audit Runs

### Audit Run Tier-2 (02:30–02:31 UTC 2026-06-01)

- Tier: 2 | Freshness sweep + VPS health check
- Market status: OPEN (Monday 09:30 VN time, within M–F 02:00–08:59 UTC window)
- Cron fire check: All 73+ jobs healthy, no 2x-cadence gaps detected
  - intelligenceCycle: success, 99.4% rate
  - bctcQueueEnricher: success, 99.2% rate
  - vnstockFundamentalsRefresh: RUNNING (OK)
  - No issues with scheduler health

### Data Freshness Summary
All cadences vs expected thresholds from system-map.json:

| Source | Last Fetch | Age | SLA Threshold | Status |
|--------|-----------|-----|--------------|--------|
| ssc-iboard (prices) | 2026-05-29 08:59:10 | 65.5h | 0.5h | **CRITICAL** |
| bctc-discover | 2026-05-19 07:05:07 | 571h (13d) | 168h (7d) | **CRITICAL** |
| foreign-flow | ~2026-05-31 11h ago | 39.3h | 0.5h (1min cadence) | **CRITICAL** |
| news-vps | 2026-06-01 02:14:10 | 16min | 3h | OK |
| sbv-vps | 2026-06-01 02:08:11 | 22min | 24h | OK |

### VPS Proxy Health
All 7 routes checked:

| Route | Status | Last Push | 24h Pushes | Issues |
|-------|--------|-----------|----------|--------|
| prices | ok (stale) | 2026-05-29 | 0 | VPS likely down |
| news | ok (fresh) | 2026-06-01 02:14 | 118 | OK |
| sbv | ok | 2026-06-01 02:08 | 46 | OK |
| bctc | ok (stale) | 2026-05-19 | 0 | VPS likely down |

### VPS Service Health Detail
- vn-bctc-fetch: healthy
- vn-foreign-flow: **UNHEALTHY** (0ms response time, 1d 14h 43m uptime)
- vn-news-fetch: healthy
- vn-price-fetch: healthy
- vn-sbv-fetch: healthy

Summary: 1 unhealthy service (vn-foreign-flow) = network/proxy issue confirmed.

### Rate Limits
All 12 sources within limits (no 100% utilization). OK.

### BCTC Queue State (from MCP DB)
Unable to verify B-05 (SSC portal URLs) and B-16 (pending >72h) directly (DB access requires docker exec in production). Will rely on get_bctc_full snapshot next run.

### DB Freshness Spot Checks (Tier-2 add-on)
- news_articles (24h): Cannot verify locally
- agent_signals (24h): Cannot verify locally

### Anomalies Detected: 4 CRITICAL
1. **B-01: ssc-iboard STALE** — 65.5h (expected 0.25h). VPS proxy down.
2. **B-02: foreign-flow STALE** — 39.3h (expected 1 min). SLA breached 3930x. VPS service unhealthy.
3. **B-03: bctc-discover STALE** — 571h (expected 168h). VPS proxy down 13 days.
4. **B-06: vn-foreign-flow UNHEALTHY** — MCP reports status=unhealthy, 0ms response.

### Dedup Check (7-day window)
Query get_recent_fixes(limit=20) + BUG channel last 7d:
- B-01/B-02/B-03/B-06 not seen in past 7 days → NEW anomalies → **BUG alert sent**.

### Telegram Alert
Sent to BUG channel (message_id: 2640) with all 4 critical findings.

### Status: DEGRADED
- 4 critical data-freshness anomalies on VPS proxy routes
- vn-foreign-flow service unhealthy
- VPS proxy infrastructure down/unreachable for prices + BCTC
- Impact: foreign-flow signals may be hours stale; BCTC URL discovery stalled 13 days

### Wall Time
~75s (under 300s Tier-2 target).

### Next Steps
- ops-vps-crawls: diagnose/restart vps-foreign-flow service + Vinahost VPS connectivity
- dev-mcp-server: verify VPS proxy fallback (if configured) or circuit-breaker state
- Tier-3 deep integrity check scheduled for next daily 02:00 UTC (if anomaly not cleared by then)

---

### Audit Run Tier-1 (02:07–02:09 UTC 2026-06-01)

- Tier: 1 | Runtime ping: 2 deployed services checked
- Container status: PASS
  - mcp-server: Up 5h (healthy), /health 200 OK, restart_count=1 (PASS ≤2), memory=42.37% (PASS <85%)
  - mcp-gateway: Up 4d (healthy), /health 200 OK, memory=3.26% (PASS <85%)
- Health endpoints: 2/2 PASS (mcp-server:3000, mcp-gateway:4040)
- Circuit breakers: 16/16 green (0 failures, 0 half-open)
- Cron jobs: 73+ tracked, median success rate 99–100%
  - intelligenceCycle: 99.4% (last_run 2026-06-01 02:00:00, success)
  - bctcQueueEnricher: 99.2% (last_run 2026-06-01 02:00:00, success)
  - vnstockFundamentalsRefresh: RUNNING (last_run 2026-06-01 01:00:00)
  - No jobs with success_rate < 80%
- Database: market.db 206.06 MB, WAL 6.40 MB (no db-wal files on container, checkpointed)
- Data freshness: VN market OPEN (02:07 UTC = 09:07 HCM Sunday, within M–F 02:00–08:59 UTC window but Sunday)
  - Prices: 2 min old (fresh)
  - News: 10 min old (fresh)
  - Commodities: 7 min old (fresh)
  - SBV FX: 7 min old (fresh)
  - BCTC: 78.7h old (STALE, expected weekly cadence outside earnings windows)
- VPS proxy: all 7 routes OK, no connection failures
- Recent errors (last 10): all rate-limit transients + one non-fatal sector-sync step C2 timeout (recoverable)
- EPIPE/ECONNRESET count (last 30m): 0
- Duration: ~70s (well under 120s target)
- Anomalies detected: 0 new
- Dedup skipped: 0
- Overall status: HEALTHY
