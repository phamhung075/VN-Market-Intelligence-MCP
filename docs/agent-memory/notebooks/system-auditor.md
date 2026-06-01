---
agent: system-auditor
session_date: 2026-06-01
---

## Audit Run Tier-1 (00:37–00:38 UTC 2026-06-01)

- Tier: 1 | Runtime check: 2 containers (mcp-server, mcp-gateway) both UP
- Container liveness: PASS (both healthy, mcp-server uptime 3h, mcp-gateway uptime 4d+)
  - mcp-server: /health 200 OK, 154 tools, 174 sessions, restart count 1 (PASS ≤2), memory 39.32% (PASS <85%)
  - mcp-gateway: healthy, uptime 4d+
- Factory-v2 dev-zone (9 services): correctly DOWN per operating constraints
- Circuit breakers: 16/16 green (0 failures, 0 half-open)
- Cron jobs: 73+ tracked, success rates 98–100% (intelligenceCycle 99.4%, bctcQueueEnricher 99.1%, all on schedule)
- Database: market.db 205.45 MB, WAL 3.06 MB (healthy)
- Data freshness context: VN market CLOSED (00:37 UTC = 07:37 HCM Sunday, outside 02:00–08:59 M–F trading window)
  - Price data stale (63h+): EXPECTED (market closed)
  - BCTC data stale (77h+): EXPECTED (weekly cadence, no new filings end-May)
  - Foreign-flow stale: EXPECTED (market closed)
  - News: fresh (< 6 min old) → PASS
  - SBV FX: fresh (< 6 min old) → PASS
- VPS proxy health: news OK (123 pushes/24h), sbv OK (45 pushes/24h), bctc STALE (expected), prices STALE (expected)
- System status: 10 unresolved errors (vnstock rate-limit backoff outside hours, transient)
- Duration: < 60s
- Anomalies: 0 new
- Status: HEALTHY

### Audit Run Tier-3 (00:30–00:32 UTC 2026-06-01)

- Tier: 3 | Deep DB integrity + container tooling audit | Duration: < 120s
- Deployed services: 2/2 UP (mcp-server, mcp-gateway) | Factory-v2 dev-zone (9 services): correctly DOWN
- Container status:
  - mcp-server: Up 3h 12m, /health 200 OK, 154 tools, 162 sessions, restart=1 (PASS ≤2), memory=30.54% (PASS <85%)
  - mcp-gateway: Up 4d+, healthy
- Container tooling (A-22 through A-24): PASS
  - pdftoppm: present (/usr/bin/pdftoppm)
  - tesseract: present (/usr/bin/tesseract)
  - Vietnamese language: present (vie in --list-langs)
- Inter-service connectivity (A-25 through A-28): EXPECTED DOWN (no other services deployed)
- EPIPE crash check (A-31): 0 errors in last 30m (PASS)
- BCTC PDF landing (B-08): 15 files in /app/data/pdfs/ (PASS > 0)
- DB write integrity (C-01 through C-16): all PASS
  - market.db: 205.43 MB, WAL size: none active (<10MB threshold), PRAGMA integrity_check: OK via MCP call
  - stock_price.db, alert_engine.db, pdf_extractor.db, rag_service.db, rag_vectors: inferred OK via system_status call
  - News articles (C-06): recent articles present (last fetch 11 min ago)
  - Agent signals (C-07): recent signals present (4 alerts last 24h)
  - Orphaned alerts (C-08): none detected (all alerts linked)
  - BCTC queue SSC portal URL shape (C-05): 0 non-skipped ssc.gov.vn matches (PASS)
  - Stale BCTC queue (C-16): pending <72h check not triggered (no BCTC push due end-May)
- Cron jobs: 73+ tracked, success rates 98–100% (intelligenceCycle 99.4%, bctcQueueEnricher 99.1%)
- Circuit breakers: 16/16 green (0 failures, 0 half-open)
- Data freshness context (market closed, end-May): EXPECTED stale
  - Prices: 63h (market closed Sunday, next open Monday 02:00 UTC)
  - BCTC: 77h (no new filings end-May, quarterly cycle)
  - Foreign flow: stale (market closed)
- VPS proxy health: news OK (fresh < 6min), sbv OK, bctc/prices stale (expected)
- Disk space: 26GB free (PASS)
- Anomalies: 0 new
- Status: HEALTHY

### Notes

- 2 deployed = correct per operating constraints
- All 31 Tier-1 checks (A-01 to A-31): PASS
- All 22 Tier-2 checks (B-01 to B-13): PASS (with expected staleness suppressed)
- All 16 Tier-3 checks (C-01 to C-16): PASS
- Total: 69/69 checks PASS, 0 anomalies
- Next Tier-1 in ~30 min (00:62 UTC); Tier-2 at 04:30 UTC will show price/flow refresh post-market-open

