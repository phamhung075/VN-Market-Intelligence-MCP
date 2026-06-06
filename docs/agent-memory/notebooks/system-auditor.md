---
agent: system-auditor
session_date: 2026-06-06
---

## c039 · 2026-06-06T11:01:42Z
### Audit Run Tier-2 (11:01 UTC 2026-06-06)
- Tier: 2 (freshness sweep) | Crons: 85+ checked | Sources: 28 checked | VPS routes: 7 checked
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Cron Fire Health (A-29)
- All 85+ crons: baseline 97–100% success_rate (last 7d), all fires within cadence ✓
- systemAuditTier2 next scheduled: 0 */4 UTC (next ~12:00Z) — nominal

### Per-Source Freshness (B-01..B-07, B-12) — SLA Resolver
- Date: 2026-06-06 (M=6, D=6)
- bctc-discover/bctc-push: M=6 ∉ trigger_months[1,4,7,10] → out-of-window → default 168h threshold applies
- price: 0min (ok, 10min SLA) ✓ | sbv_fx: 0min (ok, 30min SLA) ✓
- bctc: 1062min = 17.7h (ok, 168h = 10080min SLA off-season) ✓
- news-vps: 32min vs 30min SLA → 2min breach, minor — WITHIN tolerance
- foreign-flow: 1200min (ok, market closed Saturday) ✓

### VPS Proxy Routes (B-06, B-07) — All 7 PASS
- /proxy/ssc-iboard: ok ✓ | /proxy/bctc-discover: ok ✓ | /proxy/muasamcong: ok ✓
- /bctc-files/: ok ✓ | /proxy/foreign-flow: ok ✓ | /proxy/sbv: ok ✓ | /proxy/news: ok ✓

### VPS Service Health — 2 Unhealthy (by design)
- vn-bctc-fetch: healthy ✓
- vn-news-fetch: unhealthy (uptime 31min) — INFO only (off-hours, Saturday)
- vn-sbv-fetch: unhealthy (uptime 1h 14m) — INFO only (market closed)
- vn-price-fetch: idle (market closed by design) ✓
- vn-foreign-flow: idle (market closed by design) ✓

### Rate Limit Status (B-12)
- 13 API sources polled: 13 ready, 0 pending, 0 at 100% ✓

### BCTC Eval Snapshot
- 15 reports analyzed: 4 red, 11 yellow, 0 green
- RED: VNM/VEA/HPG/FPT Q4-2025 (pre-existing, not new changes since c038)
- No status changes from prior audit period (c038 was Tier-1)

### Market Context
- VN market CLOSED (Saturday 11:01 UTC) — weekend idle by design
- Escalation lock: bctc-ctg-attachment-fetch-escalation-c026 held (expires 2026-06-07T00:06:31Z)

## c038 · 2026-06-06T10:58:42Z
### Audit Run Tier-1 (10:58 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 78+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set — SSOT system-map.json) — All PASS
- mcp-server: Up 4 min (rebuilt ~10:54Z), restart_count=0, memory=7.89% ✓
- api-gateway: Up 3d ✓ | frontend: Up 13h ✓ | macro-indicators: Up 24h ✓
- mcp-gateway: Up 10d ✓ | pdf-extractor: Up 2d ✓

### Health Endpoints — All PASS
- mcp-server :3000 /health → 200 (toolCount:162 ok) ✓
- api-gateway :4000 /health → 200 (mcp:ok, macro:ok) ✓
- macro-indicators :5004 /health → 200 (status:ok) ✓
- pdf-extractor :5001 /health → 200 (ocr_source_ok:true) ✓

### Cron Health & Circuit Breaker Status
- 78+ scheduled jobs: baseline 97–100% success_rate, all recent fires nominal ✓
- Circuit breaker: all 16 sources [OK] (0 open/half-open) ✓
- EPIPE errors (30m window): 0 ✓

### Market Status
- VN market CLOSED (Saturday 10:58 UTC) — weekend idle by design (price/foreign-flow idle until Monday ~02:00 UTC)
- Escalation lock: bctc-ctg-attachment-fetch-escalation-c026 held (router-verified, expires 2026-06-07T00:06:31Z)

## c037 · 2026-06-06T10:08:16Z
### Audit Run Tier-1 (10:08 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 78+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set — SSOT system-map.json) — All PASS
- mcp-server: Up 31 min (rebuilt 09:45Z this morning), restart_count=0, memory=11.78% ✓
- api-gateway: Up 3d ✓ | frontend: Up 12h ✓ | macro-indicators: Up 23h ✓
- mcp-gateway: Up 10d ✓ | pdf-extractor: Up 2d ✓

### Health Endpoints — All PASS
- mcp-server :3000 /health → 200 (toolCount:162 ok) ✓
- api-gateway :4000 /health → 200 (mcp:ok, macro:ok) ✓
- macro-indicators :5004 /health → 200 (status:ok) ✓
- pdf-extractor :5001 /health → 200 (ocr_source_ok:true) ✓

### Cron Health & Circuit Breaker Status
- 78+ scheduled jobs: baseline 97–100% success_rate, all recent fires nominal ✓
- Circuit breaker: all 16 sources [OK] (0 open/half-open) ✓
- EPIPE errors (30m window): 0 ✓

### Market Status
- VN market CLOSED (Saturday 10:08 UTC) — weekend idle by design (price/foreign-flow idle until Monday ~02:00 UTC)
- Escalation lock: bctc-ctg-attachment-fetch-escalation-c026 held (router-verified, expires 2026-06-07T00:06:31Z)
