---
agent: system-auditor
session_date: 2026-06-06
---

## c024 · 2026-06-06T04:08:24Z
### Audit Run Tier-1 (04:08 UTC 2026-06-06)
- Tier: 1 (env) | Services: 6 checked | Crons: 95+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set) — All PASS
- mcp-server: Up 6h, restart_count=0, memory=54.36% ✓
- api-gateway: Up 3d ✓ | frontend: Up 6h ✓ | macro-indicators: Up 17h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 10d ✓

### Health Endpoints — All PASS
- mcp-server :3000, api-gateway :4000, macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓ | frontend :3001 → 404 (UI-only) ✓

### Cron Health & Circuit Breaker
- 95+ jobs: 97–100% success_rate baseline | all recent fires nominal ✓
- Circuit breaker: all 16 sources [OK] (0 open/half-open) ✓

### Market Status
- VN market CLOSED (Saturday 04:08 UTC) — off-hours state expected
- market-watcher 04:04 cycle: 0 signals emitted, 1 suppressed (VNH dup)

## c023 · 2026-06-06T03:39:17Z
### Audit Run Tier-1 (03:39 UTC 2026-06-06)
- Tier: 1 (env) | Services: 6 checked | Crons: 95+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set) — All PASS
- mcp-server: Up 5.9h, restart_count=0, memory=46.43% ✓
- api-gateway: Up 3d ✓ | frontend: Up 6h ✓ | macro-indicators: Up 16h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 9d ✓

### Health Endpoints — All PASS
- mcp-server :3000, api-gateway :4000, macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓ | frontend :3001 → 404 (UI-only) ✓

### Cron Health & Circuit Breaker
- 95+ jobs: 97–100% success_rate baseline | all recent fires nominal ✓
- Circuit breaker: all 16 sources [OK] (0 open/half-open) ✓

### Notes
- Clean pass. VN market CLOSED (Saturday 03:39 UTC). Weekend idle state expected.

## c022 · 2026-06-06T03:08:04Z
### Audit Run Tier-1 (03:08 UTC 2026-06-06)
- Tier: 1 (env) | Services checked: 6 (intended runtime) | Crons polled: 95+
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set) — All PASS
- mcp-server: Up 5h 23m, restart_count=0 ✓, memory=42.46% ✓
- api-gateway: Up 3d ✓ | frontend: Up 5h ✓ | macro-indicators: Up 16h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 9d (healthy) ✓

### Health Endpoints — All PASS
- mcp-server :3000 → 200 ✓ | api-gateway :4000 → 200 ✓ | macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓ | mcp-gateway → healthy ✓
- frontend :3001 → 404 (UI-only, INFO-grey) ✓

### Cron Health (95+ jobs) — All PASS
- All jobs firing successfully; 7-day baseline: 97–100%
- intelligenceCycleJob: 99.3% | bctcQueueEnricherJob: 97.4%

### Circuit Breaker Status
- All 16 sources [OK] (0 open, 0 half-open) ✓

### Notes
- Clean pass. All 6 services UP + healthy. VN market CLOSED (Saturday 03:08 UTC).
