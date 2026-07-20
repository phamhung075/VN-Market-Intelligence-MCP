## c845 · 2026-07-20T23:42:55Z
### Audit Run Tier-1 (23:40:46 UTC 2026-07-20)
- Tier: 1 | Services: 13 checked | Health: 5 probed
- A-01 to A-11 (container status): 13/13 UP (all deployed and running)
- A-12 to A-19 (health endpoints): 4/5 OK — pdf-extractor CURL_ERR (A-20 override)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall (all probes HTTP 000)
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold)
- A-30 (memory): mcp-server=63.96% PASS (trend: 55.89%→64.65%(peak)→63.96%, receding)
- A-32 (disk): 35% < 85% PASS
- Anomalies: 0 new | 2 dedup-skipped | Status: DEGRADED (persistent)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-20T23:40:46Z ===

--- docker ps -a ---
mcp-gateway Up 5 days (healthy)
vn-market-intelligence-mcp-frontend-1 Up 5 days (healthy)
vn-market-intelligence-mcp-api-gateway-1 Up 5 days (healthy)
vn-market-intelligence-mcp-flaresolverr-1 Up 5 days (healthy)
vn-market-intelligence-mcp-news-fetch-1 Up 5 days (healthy)
vn-market-intelligence-mcp-mcp-server-1 Up 18 hours (healthy)
vn-market-intelligence-mcp-rag-service-1 Up 2 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1 Up 5 days (healthy)
vn-market-intelligence-mcp-pdf-extractor-1 Up 27 hours (unhealthy)
vn-market-intelligence-mcp-technical-analysis-1 Up 5 days (healthy)
vn-market-intelligence-mcp-alert-engine-1 Up 5 days (healthy)
vn-market-intelligence-mcp-stock-price-1 Up 5 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1 Up 5 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=63.96% MemUsage=1.919GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  266M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

**Signals appended:**
- A-11 (SKIP-dedup) id=sys-20260720T234219-7ec2 dedup_key=microservice_degraded:pdf-extractor:A-11 last_sent=2026-07-20T02:11:41Z
- A-20 (SKIP-dedup) id=sys-20260720T234225-28ab dedup_key=microservice_degraded:pdf-extractor:A-20 last_sent=2026-07-19T20:46:16Z

## c438 · 2026-07-20T22:43:25Z
### Audit Run Tier-1 (22:41:21–22:43:25 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP (all deployed and running)
- A-12 to A-19 (health endpoints): 4/5 OK — api-gateway CURL_ERR (recurring, dedup) + pdf-extractor CURL_ERR (A-20 override)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall persistent (in-container HTTP 000 × 3 probes, dedup: last=2026-07-19T20:46:16Z, ~26h duration, user-gated PDF-AVAIL-02-FIX)
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold)
- A-30 (memory): mcp-server=64.65% PASS (trending up: 55.89%→64.65%, still <85% threshold, usage=1.94GiB/3GiB)
- A-32 (disk): 36% < 85% PASS
- System status: 11/12 services healthy; api-gateway flapping + pdf-extractor event-loop stall ongoing
- Anomalies: 0 new | 2 dedup-skipped (A-12 api-gateway, A-20 pdf-extractor recurring) | Status: DEGRADED (persistent)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-20T22:41:21Z ===

--- docker ps -a ---
mcp-gateway Up 5 days (healthy)
vn-market-intelligence-mcp-frontend-1 Up 5 days (healthy)
vn-market-intelligence-mcp-api-gateway-1 Up 5 days (healthy)
vn-market-intelligence-mcp-flaresolverr-1 Up 5 days (healthy)
vn-market-intelligence-mcp-news-fetch-1 Up 5 days (healthy)
vn-market-intelligence-mcp-mcp-server-1 Up 17 hours (healthy)
vn-market-intelligence-mcp-rag-service-1 Up 2 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1 Up 5 days (healthy)
vn-market-intelligence-mcp-pdf-extractor-1 Up 26 hours (unhealthy)
vn-market-intelligence-mcp-technical-analysis-1 Up 5 days (healthy)
vn-market-intelligence-mcp-alert-engine-1 Up 5 days (healthy)
vn-market-intelligence-mcp-stock-price-1 Up 5 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1 Up 5 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=64.65% MemUsage=1.94GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    36%    393k  257M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

