# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c485 · 2026-07-02T11:15:11Z
### Audit Run Tier-1 (11:00–11:15 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS
- Restart: mcp-server=3 ⚠ (known/dedup-tracked) | Memory: 29.91% ✓ | Disk: 46% ✓
- Anomalies: 0 new (1 dedup-tracked A-21: restart threshold ≤2 exceeded) | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-02T11:15:11Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 59 minutes (healthy)   33fea3bafe16                                    13 hours ago
vn-market-intelligence-mcp-frontend-1             Up 20 hours (healthy)     74bfe1c5b392                                    20 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 26 hours (healthy)     vn-market-intelligence-mcp-technical-analysis   26 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)       vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)       vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 days (healthy)       vn-market-intelligence-mcp-api-gateway          3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 2 minutes (healthy)    vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)       vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)       vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 6 days                 headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 6 days (healthy)       mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=29.91% MemUsage=612.6MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    16Gi    46%    393k  166M    0%   /

=== PROBE DONE ===
```

[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
A-20: PASS (3/3 probes); event-loop healthy.

Note: Signal A-21 posted (signal_id=8285); BUG Telegram skipped (7-day dedup last @10:46Z). Signal row wrote OK.

## c484 · 2026-07-02T10:46:00Z
### Audit Run Tier-1 (10:30–10:46 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS
- Restart: mcp-server=3 ⚠ (↑ from 2 @10:15, new restart) | Memory: 13.87% ✓ | Disk: 46% ✓
- Anomalies: 1 new WARN (A-21: restart threshold ≤2 exceeded) | Status: HEALTHY

Note: Signal A-21 posted (signal_id=8281); BUG Telegram sent (msg_id=3138). Signal row write deferred (orch-state wedge: signal_queue.rows[43] dangling ref — PO repair routed).

## c483 · 2026-07-02T10:34:18Z
### Audit Run Tier-2 (10:31–10:35 UTC 2026-07-02)
- Tier: 2 | Cron: 100+ jobs, no fire gaps | Sources: 27 checked | VPS routes: 4/4 healthy
- Anomalies: 1 new CRITICAL (B-05 bctc-discover stale 384h in earnings window) | Status: DEGRADED
- B-05 gate: queue=38 actionable rows, host=UP → STALE verdict (not idle). Last push 2026-06-16T18:02:24Z.
- B-09: PASS (0 SSC URLs in queue) | B-13: PASS (0 stale pending >72h) | C-06: PASS (1 msg <3h) | C-07: PASS (165 signals <24h)
