## c348 · 2026-06-18T00:38:52Z
### Audit Run Tier-3 (00:38 UTC 2026-06-18)
- Tier: 3 | Services: 12 checked | DB checks: C-01..C-16 | Inter-service: A-22..A-28
- Anomalies: 1 CRITICAL (C-08 orphaned alerts) | 0 WARN | 0 INFO | Dedup: 0 skipped
- Status: DEGRADED
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: all 5 PASS ✓
- A-22..A-24 tooling: pdftoppm ✓ tesseract ✓ vie-lang ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-31 EPIPE: 0 in 30m ✓
- B-08 BCTC PDFs: 80 present ✓
- C-01 OHLCV tickers: 953 ✓ (≥25)
- C-02 OHLCV rows: 953 ✓ (>0)
- C-05 SSC URLs: 0 ✓ (must be 0)
- C-06 messages 3h: 0 ✓ (pre-market, expected)
- C-07 signals 24h: 103 ✓ (>0)
- **C-08 orphaned alerts: 63 CRITICAL** (expected 0) — alerts without corresponding agent_signals 2026-06-17T02:00-02:45Z
- C-09 macro indicators: 3 ✓ (≥3, TradingEconomics VPS active)
- C-10 PDF failed 24h: 0 ✓ (≤2)
- C-12 DB integrity: ok ✓
- C-13 WAL: 4.1MB ✓ (<50MB)
- C-16 stale pending BCTC: 0 ✓ (0 actionable pending >72h)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-18T00:37:14Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1           Up About an hour (healthy)
vn-market-intelligence-mcp-frontend-1             Up 31 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 47 hours (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)
headroom-proxy                                    Up 5 days
mcp-gateway                                       Up 7 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- memory ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=15.54% MemUsage=318.3MiB / 2GiB

--- disk df ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    17Gi    44%

=== PROBE DONE ===
```

## c347 · 2026-06-18T00:21:44Z
### Audit Run Tier-1 (00:21 UTC 2026-06-18)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓
- A-21 restart count: 0 ✓
- A-30 memory: 13.88% < 85% ✓
- A-32 disk: 43% < 85% ✓
- MCP system: status=ok, toolCount=165, uptime=3869s ✓
- NOTE: dev-mcp-server recent changes (BCTC work) expected; container churn < 2h not flagged

## c346 · 2026-06-17T23:44:37Z
### Audit Run Tier-1 (23:44 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
