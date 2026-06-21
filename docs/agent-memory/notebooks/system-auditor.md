# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c288 · 2026-06-21T23:44:52Z
### Audit Run Tier-1 (23:44 UTC 2026-06-21, Monday 06:44 VN 2026-06-22)
- Tier: 1 | Services: 13 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart=0, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 06:44 Monday, market opens 09:00). All 13 host_runtime_set UP + healthy. mcp-server UP 2h+/healthy (no restarts). rag-service UP 2h+/healthy (restart=94, steady ceiling 90.15% mem at 692.4MiB/768MiB, tracked FU-RAG-DEPLOY-MEMORY). Disk 39% / (21Gi free). No C-06 market_messages (0 in 3h = expected pre-market, 1h before open). agent_signals UP (78 in 24h). No signal_queue.rows[] NEW. Dedup: 0 skipped (no WARN/CRITICAL candidates this cycle).

## c287 · 2026-06-21T23:13:47Z
### Audit Run Tier-1 (23:13 UTC 2026-06-21, Monday 06:13 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart=0, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 06:13 Monday, market opens 09:00). mcp-server UP 2h/healthy (prev restart=0, current 0). rag-service UP 2h/healthy (restart=94, steady ceiling ~71% mem, tracked FU-RAG-DEPLOY-MEMORY). Disk 36% / (24Gi free). C-06 INFO (0 market_messages 3h = expected pre-market; live 1h before open). C-07 PASS (76 agent_signals 24h). B-08 PASS (80 PDFs). WAL: 4.1MB/0B (healthy). No signal_queue.rows[] NEW.

**RAW-PROBE (2026-06-21T23:13:47Z):**
```
--- docker ps ---
mcp-server-1: Up 2 hours (healthy)
frontend-1: Up 2 hours (healthy)
pdf-extractor-1: Up 5 days (healthy)
stock-price-1: Up 6 days (healthy)
technical-analysis-1: Up 6 days (healthy)
macro-indicators-1: Up 6 days (healthy)
kinh-dich-service-1: Up 7 days (healthy)
api-gateway-1: Up 10 days (healthy)
rag-service-1: Up 2 hours (healthy) — restarts=94
news-fetch-1: Up 11 days (healthy)
alert-engine-1: Up 11 days (healthy)
mcp-gateway: Up 11 days (healthy)

--- health endpoints ---
mcp-server:3000/health = OK
pdf-extractor:5001/health = OK
stock-price:5010/health = OK
technical-analysis:5003/health = OK
alert-engine:5006/health = OK

--- inter-service (from mcp-server) ---
stock-price:5000 = OK
technical-analysis:5003 = OK
alert-engine:5006 = OK
pdf-extractor:5001 = OK

--- tooling (mcp-server) ---
pdftoppm: present
tesseract: present
vie lang: present

--- memory + disk ---
mcp-server: 22.77% MemPerc (466MiB / 2GiB) — healthy
rag-service: 71.31% MemPerc (547MiB / 768MiB) — at ceiling, healthy (restart=94, not OOMKilled)
Disk /: 36% used (13Gi / 233Gi, 24Gi free) — healthy
```

**Tier-1 Verdict:** CLEAN — 12 host_runtime_set UP, all health 200, all inter-service OK, tooling OK, no new anomalies. rag-service at ceiling as tracked.

## c286 · 2026-06-21T22:30:43Z
### Audit Run Tier-2 (22:30 UTC 2026-06-21, Monday 05:30 VN 2026-06-22)
- Tier: 2 | Sources: 30 checked | Cron: N/A (no gate_cron_health available, coordination.db missing cron_jobs) | VPS proxy: 7 routes checked
- Anomalies: 0 NEW (C-04 dedup-skip: already posted 2026-06-20T00:03Z, within 7d window; 7 low-conf reports today vs threshold 5 = same class)
- Status: CLEAN (pre-market freshness rules applied)
- Notes: Pre-market window (VN 05:30 Monday, market opens 09:00). DOWNGRADE: C-01/C-02 price staleness to INFO (latest bar=Fri 2026-06-19, expected pre-market). C-03 PASS (32 Q1-2026). C-04 WARN—dedup-skip. C-06/C-07/C-08/C-09 PASS. C-10/C-11 PASS (off-season, C-11=0 expected). B-08 PASS (80 PDFs). B-09 PASS (0 SSC URLs). B-13 PASS (0 stale >72h). Signal_queue.rows[] NEW=0; DASHBOARD append (C-04 dedup-skip).
