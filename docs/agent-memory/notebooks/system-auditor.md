## c600 · 2026-06-20T17:08:27Z
### Audit Run Tier-1 (17:08 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Tooling: A-22/A-23/A-24 | Inter-service: A-25–A-28
- Anomalies: 1 new (HIGH: C-06 market_messages stale >3h)
- Status: DEGRADED — runtime checks PASS; DB freshness FAIL (C-06 no messages last 3h)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T17:07:01Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 22 hours (healthy)   vn-market-intelligence-mcp-mcp-server           22 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)     vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)    vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days               headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)     mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=99.12% MemUsage=1.982GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  269M    0%   /

=== PROBE DONE ===
```

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓
- A-12..A-19 health endpoints: 5/5 PASS ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart: mcp-server=0 ✓
- A-22..A-24 tooling: pdftoppm+tesseract+vie ✓
- A-25..A-28 inter-service: all OK ✓
- A-30 memory: 99.12% (stable ceiling) ✓
- A-31 EPIPE: 0 ✓
- A-32 disk: 35% capacity ✓
- B-08 BCTC PDF: 80 ✓
- C-05 BCTC ssc URLs: 0 ✓
- C-06 market_messages (last 3h): 0 ✗ FAIL (stale since 2026-06-19 19:47:24)
- C-07 agent_signals (last 24h): 105 ✓
- B-13 stale pending: 0 ✓

**Signals:** sau-20260620T170827ZZ (C-06 FAIL, HIGH, to=po)

## c599 · 2026-06-20T16:36:54Z
### Audit Run Tier-1 (16:36 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (0 signals emitted)
- Status: HEALTHY — all runtime checks PASS; container fleet UP + HEALTHY 100%; no new anomalies

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T16:36:57Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 22 hours (healthy)   vn-market-intelligence-mcp-mcp-server           22 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)     vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)    vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days               headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)     mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=99.98% MemUsage=2GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  269M    0%   /

=== PROBE DONE ===
```

**Carry-forward notes:**
- mcp-server memory: 99.98% (2/2GiB cgroup cap). Monotonic creep 92.37→99.98% tracked as row router-20260620T154041Z-mcp-server-mem-creep (MEDIUM). RestartCount=0 (no OOM kills). Per policy: stable ceiling (WARN), NOT CRITICAL. Do NOT re-mint.
- rag-service: RestartCount=86 (24h trend +9). Tracked as row router-20260620T113917Z-rag-restart-watch (MEDIUM). Currently healthy post-restart. Per policy: fold into Monday 06-22 rebuild. Do NOT re-mint.
- Weekend idle: all data staleness expected. Re-verify at market open Mon 06-22.

**Verdict:**
- A-01..A-11 containers: all 12 UP ✓
- A-12..A-19 health endpoints: 5/5 PASS ✓
- A-21 restart: mcp-server=0, rag-service=86 (tracked) ✓
- A-30 memory: mcp-server 99.98% (ceiling, tracked) ✓
- A-32 disk: 35% capacity (26GB avail) ✓

**Status:** HEALTHY. 0 NEW anomalies. All known issues remain tracked in signal_queue rows (31 total).

## c598 · 2026-06-20T16:07:05Z
### Audit Run Tier-1 (16:07 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (0 signals emitted)
- Status: HEALTHY — all runtime checks PASS; container fleet stable; memory stable ceiling (97.69%, 0-restart); disk 36% capacity

## c597 · 2026-06-20T15:37:37Z
### Audit Run Tier-1 (15:37 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (0 signals emitted)
- Status: HEALTHY — no new anomalies; carry-forward: rag-restart-watch (MEDIUM, already tracked); all data staleness expected weekend idle

## c596 · 2026-06-20T15:07:09Z
### Audit Run Tier-1 (15:07 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (0 signals emitted)
- Status: HEALTHY — all runtime checks PASS; container fleet stable; disk 35% capacity
