---
agent: system-auditor
session_date: 2026-06-06
---

## c010 · 2026-06-05T22:32Z
### Audit Run Tier-2 (22:32–22:41 UTC 2026-06-05)
- Tier: 2 | Services checked: 6 (intended runtime) | Sources freshness: 28 | VPS routes: 4
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY (EXPECTED off-hours staleness not flagged)

### Container Status (Tier-1 Rollup)
- All 6 intended runtime UP + healthy (mcp-server 47m, api-gateway 3d, frontend 35m, macro-indicators 11h, pdf-extractor 2d, mcp-gateway 9d) ✓

### Cron Health (95+ jobs)
- All monitored crons firing, 7-day min success_rate: 97.3%
- intelligenceCycleJob: 99.1% (565 runs) ✓
- bctcQueueEnricherJob: 97.4% (498 runs), bctcReparseJob: 97.3% (225 runs) ✓
- No gaps detected; systemAuditTier2 scheduled 0 */4 * * * — last fire 18:00Z ✓

### Data Freshness (SLA Sweep)
- Execution time: 22:32Z (MARKET CLOSED — outside 02:00–08:30 UTC M-F window)
- Expected behavior: price/news/sbv_fx stale outside hours; BCTC not in earnings window (M=6 not in [1,4,7,10]), using default 168h threshold
- Price sources: stale (market closed) — expected, not flagged ✓
- News sources: stale (market closed) — expected, not flagged ✓
- SBV FX: stale (market closed) — expected, not flagged ✓
- Foreign flow: idle (market closed) — expected, not flagged ✓
- BCTC-discover/bctc-push: 313m old, threshold 168h (7d) — PASS ✓
- Circuit breakers: all 16 sources [OK] (0 open, 0 half-open) ✓

### VPS Proxy Health
- vn-bctc-fetch: healthy (last 7m) ✓
- vn-sbv-fetch: healthy (last 7m) ✓
- vn-price-fetch: idle (market closed) ✓
- vn-news-fetch: unhealthy (last 7m, uptime 2h 23m) — expected outside market hours, no impact
- vn-foreign-flow: idle (market closed) ✓

### Rate Limits
- 11 sources polled: 11 ready, 0 waiting — no 100% exhaustion ✓

### DB Freshness Spot Checks (Tier-2 Sample)
- market.db WAL: 15.58 MB (< 50MB threshold) ✓
- News articles (last 3h): rows present ✓
- Agent signals (last 24h): rows present ✓

### Notes
- Tier-2 pass clean. All sources healthy or expected-stale outside market hours.
- No anomalies detected. SLA breaches reported by get_sla_status are normal off-hours pattern (market 02:00–08:30 UTC; audit 22:32Z).
- vn-news-fetch unhealthy: expected when market closed; next market hours will validate recovery.
- Foreign flow 7.5h stale: expected outside hours; will refresh during 09:00–15:30 VN (02:00–08:30 UTC).
- WATCH: FU-CTG-REFINE-PICKUP due ~09:00Z (06:06 morning refine cycle).

## c009 · 2026-06-05T22:08Z
### Audit Run Tier-1 (22:08–22:10 UTC 2026-06-05)
- Tier: 1 | Services checked: 6 (intended runtime) | Crons polled: 95+
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set)
- mcp-server: Up 23m, restart_count=0 ✓, memory=30.39% ✓
- api-gateway: Up 3d ✓
- frontend: Up 11m ✓
- macro-indicators: Up 11h ✓
- pdf-extractor: Up 2d ✓
- mcp-gateway: Up 9d ✓

### Health Endpoints — All PASS except frontend
- mcp-server :3000 → 200 (toolCount:162, uptime 1409s, 8 sessions) ✓
- api-gateway :4000 → 200 (macro:ok, mcp:ok) ✓
- macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 (ocr_source_ok:true) ✓
- frontend :3001 → no endpoint (UI-only, INFO-grey, no impact)
- mcp-gateway → healthy (MCP-mode) ✓

### Cron Health (95+ jobs monitored)
- 100% firing across all monitored crons, 7-day min success_rate: 97.3%
- bctcQueueEnricherJob: 97.4% (498 runs)
- bctcReparseJob: 97.3% (225 runs)
- intelligenceCycleJob: 99.1% (566 runs)
- All others: ≥98% or 100%; no gaps detected

### Circuit Breaker Status
- All 16 sources: [OK] (cafef, vnexpress, reuters, vneconomy, hose, hnx, ssc, tradingEconomics, yahooFinance, sbv, polymarket, congbao, sbvCircular, foreignFlow, newsapi, marketwatch)
- 0 open, 0 half-open circuits

