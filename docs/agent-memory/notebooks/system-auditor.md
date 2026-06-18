# System Auditor Notebook

## c349 · 2026-06-18T00:45:14Z
### Audit Run Tier-1 (00:45 UTC 2026-06-18)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-21 restart count: 0 ✓
- A-30 memory: 16.11% < 85% ✓
- A-32 disk: 43% < 85% ✓
- MCP system: status=ok, toolCount=165, uptime=5242s ✓

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
- **C-08 orphaned alerts: 63 CRITICAL** (expected 0) — dup-symptom of FIX-ALERT-ORPHAN-CORRELATION (REVIEW), no re-mint per sau-c08-202606180038
- C-09 macro indicators: 3 ✓ (≥3, TradingEconomics VPS active)
- C-10 PDF failed 24h: 0 ✓ (≤2)
- C-12 DB integrity: ok ✓
- C-13 WAL: 4.1MB ✓ (<50MB)
- C-16 stale pending BCTC: 0 ✓ (0 actionable pending >72h)

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