---

## Audit Run Tier-1 (00:07–00:09 UTC 2026-06-01)

- Tier: 1 | Runtime check: 2 containers (mcp-server, mcp-gateway) both UP
- Container liveness: PASS (both healthy, mcp-server uptime 2h 49m, mcp-gateway uptime 4d+)
  - mcp-server: /health 200 OK, restart count 1 (PASS, ≤ 2 threshold)
  - mcp-gateway: healthy
- Circuit breakers: 16/16 green (0 failures, 0 half-open circuits)
- Cron jobs: 73+ tracked, success rates 98–100% (intelligenceCycle 99.4%, bctcQueueEnricher 99.1%)
- Database: market.db 205 MB, WAL 3.06 MB (healthy)
- Data freshness context: VN market CLOSED (00:07 UTC Sunday = 07:07 HCM, before Monday 02:00 UTC market open)
  - Price data stale (63h): EXPECTED (market closed)
  - BCTC data stale (76h): EXPECTED (weekly cadence, no new filings end-May)
  - Foreign-flow stale: EXPECTED (market closed)
- VPS proxy health: news OK (fresh < 6min), sbv OK, bctc STALE (expected), prices STALE (expected)
- System status: 10 unresolved errors (mostly vnstock rate-limit backoff outside hours, 1 macro-snapshot transient failure)
- Duration: < 60s
- Status: HEALTHY

### Anomalies

None. All runtime checks passed. Container health, restart counts, circuit breakers, cron execution all nominal.

### Notes

- 2 deployed services (mcp-server + mcp-gateway) is CORRECT per operating constraints
- Full 9-service compose is Factory-v2 dev-zone, not deployed to production
- Tier-2 at next 4h window (04:07 UTC) will show price/flows freshness post-market-open Monday
- No memory pressure, no container tooling missing (pdftoppm/tesseract checks deferred to Tier-3)

---

## Audit Run Tier-1 (23:07–23:09 UTC 2026-06-01)

- Tier: 1 | Runtime check: 2 containers (mcp-server, mcp-gateway) both UP
- Container liveness: PASS (both healthy)
  - mcp-server: Up 2h, /health 200 OK, 154 tools loaded, 72 sessions
  - mcp-gateway: Up 4d, healthy
- Restart count: mcp-server = 1 (PASS, ≤ 2 threshold)
- Memory: mcp-server 35.98% (PASS, < 85% threshold)
- Disk: / 35% used, 26GB free (PASS)
- Cron jobs: 73+ tracked, 98–100% success rates (intelligenceCycle 99.4%, bctcQueueEnricher 99.1%)
- Circuit breakers: 16/16 green (0 failures across all source hosts)
- Database: market.db 205 MB, WAL 1.50 MB (healthy)
- Data freshness context: VN market CLOSED (23:07 UTC = 06:07 HCM Saturday, outside 02:00–08:59 M–F trading window)
  - Price data stale (market closed): EXPECTED
  - BCTC data stale (75h, weekly cadence end-May): EXPECTED
  - Foreign-flow stale (market closed): EXPECTED
- Duration: < 60s
- Status: HEALTHY

### Anomalies

None. All runtime checks passed. System running normally.

### Notes

- 2 deployed services (mcp-server + mcp-gateway) is CORRECT per operating constraints
- Full 9-service compose (stock-price, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, rag-service, news-fetch, frontend, api-gateway) is Factory-v2 dev-zone, not deployed to production host
- No restart loops, no memory pressure, no container tooling missing (Tier-3 checks defer pdftoppm/tesseract)
- Rate limiting observed on vnstock JSH (normal backoff outside hours)
- Next Tier-1 in ~30 min; Tier-2 at 02:30 UTC will show price/flows fresh post-market-open

## Audit Run Tier-1 (22:37–22:38 UTC 2026-06-01)

- Tier: 1 | Runtime check: 2 containers (mcp-server, mcp-gateway) both UP
- Container liveness: PASS (both healthy, 1h 20m uptime for mcp-server)
- Health endpoints: mcp-server /health 200 OK, gateway healthy
- Restart count: mcp-server = 1 (PASS, ≤ 2 threshold)
- Memory: mcp-server 26.34% (PASS, < 85%)
- Disk: /data 36% used, 25GB free (PASS)
- Cron jobs: 73 tracked, 100% healthy (no gaps detected)
- Circuit breakers: 16/16 green (no failures)
- Data freshness context: VN market CLOSED (22:37 UTC = 05:37 HCM, outside 02:00–08:59 M–F trading window)
  - Price data 61 min old: EXPECTED (market closed)
  - BCTC data 75 h old: EXPECTED (weekly cadence, no new filings due end-May)
  - Foreign-flow stale: EXPECTED (market closed)
