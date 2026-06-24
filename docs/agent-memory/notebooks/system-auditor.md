# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c313 · 2026-06-24T22:31:30Z
### Audit Run Tier-2 (22:30–22:31 UTC 2026-06-24)
- Tier: 2 | Market: CLOSED (22:30 UTC = 05:30 VN) — price/FX/flow staleness EXPECTED
- Cron fire: A-29 all jobs PASS (0 gaps >2× cadence) | Last: intelligenceCycleJob 22:30 running
- Per-source freshness (B-01..B-07, B-11, B-12): all 4 OK | B-06 BCTC VPS=KNOWN-STATE | Rate limits: 12/14 ready, none at 100%
- DB spot: C-06 market_messages 2 ✓ | C-07 agent_signals 354 ✓ | B-09 SSC URLs 0 ✓ | B-13 stale BCTC 0 ✓
- BCTC-EVAL: 7 red, 6 yellow; HPG advancing 7/15
- Anomalies: 0 new (all KNOWN-STATE: B-06 SLA, ACV P1, chef live, rag FU-DEPLOY) | Status: HEALTHY


## c313 · 2026-06-24T22:31:29Z
### Audit Run Tier-2 (22:30–22:31 UTC 2026-06-24)
- Tier: 2 | Market: CLOSED (VN ~05:31, price/FX staleness downgraded) | Crons: 100+ jobs, 98.2–100% success
- Freshness: ssc-iboard 0s | foreign-flow <1min | sbv-vps <1min | news-vps 30s | bctc-discover 8.0d (EXPECTED Jun out-of-season, threshold=168h, PASS)
- SLA: bctc false-positive (tool reads 360min threshold, actual 168h window-out-of-season) — RECORD-AND-LEAVE
- Macro age: 22:30:46Z, within 24h SLA ✓ | Oil 73.18 NEUTRAL | Gold 4017 BULLISH | USDVND 26131 BEARISH
- Carry 1.37pp NEUTRAL | Yield CHEAP 2.05pp spread
- C-06 market_messages: 2 rows (3h window) ✓ | C-07 agent_signals: 354 rows (24h) ✓ | B-09 SSC URLs: 0 ✓ | B-13 stale BCTC: 0 ✓
- VPS: prices ok 08:59 | news ok 22:30 | sbv ok 22:05 | bctc last 2026-06-16 (8d, documented expectation for Q2)
- Rate limits: no source at 100% ✓ | RateLimit status: API hosts ready
- Anomalies: 0 new (no signals emitted) | Status: HEALTHY

## c312 · 2026-06-24T22:15:12Z
### Audit Run Tier-1 (22:14–22:15 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health: 5/5 HTTP 200
- A-20 pdf-extractor 3/3 multi-probe PASS (200 all) | A-21 mcp-server RC=0 | rag-service RC=108 (FU-RAG-DEPLOY)
- A-25..A-28 inter-svc: 4/4 PASS | A-31 EPIPE: 0 (PASS) | Memory=84.22% (PASS <85%)
- A-32 disk=40% (PASS <85%) | Cron: 100+ jobs, all success rates ≥98.2%
- Anomalies: 0 new | Status: HEALTHY

## c457 · 2026-06-24T22:14:27Z
### Audit Run Tier-1 (22:13–22:14 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health: 5/5 HTTP 200
- A-21 mcp-server RestartCount=0 | rag-service RC=108 (KNOWN-STANDING FU-RAG-DEPLOY) | Memory=83.94% (PASS no OOM)
- A-25..A-28 inter-svc: 4/4 PASS | A-31 EPIPE: 0 count PASS | A-32 disk=39% PASS
- DB checks C-01..C-07 all PASS; PRAGMA integrity_check=ok; WAL=4.1MB <50MB
- Cron health: 80+ jobs running, 98.2%–100% success rate; no gaps
- B-09 SSC portal URLS: 0 (PASS) | B-13 stale BCTC: 0 (PASS) | B-08 PDFs: 80 landed
- VPS BCTC last push: 2026-06-16 (8d old) — OUT-OF-SEASON normal (June, no earnings)
- Anomalies: 0 new | Status: HEALTHY
