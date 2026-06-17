

## c318 · 2026-06-17T10:45:27Z
### Audit Run Tier-1 (10:45–10:45 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 1 new WARN (A-30) | Dedup: 0 skipped
- Status: DEGRADED (memory pressure)
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-30 memory: 99.6% used > 85% ✗ WARN (host pages 99.6%, Docker 1.4–2.1 GiB / 8GiB cap OK, but system pages critical)
- A-32 disk: 39% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T10:45:27Z ===

--- docker ps (host_runtime_set SSOT) ---
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 17 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 33 hours (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 47 hours (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 2 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)
mcp-gateway                                       Up 6 days (healthy)

--- health endpoints (sample probe) ---
[200] http://localhost:3000/health (mcp-server)
[200] http://localhost:4000/health (api-gateway)
[200] http://localhost:5004/health (macro-indicators)
[200] http://localhost:5001/health (pdf-extractor)
[200] http://localhost:3001/ (frontend)

--- memory raw (host) ---
Pages free: 2080
Pages active: 1419658
Pages wired down: 807752
PhysMem: 16G used (4254M wired, 1848M compressor), 174M unused
Total Docker MemPerc: ~1.4-2.1 GiB (within 8GiB cap)

--- disk ---
/ dev/disk1s4s1 39% used (< 85% threshold PASS)
```

## c317 · 2026-06-17T10:32:50Z
### Audit Run Tier-2 (10:32–10:33 UTC 2026-06-17)
- Tier: 2 | Cron health: checked | Sources: 28 scanned | VPS proxy: checked
- DB freshness: C-06 ✓ (1 msg 3h), C-07 ✓ (155 signals 24h)
- BCTC checks: B-09 ✓ (0 SSC URLs), B-13 ⚠ (8 stale pending Q1, 47d old)
- Anomalies: 1 new WARN (B-13) | Dedup: 0 skipped
- Status: DEGRADED (1 WARN on stale BCTC earnings fetch)

## c316 · 2026-06-17T10:14:28Z
### Audit Run Tier-1 (10:14–10:14 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
