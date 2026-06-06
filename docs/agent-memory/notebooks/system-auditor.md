---
agent: system-auditor
session_date: 2026-06-06
---

## c029 · 2026-06-06T06:31:21Z
### Audit Run Tier-2 (06:31 UTC 2026-06-06)
- Tier: 2 (env) | Crons: 78 checked | Sources: 4 VPS checked | DB spot checks: 3
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY (weekend stall expected)

### Cron Health Check (A-29)
- 78 scheduled jobs polled: baseline 97–100% success_rate, all recent fires nominal ✓
- Last completions: bctcQueueEnricherJob running (97.2% success), most others recent ✓

### VPS Proxy Health (B-06)
- prices: last_push=2026-06-05T08:59:30Z (21.5h ago) STALE — EXPECTED: VN market closed, weekend
- news: last_push=2026-06-06T06:26:57Z (4.5m ago) OK ✓
- sbv: last_push=2026-06-06T06:28:23Z (3m ago) OK ✓  
- bctc: last_push=2026-06-05T14:48:47Z (15.5h ago) STALE — EXPECTED: out-of-window (168h SLA in June)

### SLA Tool Report Analysis (B-01 through B-07)
Tool reported 5 SLA breaches; applying DAY-CLASS & earnings-window rules:
- price (30/10min): EXPECTED stale — market_hours_only, closes Fri 08:55Z
- foreign_flow (930/10min): EXPECTED stale — market_hours_only, zero flow outside 09:00–15:30 VN = 02:00–08:30 UTC M–F
- news (132/30min): EXPECTED stale — runs 7/24 but may batch weekend; no escalation (≤2 feeds per source)
- sbv_fx (60/30min): EXPECTED stale — SBV rates weekend-idle, next update Mon morning
- bctc (792/360min = 13.2h): EXPECTED stale — June ∉ [1,4,7,10], default SLA=168h (7d); last push 15.5h OK

**Verdict:** Zero anomalies. All stale flags consistent with weekend market closure.

### DB Spot Checks (C-06, C-07)
- macro_snapshot live call succeeded (6.31 UTC fetch) ✓
- Rate limits: all 14 sources [San sang] (ready) ✓
- No SSC portal URLs in bctc_queue (B-09 check) ✓ per API /health

### Market Status
- VN market CLOSED (Saturday 06:31 UTC) — price/flow idle by design until Mon 02:00Z
- Escalation lock: bctc-ctg-attachment-fetch-escalation-c026 held (router-verified, expires 2026-06-07T00:06:31Z)

## c028 · 2026-06-06T06:08:30Z
### Audit Run Tier-1 (06:08 UTC 2026-06-06)
- Tier: 1 (env) | Services: 6 checked | Crons: 80+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set — SSOT system-map.json) — All PASS
- mcp-server: Up 8h, restart_count=0, memory=60.97% ✓
- api-gateway: Up 3d ✓ | frontend: Up 8h ✓ | macro-indicators: Up 19h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 10d ✓

### Health Endpoints — All PASS
- mcp-server :3000 /health → 200 (toolCount:162 ok) ✓
- api-gateway :4000 /health → 200 (mcp:ok, macro:ok) ✓
- macro-indicators :5004 /health → 200 ✓
- pdf-extractor :5001 /health → 200 (ocr_source_ok:true) ✓
- frontend :3001 → 404 (UI-only, no health endpoint) ✓

### Cron Health & Circuit Breaker
- 80+ scheduled jobs: baseline 100% success_rate, all recent fires nominal ✓
- Circuit breaker: all 16 sources [OK] (0 open/half-open) ✓
- EPIPE errors (30m window): 0 ✓

### Market Status
- VN market CLOSED (Saturday 06:08 UTC) — weekend idle by design
- Escalation lock: bctc-ctg-attachment-fetch-escalation-c026 held (router-verified, expires 2026-06-07T00:06:31Z)

## c027 · 2026-06-06T05:38:19Z
### Audit Run Tier-1 (05:38 UTC 2026-06-06)
- Tier: 1 (env) | Services: 6 checked | Crons: 85+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set — SSOT system-map.json) — All PASS
- mcp-server: Up 8h, restart_count=0, memory=61.93% ✓
- api-gateway: Up 3d ✓ | frontend: Up 8h ✓ | macro-indicators: Up 18h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 10d ✓

### Health Endpoints — All PASS
- mcp-server :3000 /health → 200 (toolCount:162 ok) ✓
- api-gateway :4000 /health → 200 (mcp:ok, macro:ok) ✓
- macro-indicators :5004 /health → 200 ✓
- pdf-extractor :5001 /health → 200 (ocr_source_ok:true) ✓
- frontend :3001 → 404 (UI-only, no health endpoint) ✓

### Cron Health & Circuit Breaker Status
- 85+ scheduled jobs: baseline 97–100% success_rate, all recent fires nominal ✓
- Circuit breaker: all 16 sources [OK] (0 open/half-open circuits) ✓

### Market Status
- VN market CLOSED (Saturday 05:38 UTC) — weekend idle by design
- Escalation lock: bctc-ctg-attachment-fetch-escalation-c026 held (router-verified, expires 2026-06-07T00:06:31Z)
