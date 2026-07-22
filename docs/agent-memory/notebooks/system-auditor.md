


## c72407e2 · 2026-07-22T22:42:22Z
### Audit Run Tier-1 (22:42 UTC 2026-07-22)
- Tier: 1 | Services checked: 12 | Health endpoints: 5
- Memory: mcp-server 53.62% (1.6 GiB / 3 GiB), Disk: 29% used
- Anomalies: 0 new
- Status: HEALTHY
- RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-22T22:41:23Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)    vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 31 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        31 hours ago
mcp-gateway                                       Up 7 days (healthy)     mcpservergatway-gateway                         7 days ago
vn-market-intelligence-mcp-frontend-1             Up 7 days (healthy)     vn-market-intelligence-mcp-frontend             7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)     vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)     vn-market-intelligence-mcp-news-fetch           7 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)    vn-market-intelligence-mcp-rag-service          7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)     vn-market-intelligence-mcp-alert-engine         7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    7 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=53.62% MemUsage=1.611GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    33Gi    29%    393k  350M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```
## c-2026-07-22-T22:33 · 2026-07-22T22:33:17Z
### Audit Run Tier-2 (22:33 UTC 2026-07-22)
- Tier: 2 | Cron fire check: PASS | Sources checked: 28
- VPS proxy health: 2 healthy (news OK), 2 stale (sbv/bctc), 1 idle (foreign-flow market-closed)
- SLA evaluation: 1 CRITICAL (sbv-vps 43h/24h threshold)
- BCTC healthy-idle gate: PASS (queue=183, 69h < 191h SLA window)
- DB spot checks: PASS (C-06=2 messages, C-07=282 signals, B-09=0 SSC, B-13=0 stale)
- Rate limits: All 12 sources ready
- Anomalies: 1 new (C critical × 1: sbv-vps stale) | Status: DEGRADED
- [emit-signal] OK dedup_key=data_stale:sbv-vps:B-06 id=sys-20260722T223302-4f8b

## c3c5e1a · 2026-07-22T18:32:45Z
### Audit Run Tier-2 (18:31–18:32 UTC 2026-07-22)
- Tier: 2 | Cron fire check: PASS (100+ jobs running, 2 OOM crashes 14:52Z prior) | Sources checked: 28
- VPS proxy health: 2 healthy (news OK, sbv OK), 2 stale (bctc/prices off-season SLA), 1 idle (foreign-flow market-closed)
- SLA status: 1 WARN (sbv_fx marginal 31/30min), BCTC healthy-idle (queue=183, 11222min SLA window)
- DB spot checks: PASS (C-06=0 market_messages expected off-hours, C-07=279 signals, B-09=0 SSC URLs, B-13=0 stale)
- Rate limits: All ready (0% saturation)
- Anomalies: 1 new (W warn × 1: sbv_fx SLA) | Status: DEGRADED
- [emit-signal] OK B-11 id=sys-20260722T183223-0f2a

## 5c1b8a0 · 2026-07-22T15:07:36Z
### Audit Run Tier-2 (15:05–15:07 UTC 2026-07-22)
- Tier: 2 | Cron fire check: PASS (100+ jobs running, 4 recent crashes at 14:52:12-14:52:34Z consistent with OOM) | Sources checked: 28
- VPS proxy health: ACCEPTABLE (news OK, sbv/bctc stale but off-season SLA allows; prices off-hours)
- SLA breaches: 0 CRITICAL (all within thresholds, BCTC 2956min / 11017min SLA window)
- DB spot checks: PASS (news freshness OK, BCTC queue 183 items healthy-idle gate pass)
- Container status: 12/12 UP (mcp-server up 13min post-restart; restart count=2 — OOM pattern identified)
- **NEW CRITICAL**: rag-service memory 763.8/768 MiB (99.46%) — LanceDB ceiling pressure detected
- **NEW WARN**: mcp-server restart count=2 — recurring OOM→restart pattern, root cause: potential memory leak
- Anomalies: 2 new (C critical × 1: rag-service memory, W warn × 1: mcp-server OOM pattern) | Status: DEGRADED
- [emit-signal] OK A-31 id=sys-20260722T150730-2c18
- [emit-signal] OK A-21-OOM-PATTERN id=sys-20260722T150735-5955
- Context: mcp-server recovered from 14:51Z OOM event; current memory 651.6MiB/3GiB (21.21%); previous A-30 mem threshold alert RESOLVED (not re-emitted per dedup/resolution gate)

## 43a798a97 · 2026-07-22T15:01:19Z
### Audit Run Tier-2 (15:00–15:01 UTC 2026-07-22)
- Tier: 2 | Cron fire check: PASS (100+ jobs running) | Sources checked: 28
- VPS proxy health: DEGRADED (2 healthy, 2 unhealthy: vn-news-fetch, vn-bctc-fetch; 1 idle)
- SLA breaches: 2 CRITICAL (B-04 news-vps 389min/30min, C-06 market_messages 0/expected>0)
- DB spot checks: C-07=288 signals PASS, B-09=0 SSC URLs PASS, B-13=0 stale PASS
- BCTC queue: 183 pending items (not healthy-idle gate); push-age OK within SLA
- Rate limits: All sources ready
- Anomalies: 2 new (C critical × 2: news stale, market_messages zero) | Status: DEGRADED
- [emit-signal] OK B-04 id=sys-20260722T150033-635a
- [emit-signal] OK-escalation-bypass C-06 id=sys-20260722T150037-7ed7
- Post-restart assessment: mcp-server restart ~14:53Z; freshness ages elevated but plausibly attributable to outage window; no false-alarm suppression per E-3 contract.

## 0ab97c7 · 2026-07-22T06:32:52Z
### Audit Run Tier-2 (06:30–06:32 UTC 2026-07-22)
- Tier: 2 | Cron fire check: PASS (100+ jobs running) | Sources checked: 28
- VPS proxy health: DEGRADED (2 healthy, 3 unhealthy: vn-bctc-fetch, vn-price-fetch, vn-foreign-flow)
- SLA breaches: 2 CRITICAL (B-04 foreign-flow 1642min/10min, B-05 bctc-discover 2441min/120min)
- DB spot checks: PASS (C-06=3 messages, C-07=284 signals, B-09=0 SSC URLs, B-13=0 stale)
- BCTC queue: 183 pending/url_not_found/enrich_failed items (not healthy-idle gate)
- Anomalies: 3 new (C critical × 3: foreign-flow, bctc-discover, VPS services) | Status: DEGRADED
- [emit-signal] OK-escalation-bypass B-04 id=sys-20260722T063217-1356
- [emit-signal] OK-escalation-bypass B-05 id=sys-20260722T063233-76cb
- [emit-signal] OK-escalation-bypass B-06 id=sys-20260722T063225-07c9

## a4f2b1e · 2026-07-22T06:11:30Z

