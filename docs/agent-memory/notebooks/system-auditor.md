---
agent: system-auditor
session_date: 2026-06-06
---

## c033 · 2026-06-06T08:09:33Z
### Audit Run Tier-1 (08:09 UTC 2026-06-06)
- Tier: 1 (env) | Services: 6 checked | Crons: 78+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set — SSOT system-map.json) — All PASS
- mcp-server: Up 10h, restart_count=0, memory=61.58% ✓
- api-gateway: Up 3d ✓ | frontend: Up 10h ✓ | macro-indicators: Up 21h ✓
- mcp-gateway: Up 10d ✓ | pdf-extractor: Up 2d ✓

### Health Endpoints — All PASS
- mcp-server :3000 /health → 200 (toolCount:162 ok) ✓
- api-gateway :4000 /health → 200 (mcp:ok, macro:ok) ✓
- macro-indicators :5004 /health → 200 ✓
- pdf-extractor :5001 /health → 200 (ocr_source_ok:true) ✓

### Cron Health & Circuit Breaker Status
- 78+ scheduled jobs: baseline 97–100% success_rate, all recent fires nominal ✓
- Circuit breaker: all 16 sources [OK] (0 open/half-open) ✓
- EPIPE errors (30m window): 0 ✓

### Market Status
- VN market CLOSED (Saturday 08:09 UTC) — weekend idle by design
- Escalation lock: bctc-ctg-attachment-fetch-escalation-c026 held (router-verified, expires 2026-06-07T00:06:31Z)

## c032 · 2026-06-06T07:38:27Z
### Audit Run Tier-1 (07:38 UTC 2026-06-06)
- Tier: 1 (env) | Services: 6 checked | Crons: 78+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set — SSOT system-map.json) — All PASS
- mcp-server: Up 10h, restart_count=0, memory=66.60% ✓
- api-gateway: Up 3d ✓ | frontend: Up 10h ✓ | macro-indicators: Up 20h ✓
- mcp-gateway: Up 10d ✓ | pdf-extractor: Up 2d ✓

### Health Endpoints — All PASS
- mcp-server :3000 /health → 200 ✓
- api-gateway :4000 /health → 200 ✓
- macro-indicators :5004 /health → 200 ✓
- pdf-extractor :5001 /health → 200 ✓

### Cron Health & Circuit Breaker Status
- 78+ scheduled jobs: baseline 97–100% success_rate, all recent fires nominal ✓
- Circuit breaker: all 16 sources [OK] (0 open/half-open) ✓
- EPIPE errors (30m window): 0 ✓

### Market Status
- VN market CLOSED (Saturday 07:38 UTC) — weekend idle by design
- Escalation lock: bctc-ctg-attachment-fetch-escalation-c026 held (router-verified, expires 2026-06-07T00:06:31Z)

## c031 · 2026-06-06T07:08:15Z
### Audit Run Tier-1 (07:08 UTC 2026-06-06)
- Tier: 1 (env) | Services: 6 checked | Crons: 78+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set — SSOT system-map.json) — All PASS
- mcp-server: Up 9h, restart_count=0, memory=68.26% ✓
- api-gateway: Up 3d ✓ | frontend: Up 9h ✓ | macro-indicators: Up 20h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 10d ✓

### Health Endpoints — All PASS
- mcp-server :3000 /health → 200 (toolCount:162 ok) ✓
- api-gateway :4000 /health → 200 (mcp:ok, macro:ok) ✓
- macro-indicators :5004 /health → 200 ✓
- pdf-extractor :5001 /health → 200 (ocr_source_ok:true) ✓

### Cron Health & Circuit Breaker Status
- 78+ scheduled jobs: baseline 97–100% success_rate, all recent fires nominal ✓
- Circuit breaker: all 16 sources [OK] (0 open/half-open) ✓
- EPIPE errors (30m window): 0 ✓

### Market Status
- VN market CLOSED (Saturday 07:08 UTC) — weekend idle by design
- Escalation lock: bctc-ctg-attachment-fetch-escalation-c026 held (router-verified, expires 2026-06-07T00:06:31Z)
