---
agent: system-auditor
session_date: 2026-06-06
---

## c019 · 2026-06-06T02:08Z
### Audit Run Tier-1 (02:08–02:09 UTC 2026-06-06)
- Tier: 1 (env) | Services checked: 6 (intended runtime) | Crons polled: 95+
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set) — All PASS
- mcp-server: Up 4h 23m, restart_count=0 ✓, memory=42.29% ✓
- api-gateway: Up 3d ✓ | frontend: Up 4h ✓ | macro-indicators: Up 15h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 9d (bound :4040, healthy) ✓

### Health Endpoints — All PASS (frontend UI-only 404)
- mcp-server :3000 → 200 ✓ | api-gateway :4000 → 200 ✓ | macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓ | mcp-gateway :4040 → healthy ✓
- frontend :3001 → 404 (UI-only, INFO-grey) ✓

### Cron Health (95+ jobs) — All PASS
- ~100% firing; 7-day baseline success_rate: 97%+
- intelligenceCycleJob: 99.3% (566 runs) | bctcQueueEnricherJob: 97.4% (503 runs)

### Circuit Breaker Status
- All 16 sources [OK] (0 open, 0 half-open circuits) ✓

### Notes
- Tier-1 pass clean. All 6 intended-runtime services UP + healthy. No anomalies detected.
- mcp-gateway confirmed healthy on :4040 (discrepancy in external_port mapping noted but functional).

## c018 · 2026-06-06T01:39Z
### Audit Run Tier-1 (01:38–01:39 UTC 2026-06-06)
- Tier: 1 (env) | Services checked: 6 (intended runtime) | Crons polled: 95+
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set) — All PASS
- mcp-server: Up 4h, restart_count=0 ✓, memory=35.64% ✓
- api-gateway: Up 3d ✓ | frontend: Up 4h ✓ | macro-indicators: Up 14h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 9d ✓

### Health Endpoints — All PASS (frontend UI-only 404)
- mcp-server :3000 → 200 ✓ | api-gateway :4000 → 200 ✓ | macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓ | mcp-gateway :4040 → healthy ✓
- frontend :3001 → 404 (UI-only, INFO-grey) ✓

### Cron Health (95+ jobs) — All PASS
- ~100% firing; 7-day baseline success_rate: 97%+
- intelligenceCycleJob: 99.1% (567 runs) | bctcQueueEnricherJob: 97.4% (502 runs)

### Circuit Breaker Status
- All 16 sources [OK] (0 open, 0 half-open circuits) ✓

### Notes
- Tier-1 pass clean. All 6 intended-runtime services UP + healthy. No anomalies.
- VN market closed (off 02:00–08:59 UTC M-F window). Crons 100% nominal.

## c017 · 2026-06-06T01:08Z
### Audit Run Tier-3 (01:08–01:12 UTC 2026-06-06)
- Tier: 3 | Services: 6 (intended runtime) | Tooling: 3 checks | DB checks: via MCP tools
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped | 0 improvement proposals
- Status: HEALTHY

### Container Status (Intended Runtime Set) — All PASS
- mcp-server: Up 3h 12m, restart_count=0 ✓, memory=33.83% ✓
- api-gateway: Up 3d ✓ | frontend: Up 3h ✓ | macro-indicators: Up 14h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 9d ✓

### Tier-3 Deep Checks — All PASS
**Tooling (A-22 to A-24):** pdftoppm ✓, tesseract ✓, vie language ✓
**EPIPE (A-31):** 1 error last 30m ✓ | **BCTC PDF (B-08):** 18 files ✓
**System:** Circuits 16/16 OK ✓, WAL 10.70 MB ✓, Errors 0 ✓
**Crons:** 97%+ success rate; intelligenceCycleJob 99.1% (567 runs) ✓

### Notes
- Tier-3 pass clean. All 6 runtime services UP + healthy. No DB corruption.
- Off-market staleness expected & confirmed. No new anomalies, no improvement proposals.