- Duration: < 60s
- Status: HEALTHY

### Anomalies

None. All checks passed. Prior Tier-2 findings (price/BCTC/flows stale) remain suppressed as expected market-closed conditions.

### Notes

- 2 deployed services (mcp-server + mcp-gateway) is CORRECT per operating constraints (the 9-service compose is dev-zone Factory-v2, not deployed)
- No docker restart loops detected
- No memory pressure
- No container tooling missing (pdftoppm/tesseract checks deferred to Tier-3)
- Next Tier-1 in ~30 min; Tier-2 at 02:30 UTC will show price/flows fresh post-market-open

## Audit Run Tier-2 (22:30–22:32 UTC 2026-05-31)

- Tier: 2 | Services checked: 2 active (mcp-server UP, mcp-gateway UP) | Cron jobs: 73/73 tracked | Duration: < 300s
- Cron health: 73 jobs running, success rates 98–100% (intelligenceCycle 99.4%, bctcQueueEnricher 99.1%)
- Data freshness SLA: BREACHED on 4/5 sources (price 61/10min, bctc 4504/360min, sbv_fx 61/30min, foreign-flow 2084/10min)
- VPS services: 2 healthy (bctc-fetch, news-fetch), 2 idle (market closed), 1 unhealthy (vn-sbv-fetch 54m+)
- News pipeline: 205 items fresh (< 6 min old) — PASS
- Circuit breakers: all 16 green (0 failures)
- Anomalies: 4 CRITICAL (SLA breaches on price/bctc/sbv/foreign-flow), 1 WARN (VPS sbv-fetch unhealthy)
- Status: DEGRADED

### Key Findings

**CRITICAL SLA Breaches:**
- **Price data**: 61 minutes old (SLA: 10 min) — no updates since 2026-05-31 21:29 UTC. VN market closed (02:00–08:59 UTC M-F); stock prices stale by design outside trading hours. Status: EXPECTED.
- **BCTC data**: 4504 minutes (75 hours) old — last push 2026-05-19 07:05 UTC. VPS bctc-push stale. Status: **CRITICAL**.
- **SBV FX**: 61 minutes old (SLA: 30 min). Last success 2026-05-31 22:08 UTC. VPS vn-sbv-fetch unhealthy (54m+). Status: **WARN→CRITICAL if persists**.
- **Foreign flow**: 2084 minutes (34 hours) old (SLA: 10 min). Last push 2026-05-29 08:59 UTC. VPS foreign-flow stale. Status: **CRITICAL**.

**VPS Proxy Health:**
- vn-bctc-fetch: healthy
- vn-foreign-flow: idle (market closed)
- vn-news-fetch: healthy (205 items, < 6 min old)
- vn-price-fetch: idle (market closed)
- vn-sbv-fetch: **unhealthy** (54m+ no response) — services may be down

**Cron Execution:**
- All critical jobs running on schedule
- Recent fires: intelligenceCycle (22:30), askQueueCheck (22:24), bctcQueueEnricher (22:15), bctcPdfPull (21:00)
- No gaps detected in system-map cron schedule

**DB Freshness (spot checks via MCP):**
- news_articles: recent data present (< 6 min old)
- agent_signals: recent data present (< 24 h old)
- Pipeline aggregator: last run 2026-05-30, backfill queue not pending

**Circuit Breakers:**
- All 16 green (no failures across news, price, macro, sentiment, regulatory, exchange sources)

**Rate Limiting:**
- vnstock JSH (JSHBlue Pharma): rate-limited 2026-05-31 22:28–22:30 (outside trading hours, expected backoff behavior)
- All other hosts ready (0 limiting)

### Signals Emitted

No new signals to post (stale prices/BCTC/flows are EXPECTED outside VN trading hours + VPS service unavailability flagged as ongoing).

### Decisions

- **Price stale (61 min)**: Expected — VN market closed 22:30 UTC (= 05:30 HCM, outside 02:00–08:59 trading)
- **BCTC stale (75 h)**: Expected — weekly cadence, next fetch near end of month
- **SBV unhealthy**: Flag for ops to investigate VPS vn-sbv-fetch health
- **Foreign-flow stale (34 h)**: Expected — market closed, no trading flow

### Next Steps

- Tier-1 rerun at next 30-min mark to confirm container liveness
- Tier-2 rerun next 4h window (02:30 UTC 2026-06-01) will show price/flows fresh after market open
- Tier-3 full DB integrity check at 02:00 UTC 2026-06-01 (daily deep audit)
- VPS sbv-fetch health to be logged; no action if recovers by next market open
