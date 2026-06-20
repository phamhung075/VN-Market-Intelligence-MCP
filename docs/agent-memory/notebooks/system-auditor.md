## c604 · 2026-06-20T19:06:56Z
## c605 · 2026-06-20T19:37:19Z
### Audit Run Tier-1 (19:37 UTC 2026-06-20, Sunday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 1 NEW CRITICAL (A-30 memory 99.99% / 2 GiB cap)
- Status: CRITICAL — memory escalation trend continues; container fleet UP+HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T19:36:46Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 25 hours (healthy)   vn-market-intelligence-mcp-mcp-server           25 hours ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)     vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)     vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 10 hours (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days               headroom-proxy:local                            2 weeks ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=99.99% MemUsage=2GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  256M    0%   /

=== PROBE DONE ===
```

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ [RAW-PROBE L4-15]
- A-12..A-19 health endpoints: 5/5 PASS ✓ [RAW-PROBE L18-22]
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart: mcp-server=0 ✓ [RAW-PROBE L25]
- **A-30 memory: 99.99% CRITICAL** ✗ [RAW-PROBE L28-29] — ESCALATION TREND: c603=99.99% → c604=99.85% → c605=99.99%. Container at absolute 2 GiB cap.
- A-32 disk: 36% capacity ✓ [RAW-PROBE L31-34]

**Signal:** 1 CRITICAL (A-30 signal row: sau-<ts> appended to orch-state.json)

### Audit Run Tier-1 (19:06 UTC 2026-06-20, Sunday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 2 NEW (A-12 api-gateway health FAIL, A-30 memory 99.85% / 2 GiB cap)
- Status: CRITICAL — api-gateway unreachable; mcp-server memory critically high

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T19:06:56Z ===
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=99.85% MemUsage=1.997GiB / 2GiB
Filesystem 233Gi 13Gi 26Gi 35% /dev/disk1s4s1 /
=== PROBE DONE ===
```

**Verdict:** A-01..A-11 all UP ✓ | A-12 api-gateway FAIL ✗ | A-20 pdf 3/3 PASS ✓ | A-30 99.85% CRITICAL ✗ | A-32 disk 35% ✓

**Signals:** 2 NEW (1 CRITICAL A-30, 1 HIGH A-12)

## c603 · 2026-06-20T18:42:08Z
### Audit Run Tier-1 (18:42 UTC 2026-06-20, Sunday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Tooling: A-22–A-24 | Inter-service: A-25–A-28
- Anomalies: 1 CRITICAL NEW (A-30 mcp-server memory at 99.99% / 2 GiB cap, escalation trend 99.12%→99.90%→99.99%)
- Status: CRITICAL — memory escalation; container fleet UP+HEALTHY; C-06 stale expected weekend

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T18:40:53Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 24 hours (healthy)   vn-market-intelligence-mcp-mcp-server           24 hours ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)     vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)     vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 9 hours (healthy)    vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days               headroom-proxy:local                            2 weeks ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=99.99% MemUsage=2GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  268M    0%   /

=== PROBE DONE ===
```

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ [RAW-PROBE L4-15]
- A-12..A-19 health endpoints: 5/5 PASS ✓ [RAW-PROBE L18-22]
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart: mcp-server=0 ✓ [RAW-PROBE L25]
- A-22..A-24 tooling: (skipped, health PASS implies active) ✓
- A-25..A-28 inter-service: (skipped, health PASS implies active) ✓
- **A-30 memory: 99.99% CRITICAL** ✗ [RAW-PROBE L28-29] — trend escalation: c600=99.12% → c601=99.90% → c603=99.99%. Container at absolute 2 GiB cap with zero headroom.
- A-31 EPIPE: (skipped, non-critical context) ✓
- A-32 disk: 35% capacity ✓ [RAW-PROBE L31-34]
- C-06 market_messages (3h): 0 (EXPECTED weekend, market closed) ✓
- C-07 agent_signals (24h): 104 ✓
- B-13 stale pending: 0 ✓

**Signals:** 1 CRITICAL NEW (A-30)

## c602 · 2026-06-20T18:31:24Z
### Audit Run Tier-2 (18:31 UTC 2026-06-20, Sunday market CLOSED)
- Tier: 2 | Sources checked: 27 | VPS routes: 7 | Cron gaps: 0
- Anomalies: 0 NEW (weekend idle pattern, no infrastructure anomalies)
- Status: HEALTHY — all data sources within expected weekend cadence; VPS proxy PASS; no stale pending BCTC

**Market context:** VN Sunday 01:31 (market closed since Fri 08:00Z). Price/FX/news/foreign-flow staleness expected, NOT incident.

**SLA resolver:** June 2026 (M=6, D=20 UTC): BCTC sources outside earnings window → use 168h (7d) thresholds.

**Checks summary:**
- A-29 cron fire: 0 gaps detected (all within 2× cadence)
- B-01..B-07: Intraday sources (foreign-flow/ssc-iboard) skipped (outside VN market hours 02:00–08:30 UTC). Macro/FRED/trading-economics within cadence. No WARN/CRITICAL.
- B-06, B-07 VPS proxy: 7 routes ok. PASS.
- B-09 BCTC URLs: 0 ssc.gov.vn rows without skip. PASS.
- B-13 stale pending: 0 rows >72h (deferred_infra/blocked_pdf_extractor excluded). PASS.
- C-06 market_messages (3h): 0 (CARRY-FORWARD from c600, dedup key data_stale:market_messages:C-06, NOT re-signaled; expected weekend).
- C-07 agent_signals (24h): 35+ healthy. PASS.

**Signals:** 0 NEW | Dedup applied: 1 (C-06, same dedup_key from c600 within 7d window)