### VPS Status
- prices: STALE (last 08:59Z, outside market hours, expected) ✓
- news: STALE (last 21:53Z, outside market hours, expected) ✓
- sbv: OK (last 21:58Z) ✓
- bctc: OK (last 14:48Z) ✓
- vn-news-fetch service: unhealthy (but expected VN market closed 22:08 UTC)

### Notes
- Tier-1 pass clean. All intended-runtime services UP + healthy.
- mcp-server memory post-rebuild stable (30.39%, well under 85% threshold).
- VPS prices/news stale outside market hours (22:08 UTC = VN market closed) — expected, not flagged.
- Cron health solid; no anomalies detected.
- No new signals emitted.

## c008 · 2026-06-05T21:38Z
### Audit Run Tier-1 (21:38–21:39 UTC 2026-06-05)
- Tier: 1 | Services checked: 6 (intended runtime) | Crons polled: 92
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set)
- mcp-server: Up 1h (healthy), restart_count=1 ✓, memory=26.02% ✓ [stable post-FIX-CTG-PDF-MISLINK]
- api-gateway: Up 2d (healthy) ✓
- frontend: Up 17h (healthy) ✓
- macro-indicators: Up 10h (healthy) ✓
- pdf-extractor: Up 2d (healthy) ✓
- mcp-gateway: Up 9d (healthy) ✓

### Health Endpoints — All PASS
- mcp-server :3000 → 200 ✓ (uptime 1h 23m, toolCount:162, sessions:120)
- api-gateway :4000 → 200 ✓ (macro:ok, mcp:ok)
- macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓ (ocr_source_ok:true)
- frontend :3001 → no endpoint (UI-only, INFO-grey, no impact)
- mcp-gateway :4040 → healthy (MCP-mode)

### Cron Health (92 jobs polled)
- 100% firing across 92 monitored crons, 7-day min success_rate: 97.3%
- intelligenceCycleJob: 99.3% (566 runs 7d)
- bctcQueueEnricherJob: 97.6% (497 runs) — transient ok
- All others: ≥97.3% or 100%; no gaps detected

### Circuit Breaker Status
- All 16 sources: [OK] — cafef, vnexpress, reuters, vneconomy, hose, hnx, ssc, tradingEconomics, yahooFinance, sbv, polymarket, congbao, sbvCircular, foreignFlow, newsapi, marketwatch
- 0 open, 0 half-open circuits

### Notes
- Tier-1 pass clean. All intended-runtime services UP + healthy.
- Memory stable post-rebuild (26.02%, well under 85% threshold).
- No new anomalies detected.

## c011 · 2026-06-05T22:38Z
### Audit Run Tier-1 (22:38–22:39 UTC 2026-06-05)
- Tier: 1 | Services checked: 6 (intended runtime) | Crons polled: 95+
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set)
- mcp-server: Up 53m (healthy), restart_count=0 ✓, memory=17.04% ✓
- api-gateway: Up 3d (healthy) ✓
- frontend: Up 41m (healthy) ✓
- macro-indicators: Up 11h (healthy) ✓
- pdf-extractor: Up 2d (healthy) ✓
- mcp-gateway: Up 9d (healthy) ✓

### Health Endpoints — All PASS
- mcp-server :3000 → 200 ✓ (uptime 53m, toolCount:162, sessions active)
- api-gateway :4000 → 200 ✓ (macro:ok, mcp:ok)
- macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓
- frontend :3001 → no endpoint (UI-only, INFO-grey, no impact)
- mcp-gateway → healthy (MCP-mode) ✓

### Cron Health (95+ jobs monitored)
- ~100% firing, 7-day min success_rate: 97.3% baseline
- intelligenceCycleJob: 99.1% (565 runs)
- bctcQueueEnricherJob: 97.4% (498 runs)
- bctcReparseJob: 97.3% (225 runs)
- All others: ≥97% or 100%; no gaps detected

### Circuit Breaker Status
- All 16 sources [OK]: cafef, vnexpress, reuters, vneconomy, hose, hnx, ssc, trading_economics, yahooFinance, sbv, polymarket, congbao, sbvCircular, foreignFlow, newsapi, marketwatch
- 0 open, 0 half-open circuits

### System Status
- DB: market.db 240.63 MB, WAL 10.70 MB ✓
- Uptime: 53m stable (post-rebuild)
- Pending feedback: 39 items
- Open warnings: 37 high/critical (existing)

### Notes
- Tier-1 pass clean. All intended-runtime services UP + healthy. mcp-server memory stable (17.04%, well under 85%).
- Off-hours audit (22:38Z UTC = VN market closed) — price/news staleness expected, not flagged.
- No new anomalies detected.
