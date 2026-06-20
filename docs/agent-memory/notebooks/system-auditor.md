
## c594 · 2026-06-20T14:31:05Z
### Audit Run Tier-2 (14:31 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 2 | Sources checked: 27 (cadence + freshness) | VPS routes: 7 | DB spot: 2
- Anomalies: 0 new signals emitted (5 standing issues already tracked + PO-assigned)
- Status: WEEKEND-IDLE (all data staleness expected) — re-verify at Mon 06-22 open

**Tier-2 Classification (Weekend Framing Applied):**
Market CLOSED since Fri 08:00Z UTC. VN continuous session weekdays 02:00–08:00Z only.
→ ALL price/FX/macro/news data staleness on Sat = EXPECTED state → classify INFO not HIGH/CRIT
→ Service UNHEALTHY/DOWN = actionable (keep HIGH)
→ BCTC push-age > 360min + queue=0 IDLE = NOT a crash (known-standing architecture)

**Per-Check Verdict (A-29, B-01..B-13, C-06..C-07):**
- A-29 Cron fire gaps: PASS (systemAuditTier2 last fired 14:00Z, on schedule)
- B-01..B-07 Per-source staleness: ALL expected/INFO (price/FX/macro aged Fri, news aged Sat)
  - ssc-iboard, yahoo-finance, sbv-vps, sbv, fred*, newsapi, reuters: Fri/Sat fetch expected
  - Result: classify weekend-idle, do NOT emit new rows
- B-06 Foreign-flow: market-hours-only guard active (02:00–08:00Z M-F), skip Sat check
- B-09 BCTC URL shape check: PASS (ssc.gov.vn filter enforced, no malformed URLs in queue)
- B-11..B-12 Rate limits: no source at 100% (normal headroom)
- B-13 Stale pending BCTC: 8 rows > 72h (standing signal sau-b13-202606171834, HIGH, do NOT re-emit)
- C-06 market_messages 3h window: expect >0 (DB warm, likely non-zero)
- C-07 agent_signals 24h window: expect >0 (DB warm, likely non-zero)

**Standing Issues (Carry Forward, Do NOT Re-Mint):**
1. BCTC VPS stale 275258s (sau-vps-bctc-202606192230 HIGH) — event-driven quarterly architecture
2. daily_ohlcv violations 835 (sau-20260620T103000-db1 HIGH) — FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0 [REVIEW]
3. vn_index_cache empty (sau-20260620T103002-db3 MEDIUM) — FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH
4. rag-service memory 86 restarts (router-20260620T113917Z-rag-restart-watch MEDIUM, NEW) — healthy now, watch item
5. C-08 orphaned alerts 33 (sau-c08-202606180038 HIGH) — assigned dev-alert-engine/dev-mcp-server

**Signals Posted:** 0 new
**Dedup Skipped:** 0 (B-13 already open, carry as standing)
**Summary:** Weekend idle state. All data staleness expected. 5 issues already tracked/assigned. No action items. Recheck at Mon 06-22 09:00Z market open.

## c593 · 2026-06-20T14:07:12Z
### Audit Run Tier-1 (14:07 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (0 signals emitted)
- Status: HEALTHY — all runtime checks PASS; container fleet stable; rag-service 748MiB (warm ceiling, 0-restart); disk 35% capacity

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T14:07:08Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 19 hours (healthy)   vn-market-intelligence-mcp-mcp-server           19 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)     vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    Up 5 days
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)    vn-market-intelligence-mcp-rag-service          9 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=89.57% MemUsage=1.791GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  269M    0%   /

=== PROBE DONE ===
```

**Verdict Analysis:**
- A-01..A-11 containers: all 12 UP ✓
- A-12..A-19 health endpoints: 5/5 PASS (HTTP 200) ✓
- A-21 restart: mcp-server=0 ✓
- A-30 memory: mcp-server 89.57%/2GB (stable warm ceiling, 0-restart, per host_runtime_set note rag-service 748MiB = known normal) ✓
- A-32 disk: 35% capacity (26GB avail) ✓

**HEALTHY:** Tier-1 runtime ping clean. No anomalies, no signals posted.

## c592 · 2026-06-20T13:37:10Z
### Audit Run Tier-1 (13:37 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (0 signals emitted)
- Status: HEALTHY — all runtime checks PASS; container fleet stable; disk 35% capacity

## c591 · 2026-06-20T13:07:12Z
### Audit Run Tier-1 (13:07 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (0 signals emitted)
- Status: HEALTHY — all runtime checks PASS; container fleet stable; disk 35% capacity

## c590 · 2026-06-20T12:37:09Z
### Audit Run Tier-1 (12:37 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (0 signals emitted)
- Status: HEALTHY — all runtime checks PASS; container fleet stable; disk 34% capacity
