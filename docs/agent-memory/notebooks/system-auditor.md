---
agent: system-auditor
session_date: 2026-06-06
---

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

## c026 · 2026-06-06T05:09:20Z
### Audit Run Tier-1 (05:09 UTC 2026-06-06)
- Tier: 1 (env) | Services: 6 checked | Crons: 80+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set) — All PASS
- mcp-server: Up 7h 23m, restart_count=0, memory=57.12% ✓
- api-gateway: Up 3d ✓ | frontend: Up 7h ✓ | macro-indicators: Up 18h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 10d ✓

### Health Endpoints — All PASS
- mcp-server :3000, api-gateway :4000, macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓ | frontend :3001 → 404 (UI-only) ✓

### Cron Health & Circuit Breaker
- 80+ jobs: 97–100% success_rate baseline | recent fires nominal ✓
- Circuit breaker: all 16 sources [OK] (0 open/half-open) ✓

### Market Status
- VN market CLOSED (Saturday 05:09 UTC) — weekend idle expected

## c025 · 2026-06-06T04:39:08Z
### Audit Run Tier-1 (04:39 UTC 2026-06-06)
- Tier: 1 (env) | Services: 6 checked | Crons: 95+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set) — All PASS
- mcp-server: Up 7h, restart_count=0, memory=56.26% ✓
- api-gateway: Up 3d ✓ | frontend: Up 7h ✓ | macro-indicators: Up 17h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 10d ✓

### Health Endpoints — All PASS
- mcp-server :3000, api-gateway :4000, macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓ | frontend :3001 → 404 (UI-only) ✓

### Cron Health & Circuit Breaker
- 95+ jobs: 97–100% success_rate baseline | all recent fires nominal ✓
- Circuit breaker: all 16 sources [OK] (0 open/half-open) ✓

### Market Status
- VN market CLOSED (Saturday 04:39 UTC) — off-hours state expected
- Escalation lock: bctc-ctg-attachment-fetch-escalation-c026 held (claimed 06-06T00:06Z ttl24h) — watch point: 09:00Z refine-bctc-slot-1 first fire
