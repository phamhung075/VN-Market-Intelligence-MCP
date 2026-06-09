

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

### RAW-PROBE:
\`\`\`
=== AUDITOR PROBE 2026-06-09T03:35:23Z ===
--- docker ps -a ---
NAMES                                           STATUS                  
vn-market-intelligence-mcp-mcp-server-1         Up 10 hours (healthy)   
vn-market-intelligence-mcp-api-gateway-1        Up 33 hours (healthy)   
vn-market-intelligence-mcp-macro-indicators-1   Up 28 hours (healthy)   
vn-market-intelligence-mcp-pdf-extractor-1      Up 19 hours (healthy)   
vn-market-intelligence-mcp-frontend-1           Up 33 hours (healthy)   
mcp-gateway                                     Up 33 hours (healthy)   
--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)
--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2
--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=90.24% MemUsage=1.805GiB / 2GiB
--- disk df -h / ---
/dev/disk1s4s1   233Gi    13Gi    22Gi    39%
\`\`\`

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

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-09T03:05:09Z ===
--- docker ps -a ---
mcp-server Up 10h / api-gateway Up 32h / macro-indicators Up 27h / pdf-extractor Up 19h
frontend Up 32h / mcp-gateway Up 32h (all healthy)
--- health endpoints ---
mcp-server:3000/health OK (200) / api-gateway:4000/health OK (200)
macro-indicators:5004/health OK (200) / pdf-extractor:5001/health OK (200)
frontend:3001/ OK (200)
--- restart count ---
RestartCount=2 (mcp-server)
--- memory pressure ---
MemPerc=72.72% (mcp-server)
--- disk df -h / ---
37% used, 23Gi avail
```

---

## c286 · 2026-06-09T02:36:27Z
### Audit Run Tier-1 (02:36 UTC 2026-06-09 → Tuesday early morning)
- Tier: 1 | Services: 6 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-19 container UP: mcp-server (9h), api-gateway (32h), macro-indicators (27h), pdf-extractor (18h), frontend (32h), mcp-gateway (32h) ✓
- A-20 pdf-extractor multi-probe: ready for in-container check (container health 200) ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: 77.30% < 85% ✓
- A-32 disk: 38% < 85% ✓

### RAW-PROBE:
