---
agent_id: system-auditor
session_date: 2026-06-17
audit_tier: 1
last_clean: 2026-06-17T08:44:15Z
---

## c313 · 2026-06-17T08:44:15Z
### Audit Run Tier-1 (08:44–08:45 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (2h fresh rebuild), api-gateway (6d), frontend (15h), macro-indicators (2d), mcp-gateway (6d), pdf-extractor (31h), stock-price (45h), technical-analysis (2d), kinh-dich-service (2d), alert-engine (6d), rag-service (11m), news-fetch (6d) ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-25..A-28 inter-service: stock-price, technical-analysis, alert-engine, pdf-extractor all responding ✓
- A-30 memory: MemPerc=20.40% < 85% ✓
- A-32 disk: 40% < 85% ✓
- A-31 EPIPE check: 0 errors < 2 ✓
- WAL sizes: market.db=4MB, coordination.db=0MB (both <50MB) ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T08:44:23Z ===

--- docker ps -a (13 containers, all healthy) ---
mcp-server: Up 2 hours (healthy)
frontend: Up 15 hours (healthy)
pdf-extractor: Up 31 hours (healthy)
stock-price: Up 45 hours (healthy)
technical-analysis: Up 2 days (healthy)
macro-indicators: Up 2 days (healthy)
kinh-dich-service: Up 2 days (healthy)
api-gateway: Up 6 days (healthy)
rag-service: Up 11 minutes (healthy)
news-fetch: Up 6 days (healthy)
alert-engine: Up 6 days (healthy)
headroom-proxy: Up 4 days
mcp-gateway: Up 6 days (healthy)

--- health endpoints (5/5 OK) ---
mcp-server:3000/health ✓
api-gateway:4000/health ✓
macro-indicators:5004/health ✓
pdf-extractor:5001/health ✓
frontend:3001/ ✓

--- inter-service connectivity (all OK) ---
stock-price:5000 ✓
technical-analysis:5003 ✓
alert-engine:5006 ✓
pdf-extractor:5001 ✓

--- memory/disk ---
mcp-server: MemPerc=20.40% CPUPerc=2.17%
disk: 40% used (21GB avail)

--- WAL sizes ---
market.db: 4 MB
coordination.db: 0 MB

--- EPIPE errors (30m window) ---
Count: 0
```

## c312 · 2026-06-17T08:14:14Z
### Audit Run Tier-1 (08:14–08:15 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (1h fresh rebuild), api-gateway (6d), frontend (15h), macro-indicators (2d), mcp-gateway (6d), pdf-extractor (31h), stock-price (45h), technical-analysis (2d), kinh-dich-service (2d), alert-engine (6d), rag-service (2h), news-fetch (6d) ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-22..A-24 tooling: pdftoppm, tesseract, vie-lang all present ✓
- A-25..A-28 inter-service: stock-price, technical-analysis, alert-engine, pdf-extractor all responding ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=17.56% < 85% ✓
- A-32 disk: 39% < 85% ✓
- A-31 EPIPE check: 0 errors < 2 ✓

## c308 · 2026-06-17T06:39:01Z
### Audit Run Tier-2 (06:30–06:41 UTC 2026-06-17)
- Tier: 2 | Sources: 31 checked | Cron jobs: 141 verified | VPS routes: 4/4 probed
- Anomalies: 3 new (0 critical, 3 warn, 0 info) | Dedup: 0 skipped
- Status: DEGRADED
- Cron checks A-29: all pass ✓
- Per-source freshness: 28 pass, 3 fail (WARN) — bctc-push stale 12.6h, vn-foreign-flow unhealthy, 8 pending BCTC rows >72h
- DB spot checks C-06, C-07: both pass ✓
- VPS proxy B-06/B-07: 3 ok, 1 STALE (bctc) ⚠
- Signals: 3 emitted (B-06, B-13, B-07) to BUG channel
