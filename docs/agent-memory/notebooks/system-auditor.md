
## c434 · 2026-07-20T10:32:15Z
### Audit Run Tier-2 (10:30:01–10:32:15 UTC 2026-07-20)
- Tier: 2 | Crons: 91 monitored | Sources: 27 checked | VPS: 4 routes
- Cron fire check (A-29): all on-schedule, no gaps > 2× cadence
- Per-source fetch freshness (B-01..B-12):
  - VPS proxy health: 4/4 routes OK (prices, news, sbv, bctc)
  - Rate limits: all sources ready
  - DB spot checks (C-06, C-07): PASS (4 messages / 289 signals in windows)
  - BCTC queue: 80 pending items, queue processing normal
- Anomalies: 0 new | 0 dedup-skipped
- Status: HEALTHY

## c433 · 2026-07-20T10:10:43Z
### Audit Run Tier-1 (10:09:31–10:10:43 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 2 findings (1 regression + 1 recurring)
- A-01 to A-11 (container status): 12/12 UP (all healthy or marked unhealthy)
- A-12 to A-19 (health endpoints): 4/5 OK — api-gateway CURL_ERR REGRESSION (was OK at 09:42, now flapping) + pdf-extractor CURL_ERR (overridden by A-20)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall (all 3 probes HTTP 000000, persistent, dedup: last=2026-07-19T20:46:16Z, user-gated PDF-AVAIL-02-FIX)
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold, no NEW restarts)
- A-30 (memory): mcp-server=58.46% WATCH — memory re-accelerated (trend: 45.34%→47.86%→54.82%→58.46%, approaching 60% threshold, restart_count=1, usage=1.754GiB/3GiB)
- A-32 (disk): 37% < 85% PASS
- System status: all circuits OK, pdf-extractor event-loop stall ongoing (persistent, DAY 1+ of issue)
- Anomalies: 0 new | 2 dedup-skipped (A-12 api-gateway, A-20 pdf-extractor) | Status: DEGRADED (pdf-extractor endpoint + event-loop + memory watch)
- Signals appended: A-12 (SKIP-dedup id=sys-20260720T101203-69a1 last_sent=2026-07-20T06:12:10Z), A-20 (SKIP-dedup id=sys-20260720T101156-1520 last_sent=2026-07-19T20:46:16Z), A-30 (SKIP-dedup id=sys-20260720T101211-78cf last_sent=2026-07-19T08:11:04Z)

## c432 · 2026-07-20T09:42:42Z
### Audit Run Tier-1 (09:41:19–09:42:42 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 1 finding (0 new + 1 dedup-skipped)
- A-01 to A-11 (container status): 12/12 UP (all healthy or marked unhealthy)
- A-12 to A-19 (health endpoints): 5/5 OK — api-gateway RECOVERED to OK + pdf-extractor CURL_ERR (overridden by A-20)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall (all 3 probes HTTP 000000, dedup: last=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold)
- A-30 (memory): mcp-server=54.82% < 85% PASS (uptime ~4h, trend climbing 40.31%→45.34%→47.86%→54.82%)
- A-32 (disk): 37% < 85% PASS
- System status: all circuits OK, pdf-extractor event-loop stall ongoing (persistent)
- Anomalies: 0 new | 1 dedup-skipped (A-20) | Status: DEGRADED (pdf-extractor endpoint + event-loop)
- Signals appended: A-20 (SKIP-dedup id=sys-20260720T094235-23e5 dedup_key=microservice_degraded:pdf-extractor:A-20)
