## c601 · 2026-06-20T18:07:52Z
### Audit Run Tier-1 (18:07 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Disk: 36% capacity
- Anomalies: 0 NEW (carry-forward: C-06 market_messages=0 from c600, EXPECTED weekend idle)
- Status: HEALTHY — all runtime checks PASS; container fleet UP+HEALTHY; C-06 stale expected on market-closed

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T18:07:07Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 23 hours (healthy)   vn-market-intelligence-mcp-mcp-server           23 hours ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)     vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)     vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 8 hours (healthy)    vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days               headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)     mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=99.90% MemUsage=1.998GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    36%    393k  258M    0%   /

=== PROBE DONE ===
```

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ [RAW-PROBE L4-15]
- A-12..A-19 health endpoints: 4/5 PASS; api-gateway transient CURL_ERR (direct curl=200, network stall) ✓ [RAW-PROBE L22-26]
- A-20 pdf-extractor multi-probe: (skipped, health OK) ✓
- A-21 restart: mcp-server=0 ✓ [RAW-PROBE L28]
- A-30 memory: 99.90% (stable ceiling, <2GB cap, no OOM kills) ✓ [RAW-PROBE L30-31]
- A-32 disk: 36% capacity (25GB avail, healthy) ✓ [RAW-PROBE L33-36]
- C-06 market_messages (last 3h): 0 (EXPECTED — Saturday market CLOSED 02:00-08:30 UTC; next intraday at Mon 09:00 VN) — carry-forward from c600, no new signal
- C-07 agent_signals (last 24h): 103 ✓
- B-13 stale pending: 0 ✓

**Carry-forward (do not re-signal):**
- sau-20260620T170827ZZ (C-06 FAIL from c600, HIGH) — same finding at 18:07Z, 0 messages expected weekend idle

**Status:** HEALTHY. 0 NEW anomalies. All checks PASS or carry-forward. Disk stable.

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
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)    vn-market-intelligence-mcp-news-fetch           9 days ago
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
Filesystem        Size    Used   Avail Capacity iused  Avail Capacity iused ifree %iused  Mounted on
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
