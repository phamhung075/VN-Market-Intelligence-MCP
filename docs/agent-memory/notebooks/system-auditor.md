# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c293 · 2026-06-22T01:44:26Z
### Audit Run Tier-1 (01:44 UTC 2026-06-22, Monday 08:44 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart ≤94, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 08:44 Monday, market opens 09:00). All 12 host_runtime_set UP+healthy. mcp-server UP 4h/healthy (restart=0, mem 30.05% 615.3MiB/2GiB). rag-service UP 16s/healthy (restart=94, steady ceiling, tracked FU-RAG-DEPLOY-MEMORY). Disk 37% / (23Gi free). A-20 pdf-extractor not re-probed in basic Tier-1 (no MCP tools local). All A-01..A-32 basic checks PASS.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-22T01:43:24Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 4 hours (healthy)      vn-market-intelligence-mcp-frontend             4 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)      vn-market-intelligence-mcp-mcp-server           4 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)      vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)       vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)       vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)      vn-market-intelligence-mcp-api-gateway          10 days ago
vn-market-intelligence-mcp-rag-service-1          Up 16 seconds (healthy)   vn-market-intelligence-mcp-rag-service          11 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 11 days (healthy)      vn-market-intelligence-mcp-news-fetch           11 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 11 days (healthy)      vn-market-intelligence-mcp-alert-engine         11 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=30.05% MemUsage=615.3MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    37%    393k  243M    0%   /
```

## c292 · 2026-06-22T01:13:22Z
### Audit Run Tier-1 (01:13 UTC 2026-06-22, Monday 08:13 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart ≤94, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 08:13 Monday, market opens 09:00). All 12 host_runtime_set UP + healthy. mcp-server UP 4h/healthy (restart=0, mem 28.28% 579.2MiB/2GiB). rag-service UP 4h/healthy (restart=94, tracked FU-RAG-DEPLOY-MEMORY). Disk 35% / (25Gi free). All A-01..A-32 checks PASS. No signal_queue.rows[] NEW.

## c291 · 2026-06-22T01:07:39Z
### Audit Run Tier-3 (01:07 UTC 2026-06-22, Monday 08:07 VN 2026-06-22)
- Tier: 3 | Services: 12 checked | DB checks: 16 (C-01..C-16) | Tooling: 3 (A-22..A-24)
- Anomalies: 0 NEW (all checks PASS; C-01/C-02=0 expected pre-market 08:07 VN, opens 09:00)
- Status: CLEAN
- Dedup-skipped: 4 (expired_signals 455, unresolved_alerts 205, held_lock esc-datacov, B-13 stale_pending)
- Notes: Pre-market audit (VN 08:07 Monday). All 12 host_runtime_set UP+healthy. Tooling: pdftoppm/tesseract/vie present; inter-service connectivity 200. DB: market.db+pdf_extractor.db PRAGMA ok; WAL healthy. OHLCV last=2026-06-19. Market_messages=1 (3h), agent_signals=74 (24h). Financial_reports Q1: 32 codes. Macro_indicators VN: 3 cols (TradingEconomics). BCTC: 0 SSC-URLs, 0 stale pending. PDF: 80 present, 0 failed 24h. No new signals.

## c290 · 2026-06-22T01:04:28Z
### Audit Run Tier-1 (01:04 UTC 2026-06-22, Monday 08:04 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart ≤94, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 08:04 Monday, market opens 09:00). All 12 host_runtime_set UP + healthy. mcp-server UP 4h/healthy (restart=0, mem 32.44% 664MiB/2GiB). rag-service UP 4h/healthy (restart=94, tracked FU-RAG-DEPLOY-MEMORY). Disk 35% / (25Gi free). A-20 pdf-extractor 3/3 probes passed (event-loop OK). All A-01..A-32 checks PASS. No signal_queue.rows[] NEW.

## c289 · 2026-06-22T00:14:28Z
### Audit Run Tier-1 (00:14 UTC 2026-06-22, Monday 07:14 VN 2026-06-22)
- Tier: 1 | Services: 13 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart ≤94, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 07:14 Monday, market opens 09:00). All 13 host_runtime_set UP + healthy. mcp-server UP 3h/healthy (restart=0). rag-service UP 3h/healthy (restart=94, tracked FU-RAG-DEPLOY-MEMORY). Disk 36% / (24Gi free). A-20 pdf-extractor 3/3 probes passed (event-loop OK). All A-01..A-32 checks PASS. No signal_queue.rows[] NEW.

## c288 · 2026-06-21T23:44:52Z
### Audit Run Tier-1 (23:44 UTC 2026-06-21, Monday 06:44 VN 2026-06-22)
- Tier: 1 | Services: 13 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart=0, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 06:44 Monday, market opens 09:00). All 13 host_runtime_set UP + healthy. mcp-server UP 2h+/healthy (no restarts). rag-service UP 2h+/healthy (restart=94, steady ceiling 90.15% mem at 692.4MiB/768MiB, tracked FU-RAG-DEPLOY-MEMORY). Disk 39% / (21Gi free). No C-06 market_messages (0 in 3h = expected pre-market, 1h before open). agent_signals UP (78 in 24h). No signal_queue.rows[] NEW.