**Signals appended:**
- A-12 (SKIP-dedup recurring) id=sys-20260720T224218-7459 dedup_key=microservice_degraded:api-gateway:A-12 last_sent=2026-07-20T06:12:10Z
- A-20 (SKIP-dedup recurring) id=sys-20260720T224224-6396 dedup_key=microservice_degraded:pdf-extractor:A-20 last_sent=2026-07-19T20:46:16Z

## c437 · 2026-07-20T22:33:02Z
### Audit Run Tier-2 (22:30:27–22:33:02 UTC 2026-07-20)
- Tier: 2 | Crons: 91 monitored (all healthy) | Sources: 28 checked | VPS: 4 routes
- Cron fire check (A-29): all on-schedule, no gaps > 2× cadence
- Per-source fetch freshness (B-01..B-12):
  - VPS proxy health: 4/4 routes nominal; **CRITICAL: vn-bctc-fetch unhealthy**, **WARN: vn-sbv-fetch unhealthy**
  - Rate limits (B-12): all sources ready (0% critical)
  - DB spot checks (C-06, C-07): PASS (0 messages 3h / 296 signals 24h — market closed 05:31 VN)
  - BCTC queue (B-05/B-13): 183 pending items with 21.1h push-age, service unhealthy
- BCTC-EVAL-SNAPSHOT: 10 red, 11 yellow (MBB/HVN/HPG/GVR/FPT red; POW/VCB/VNM/EIB/SHB/DHG/DIG/BSR/ACB yellow)
- Anomalies: 2 new (B-05 bctc service, B-07 sbv service) | 0 dedup-skipped
- Status: DEGRADED (VPS services unhealthy)

**Signals appended:**
- B-05 (NEW) id=sys-20260720T223241-4460 dedup_key=data_stale:bctc-discover:B-05
- B-07 (NEW) id=sys-20260720T223248-02e8 dedup_key=data_stale:sbv-vps:B-07

## c436 · 2026-07-20T22:14:22Z
### Audit Run Tier-1 (22:12:44–22:14:22 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP (all deployed and running)
- A-12 to A-19 (health endpoints): 4/5 OK — api-gateway CURL_ERR + pdf-extractor CURL_ERR (A-20 override)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall persistent (dedup: last=2026-07-19T20:46:16Z, 25h+ duration, user-gated PDF-AVAIL-02-FIX)
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold)
- A-30 (memory): mcp-server=55.89% PASS (trend stable: 54.75%→55.89%, <85% threshold)
- A-32 (disk): 37% < 85% PASS
- System status: 11/12 services healthy; pdf-extractor event-loop stall ongoing
- Anomalies: 0 new | 2 dedup-skipped (A-12, A-20 recurring) | Status: DEGRADED (persistent)

**Signals appended (summary):**
- A-12 (SKIP-dedup recurring), A-20 (SKIP-dedup recurring)

## c435 · 2026-07-20T10:42:49Z
### Audit Run Tier-1 (10:41:06–10:42:49 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP (all deployed and running)
- A-12 to A-19 (health endpoints): 4/5 OK — pdf-extractor CURL_ERR (WARN)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall persistent
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold)
- A-30 (memory): mcp-server=54.75% PASS (trend improving: 58.46%→54.75%, <85% threshold)
- A-32 (disk): 37% < 85% PASS
- Anomalies: 0 new | 1 dedup-skipped (A-20 recurring) | Status: DEGRADED (persistent)

## c434 · 2026-07-20T10:32:15Z
### Audit Run Tier-2 (10:30:01–10:32:15 UTC 2026-07-20)
- Tier: 2 | Crons: 91 monitored | Sources: 27 checked | VPS: 4 routes
- Cron fire check (A-29): all on-schedule, no gaps > 2× cadence
- Per-source fetch freshness (B-01..B-12): VPS proxy health: 4/4 routes OK; rate limits: all sources ready; DB spot checks: PASS (4 messages / 289 signals); BCTC queue: 80 pending items, processing normal
- Anomalies: 0 new | 0 dedup-skipped
- Status: HEALTHY
