---
agent: system-auditor
last_run_tier: 1
last_run_date: 2026-06-09T01:35:57Z
---

## c284 · 2026-06-09T01:35:57Z
### Audit Run Tier-1 (01:35 UTC 2026-06-09, Tuesday)
- Tier: 1 | Services: 6 checked | Health endpoints: 5 tested
- Anomalies: 0 new | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-18 runtime: All 6 host_runtime_set services UP (mcp-server, api-gateway, frontend, macro-indicators, pdf-extractor, mcp-gateway)
- A-04..A-18 health: mcp-server ✓, api-gateway ✓, macro-indicators ✓, pdf-extractor ✓, frontend ✓
- A-21 restart count: mcp-server RestartCount=2 (≤2 PASS)
- A-30 memory: mcp-server MemPerc=67.83% (<85% PASS)
- A-32 disk: /dev/disk1s4s1 36% used (healthy PASS)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-09T01:35:32Z ===
--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1         Up 8 hours (healthy)
vn-market-intelligence-mcp-rag-service-1        Up 11 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1         Up 12 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1      Up 17 hours (healthy)
vn-market-intelligence-mcp-macro-indicators-1   Up 26 hours (healthy)
vn-market-intelligence-mcp-frontend-1           Up 31 hours (healthy)
vn-market-intelligence-mcp-api-gateway-1        Up 31 hours (healthy)
mcp-gateway                                     Up 31 hours (healthy)
--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)
--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2
--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=67.83% MemUsage=1.357GiB / 2GiB
--- disk df -h / ---
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%
```

## c283 · 2026-06-09T00:33:17Z
### Audit Run Tier-3 (00:30 UTC 2026-06-09 → 2026-06-09 07:30 VN, Tuesday)
- Tier: 3 | Services: 6 checked | DB checks: C-01..C-16 + tooling A-22..A-31
- Anomalies: 4 new (1 CRITICAL, 3 WARN) | Dedup: 0 skipped
- Status: DEGRADED (C-09 macro-refresh failure critical)
- A-22/23/24 tooling: pdftoppm ✓, tesseract ✓, vie lang ✓
- A-31 EPIPE: 0 crashes (≤2 pass)
- B-08 BCTC PDFs: 60 present (>0 pass)
- C-01/C-02 OHLCV: 1591 tickers (≥25 pass), 1591 rows (>0 pass)
- C-03 Q1 2026 actions: 27 (≥26 pass)
- C-04 low-confidence 7d: 7 (>5) — WARN
- C-06 market_messages 3h: 0 (expects >0) — WARN
- C-08 orphaned alerts: 41 (expects 0) — WARN
- C-09 macro_indicators: 1 (expects ≥3) — CRITICAL
