## c345 · 2026-06-17T23:15:10Z
### Audit Run Tier-1 (23:15 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: mcp-server ✓
- A-22..A-24 tooling: pdftoppm ✓ tesseract ✓ vie-lang ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-21 restart count: 0 ✓
- A-30 memory: 30.77% < 85% ✓
- A-32 disk: 44% < 85% ✓
- A-31 EPIPE: 0 in 30m ✓
- DB spot-checks: C-01 (1055 tickers ✓) C-06 (0 msgs ✓) C-07 (148 signals ✓) C-12 (integrity ok ✓) C-13 (WAL 4.1MB ✓)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T23:14:09Z ===

--- docker ps -a (13 containers) ---
All services UP with (healthy) status. Key runtime services: mcp-server 3h, frontend 30h, pdf-extractor 46h, stock-price 2d, technical-analysis 2d, macro-indicators 2d, kinh-dich-service 3d, api-gateway 6d, rag-service 11m, news-fetch 7d, alert-engine 7d, headroom-proxy 5d, mcp-gateway 7d.

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=30.77% MemUsage=630MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    44%    393k  161M    0%   /

=== PROBE DONE ===
```

## c344 · 2026-06-17T22:45:29Z
### Audit Run Tier-1 (22:45 UTC 2026-06-17)
- Tier: 1 | Services: 11 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY

## c343 · 2026-06-18T22:23:45Z
### Audit Run Tier-1 (22:23–22:24 UTC 2026-06-18)
- Tier: 1 | Services: 11 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- DB checks: C-01 (1055 tickers ≥ 25 ✓) C-06 (0 msgs in 3h ✓) C-07 (147 signals in 24h ✓) C-12 (integrity ok ✓)
