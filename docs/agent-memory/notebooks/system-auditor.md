
## c214 · 2026-07-03T22:35:31Z
### Audit Run Tier-2 (22:20–22:35 UTC 2026-07-03)
- Tier: 2 | Crons: 100+ checked | Sources: 5 OK | VPS routes: 6/7 accessible
- A-29 (cron fire): PASS all, 100+ jobs, success_rate ≥ 80%
- B-01 through B-07, B-11, B-12 (per-source freshness): 5/5 sources OK (price/news/sbv/foreign-flow monitored)
- B-09 (BCTC URL shape): PASS — 0 bad SSC URLs in queue
- B-13 (stale pending BCTC): PASS — 0 stale pending rows
- C-06 (market messages 3h): PASS — 1 message
- C-07 (agent signals 24h): PASS — 212 signals
- B-08 (BCTC PDFs landed): PASS — 98 PDFs
- **B-05 CRITICAL**: bctc-push VPS stale 18 days (2026-06-16 last push) | In earnings window (24h threshold, days 1-14) | Elapsed: 432h >> 24h | Active queue: 36 items | Root: VPS headroom-proxy network binding 127.0.0.1:8787 blocks container access
- Anomalies: 1 new CRITICAL | M dedup-skipped: 1 (prior B-05 row from 2026-07-03T02:41:17Z still open)
- Status: DEGRADED

### Context
- BCTC VPS push hasn't succeeded since 2026-06-16T18:02:24Z (17+ days)
- Earnings window active: Jul 1-14 (Q2 results season), threshold 24h vs normal 168h
- Prior signal (2026-07-03T02:41:17Z) noted HNX SSL outage + deploy-pending fix (BCTC-HNX-SSL-HARDEN)
- Current audit confirms: VPS infrastructure issue persists; headroom-proxy network binding prevents mcp-server container from reaching VPS routes
- vn-bctc-fetch service status reports "healthy" but cannot push due to network isolation
## c214 · 2026-07-03T22:35:31Z
### Audit Run Tier-2 (22:20–22:35 UTC 2026-07-03)
- Tier: 2 | Crons: 100+ checked | Sources: 5 OK | VPS routes: 6/7 accessible
- A-29 (cron fire): PASS all, 100+ jobs, success_rate ≥ 80%
- B-01 through B-07, B-11, B-12 (per-source freshness): 5/5 sources OK (price/news/sbv/foreign-flow monitored)
- B-09 (BCTC URL shape): PASS — 0 bad SSC URLs in queue
- B-13 (stale pending BCTC): PASS — 0 stale pending rows
- C-06 (market messages 3h): PASS — 1 message
- C-07 (agent signals 24h): PASS — 212 signals
- B-08 (BCTC PDFs landed): PASS — 98 PDFs
- **B-05 CRITICAL**: bctc-push VPS stale 18 days (2026-06-16 last push) | In earnings window (24h threshold, days 1-14) | Elapsed: 432h >> 24h | Active queue: 36 items | Root: VPS headroom-proxy network binding 127.0.0.1:8787 blocks container access
- Anomalies: 1 new CRITICAL | M dedup-skipped: 1 (prior B-05 row from 2026-07-03T02:41:17Z still open)
- Status: DEGRADED

### Context
- BCTC VPS push hasn't succeeded since 2026-06-16T18:02:24Z (17+ days)
- Earnings window active: Jul 1-14 (Q2 results season), threshold 24h vs normal 168h
- Prior signal (2026-07-03T02:41:17Z) noted HNX SSL outage + deploy-pending fix (BCTC-HNX-SSL-HARDEN)
- Current audit confirms: VPS infrastructure issue persists; headroom-proxy network binding prevents mcp-server container from reaching VPS routes
- vn-bctc-fetch service status reports "healthy" but cannot push due to network isolation


