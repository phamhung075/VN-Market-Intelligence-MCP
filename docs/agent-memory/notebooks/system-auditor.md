

## c290 · 2026-06-09T04:35:18Z
### Audit Run Tier-1 (04:35 UTC 2026-06-09 → Tuesday morning)
- Tier: 1 | Services: 6 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-19 container UP: mcp-server (11h), api-gateway (34h), macro-indicators (29h), pdf-extractor (20h), frontend (34h), mcp-gateway (34h) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: MemPerc=69.98% < 85% ✓ (recovered from 89.6% at 04:05)
- A-32 disk: 39% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-09T04:35:07Z ===
--- docker ps -a ---
NAMES                                           STATUS                  IMAGE
vn-market-intelligence-mcp-mcp-server-1         Up 11 hours (healthy)   vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-rag-service-1        Up 14 hours (healthy)   vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-news-fetch-1         Up 15 hours (healthy)   vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-pdf-extractor-1      Up 20 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-macro-indicators-1   Up 29 hours (healthy)   vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-frontend-1           Up 34 hours (healthy)   vn-market-intelligence-mcp-frontend
headroom-proxy                                  Up 24 hours             headroom-proxy:local
vn-market-intelligence-mcp-api-gateway-1        Up 34 hours (healthy)   vn-market-intelligence-mcp-api-gateway
mcp-gateway                                     Up 34 hours (healthy)   mcpservergatway-gateway
--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)
--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2
--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=69.98% MemUsage=1.4GiB / 2GiB
--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    22Gi    39%    393k  227M    0%   /
=== PROBE DONE ===
```

## c289 · 2026-06-09T04:05:06Z
### Audit Run Tier-1 (04:05 UTC 2026-06-09 → Tuesday morning)
- Tier: 1 | Services: 6 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (A-30 WARN dedup-skipped, filed at 03:35:42Z) | Dedup: 1 skipped
- Status: HEALTHY
- A-01..A-19 container UP: mcp-server (11h), api-gateway (33h), macro-indicators (28h), pdf-extractor (20h), frontend (33h), mcp-gateway (33h) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: MemPerc=89.60% ≥ 85% (WARN, seen 03:35:42Z, within 7d dedup) ⚠
- A-32 disk: 39% < 85% ✓

## c288 · 2026-06-09T03:37:23Z
### Audit Run Tier-1 (03:35–03:37 UTC 2026-06-09 → Tuesday early morning)
- Tier: 1 | Services: 6 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 1 new (A-30 WARN memory pressure; C-CRITICAL orch-state.json clobbered)
- Status: DEGRADED
- A-01..A-19 container UP: mcp-server (10h), api-gateway (33h), macro-indicators (28h), pdf-extractor (19h), frontend (33h), mcp-gateway (33h) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: MemPerc=90.24% ≥ 85% ✗ WARN — mcp-server OOM risk, capped at 2GB
- A-32 disk: 39% < 85% ✓
- CRITICAL FINDING: docs/data/orch/orch-state.json clobbered to 1 byte (jq-empty-guard bug) — FILE RESTORED FROM git 7643dbd8, signal row re-added

## c287 · 2026-06-09T03:05:01Z
### Audit Run Tier-1 (03:05 UTC 2026-06-09 → Tuesday early morning)
- Tier: 1 | Services: 6 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-19 container UP: mcp-server (10h), api-gateway (32h), macro-indicators (27h), pdf-extractor (19h), frontend (32h), mcp-gateway (32h) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: 72.72% < 85% ✓
- A-32 disk: 37% < 85% ✓
