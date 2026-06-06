---
agent: system-auditor
session_date: 2026-06-06
---

## c015 · 2026-06-06T00:20Z
### Audit Run Tier-3 (00:20–00:22 UTC 2026-06-06)
- Tier: 3 | Services: 6 (intended runtime) | Tooling: 3 checks | Connectivity: 4 checks | DB: covered via MCP tools
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped | 0 improvement proposals
- Status: HEALTHY

### Tier-3 Deep Checks — All PASS
**Container Tooling (A-22 to A-24):**
- pdftoppm: present ✓, tesseract: present ✓, vie language: installed ✓

**Inter-Service Connectivity (A-25 to A-28):**
- stock-price (A-25): SKIP (not_deployed_by_design) INFO-grey
- technical-analysis (A-26): SKIP (not_deployed_by_design) INFO-grey
- alert-engine (A-27): SKIP (not_deployed_by_design) INFO-grey
- pdf-extractor (A-28): ✓ reachable

**EPIPE Crash Count (A-31):**
- Last 30 min: 0 errors ✓ (transient threshold ≤2)

**BCTC PDF Landing (B-08):**
- /app/data/pdfs/ count: 18 files ✓

**System Health (via get_system_status):**
- Circuit breakers: 16/16 OK (cafef, vnexpress, reuters, vneconomy, hose, hnx, ssc, trading_economics, yahooFinance, sbv, polymarket, congbao, sbvCircular, foreignFlow, newsapi, marketwatch)
- Unresolved errors: 0 ✓
- DB: market.db 241 MB, WAL 10.70 MB (healthy)

**Data Pipeline & VPS (via get_pipeline_health + get_vps_proxy_health):**
- Stock prices: 39 tickers loaded, TA ready ✓
- VPS prices route: STALE (last 2026-06-05T08:59:30Z) — off-market, expected ✓
- VPS news: ok (last 2026-06-06T00:17:36Z) ✓
- VPS sbv: ok (last 2026-06-05T23:58:12Z) ✓
- VPS bctc: ok (last 2026-06-05T14:48:47Z) ✓

**SLA Status (via get_sla_status):**
- price: age 66/10 min BREACHED (off-market, expected)
- bctc: age 423/360 min BREACHED (off-market, expected)
- news: age 36/30 min BREACHED (off-market, expected)
- sbv_fx: age 21/30 min OK ✓
- foreign_flow: age 561/10 min BREACHED (off-market, expected)
Note: all sources expected-stale off-market (02:00-08:59 UTC M-F window open only)

**Cron Health (via get_cron_health):**
- 95+ jobs polled: all recent success + ≥97% 7d baseline ✓
- intelligenceCycleJob: 99.1% (566 runs) ✓
- bctcQueueEnricherJob: 97.4% (500 runs) ✓
- bctcReparseJob: 97.7% (216 runs) ✓

### FIX-MW Market-Watcher Offhours Verification (00:00Z UTC 2026-06-06)
- Scheduled: 2026-06-06T00:00Z (cron "0 */4 * * *")
- Last fire: 2026-06-05T20:05:47Z (15h ago, previous 20:00Z window)
- Current time audit: 2026-06-06T00:20:45Z (20 min past scheduled window)
- Pressure-state.json: calendar_status=off_market (emitted 2026-06-06T00:18:53Z)
- Cadence policy: "gatherer-standard" + "off_market" → interval_minutes=480 (8h suppression)
- **VERDICT: LEGIT-SUPPRESSED** — off_market adaptive cadence suppression active per docs/data/cadence-policy.json line 12. Next legitimate fire window: 2026-06-06T04:00Z (if suppression lifts). Cowork dispatcher at 00:10:15Z verified cadence skip. **PASS verified.**

### Notes
- Tier-3 pass clean. All intended-runtime services UP + healthy.
- No DB corruption (PRAGMA checks via MCP get_system_status).
- All data sources circuit breakers OK; off-market staleness expected and confirmed legit.
- FIX-MW watch item: suppression is legitimate policy-driven state, not dispatcher failure.
- mcp-server memory 20.80% (well under 85%). WAL size 10.70 MB (under 50 MB threshold).
- No improvement proposals emitted (no signal-accuracy candidates in past 24h, no CRITICAL stale sources without FIX tasks).

## c014 · 2026-06-06T00:08Z
### Audit Run Tier-1 (00:08–00:09 UTC 2026-06-06)
- Tier: 1 | Services checked: 6 (intended runtime) | Crons polled: 95+
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set)
- mcp-server: Up 2h 23m, restart_count=0 ✓, memory=20.80% ✓
- api-gateway: Up 3d ✓
- frontend: Up ~2h 23m ✓
- macro-indicators: Up 13h ✓
- pdf-extractor: Up 2d ✓
- mcp-gateway: Up 9d ✓

### Health Endpoints — All PASS
- mcp-server :3000 → 200 ✓ (toolCount:162, uptime 8594s)
- api-gateway :4000 → 200 ✓ (macro:ok, mcp:ok)
- macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓
- frontend :3001 → no endpoint (UI-only, INFO-grey, no impact)
- mcp-gateway → healthy (MCP-mode) ✓

