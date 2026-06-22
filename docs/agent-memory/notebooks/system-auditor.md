# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c296 · 2026-06-22T02:44:01Z
### Audit Run Tier-1 (02:44 UTC 2026-06-22, Monday 09:44 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 09:44 Monday, market OPEN). All 12 host_runtime_set UP+healthy. mcp-server UP 46m/healthy (restart=0, mem 18.21% 372.9MiB/2GiB). rag-service UP healthy (restart=96, mem 84.72% 650.7MiB/768MiB, tracked FU-RAG-DEPLOY-MEMORY). A-20 pdf-extractor multi-probe 3/3 PASS. Disk 35% (26Gi free). All A-01..A-32 checks PASS.

## c295 · 2026-06-22T02:32:20Z
### Audit Run Tier-2 (02:32 UTC 2026-06-22, Monday 09:32 VN 2026-06-22)
- Tier: 2 | Sources checked: 12 | Cron gaps: 0 | Freshness: ALL PASS
- Anomalies: 0 NEW | Dedup-skipped: 0
- Status: CLEAN
- Context: Market-hours window (09:32 VN Monday, market OPEN). All sources within SLA.
- Freshness: ssc-iboard ✓ | foreign-flow (2802 events/30min) ✓ | bctc (SLA OUT-window, 168h) ✓ | sbv-vps ✓ | news ✓ | VPS proxy ✓
- DB: market_messages=2 (3h) ✓ | agent_signals=83 (24h) ✓ | BCTC SSC URLs=0 ✓ | stale pending=0 ✓ | cron gaps=0 ✓

## c294 · 2026-06-22T02:13:49Z
### Audit Run Tier-1 (02:13 UTC 2026-06-22, Monday 09:13 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart ≤94, memory/disk healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 09:13 Monday, market OPEN since 09:00). All 12 host_runtime_set UP+healthy. mcp-server UP 17m/healthy (restart=0, mem 18.58% 380.6MiB/2GiB). rag-service UP 30m/healthy (restart_cumulative=94, mem 83.96% 644.8MiB/768MiB, tracked FU-RAG-DEPLOY-MEMORY). Disk 35% (26Gi free). All A-01..A-32 checks PASS.

## c293 · 2026-06-22T01:44:26Z
### Audit Run Tier-1 (01:44 UTC 2026-06-22, Monday 08:44 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart ≤94, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 08:44 Monday, market opens 09:00). All 12 host_runtime_set UP+healthy. mcp-server UP 4h/healthy (restart=0, mem 30.05% 615.3MiB/2GiB). rag-service UP 16s/healthy (restart=94, steady ceiling, tracked FU-RAG-DEPLOY-MEMORY). Disk 37% / (23Gi free). A-20 pdf-extractor not re-probed in basic Tier-1 (no MCP tools local). All A-01..A-32 basic checks PASS.

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