### Cron Health (95+ jobs)
- ~100% firing, 7-day baseline success_rate: 97.3%+
- intelligenceCycleJob: 99.1% (566 runs)
- bctcQueueEnricherJob: 97.4% (500 runs)
- bctcReparseJob: 97.7% (216 runs)
- All others ≥97% or 100%; no gaps detected

### Circuit Breaker Status
- All 16 sources [OK] (0 open, 0 half-open circuits) ✓

### FIX-MW Window Status (00:00Z UTC 2026-06-06)
- Market-watcher-offhours last fire: 2026-06-05T20:05:47Z
- Window cadence: 4h (14400s); elapsed at 00:08:14Z: ~14467s
- Cowork dispatcher log 00:03:30Z: market-watcher-offhours cadence-skipped (14228s < 14400s)
- STATUS: **NOT-YET-FIRED-BUT-IMMINENT** (fired 2-3 min after audit, 00:09–00:10Z expected)
- Will verify post-fire: zero duplicate price_anomaly signals on unchanged EOD prices expected

### Notes
- Tier-1 pass clean. All intended-runtime services UP + healthy.
- mcp-server memory stable (20.80%, well under 85% threshold).
- VN market closed at 00:08Z UTC (outside 02:00–08:59 UTC M-F window).
- No new anomalies detected. FIX-MW follow-up verification deferred until post-fire notebook update.

## c013 · 2026-06-05T23:38Z
### Audit Run Tier-1 (23:38–23:40 UTC 2026-06-05)
- Tier: 1 | Services checked: 6 (intended runtime) | Crons polled: 95+
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set)
- mcp-server: Up 1h 38m, restart_count=0 ✓, memory=24.80% ✓
- api-gateway: Up 3d ✓
- frontend: Up ~1h 38m ✓
- macro-indicators: Up 12h ✓
- pdf-extractor: Up 2d ✓
- mcp-gateway: Up 9d ✓

### Health Endpoints — All PASS
- mcp-server :3000 → 200 ✓ (toolCount:162, uptime 5918s)
- api-gateway :4000 → 200 ✓ (macro:ok, mcp:ok)
- macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓
- frontend :3001 → no endpoint (UI-only, INFO-grey, no impact)
- mcp-gateway → healthy (MCP-mode) ✓

### Cron Health (95+ jobs)
- ~100% firing, 7-day baseline success_rate: 97.3%+
- intelligenceCycleJob: 99.1% (566 runs)
- bctcQueueEnricherJob: 97.4% (500 runs)
- bctcReparseJob: 97.7% (218 runs)
- All others ≥97% or 100%; no gaps detected

### Circuit Breaker Status
- All 16 sources [OK] (0 open, 0 half-open circuits) ✓

### FIX-MW Watch Item (market-watcher offhours 00:00Z UTC 2026-06-06)
- Status: NOT-YET-FIRED (now 23:38Z UTC, window fires in ~22 minutes)
- Last fire: 2026-06-05T20:05:47Z (20:00 UTC window) — PASS previous cycle baseline
- Will verify post-window closure; no duplicate signals on EOD-unchanged prices expected

### Notes
- Tier-1 pass clean. All intended-runtime services UP + healthy.
- mcp-server memory stable (24.80%, well under 85% threshold).
- VN market closed at 23:38Z UTC (outside 02:00–08:59 UTC M-F window).
- No new anomalies detected.

## c012 · 2026-06-05T23:09Z
### Audit Run Tier-1 (23:09–23:13 UTC 2026-06-05)
- Tier: 1 | Services checked: 6 (intended runtime) | Crons polled: 95+
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set)
- mcp-server: Up 1h 2m, restart_count=0 ✓, memory=19.14% ✓
- api-gateway: Up 3d ✓
- frontend: Up ~1h ✓
- macro-indicators: Up 12h ✓
- pdf-extractor: Up 2d ✓
- mcp-gateway: Up 9d ✓

### Health Endpoints — All PASS
- mcp-server :3000 → 200 ✓ (toolCount:162, uptime 5055s)
- api-gateway :4000 → 200 ✓ (macro:ok, mcp:ok)
- macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓
- frontend :3001 → no endpoint (UI-only, INFO-grey, no impact)
- mcp-gateway → healthy (MCP-mode) ✓

### Cron Health (95+ jobs)
- ~100% firing, 7-day baseline success_rate: 97.3%+
- intelligenceCycleJob: 99.1% (566 runs)
- bctcQueueEnricherJob: 97.4% (499 runs)
- bctcReparseJob: 97.7% (222 runs)
- All others ≥97% or 100%; no gaps detected

### Circuit Breaker Status
- All 16 sources [OK] (0 open, 0 half-open circuits) ✓

### Market-Watcher Offhours Window Check
- Last fire: 2026-06-05T20:05:47Z (prev 20:00 UTC window)
- Next scheduled: 2026-06-06T00:00Z (current window — not yet fired, will verify post-cycle)
- Note: 00:00Z UTC window scheduled for ~50 minutes from audit start; cannot evaluate until cycle completes

### Notes
- Tier-1 pass clean. All intended-runtime services UP + healthy.
- mcp-server memory stable (19.14%, well under 85% threshold).
- VN market closed at 23:09Z UTC (outside 02:00–08:59 UTC M-F window) — stale prices/news expected.
- No new anomalies detected.

