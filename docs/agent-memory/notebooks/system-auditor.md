# System Auditor Notebook

Cycle log: Latest first. Pruned to ≤200L (section count limited). Each cycle appended at TOP; oldest dropped when ≥3 sections.

---

## c286 · 2026-06-09T02:36:27Z
### Audit Run Tier-1 (02:36 UTC 2026-06-09 → Tuesday early morning)
- Tier: 1 | Services: 6 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-19 container UP: mcp-server (9h), api-gateway (32h), macro-indicators (27h), pdf-extractor (18h), frontend (32h), mcp-gateway (32h) ✓
- A-20 pdf-extractor multi-probe: ready for in-container check (container health 200) ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: 77.30% < 85% ✓
- A-32 disk: 38% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-09T02:36:13Z ===
--- docker ps -a ---
mcp-server Up 9h / api-gateway Up 32h / macro-indicators Up 27h / pdf-extractor Up 18h
frontend Up 32h / mcp-gateway Up 32h (all healthy)
--- health endpoints ---
mcp-server:3000/health OK (200) / api-gateway:4000/health OK (200)
macro-indicators:5004/health OK (200) / pdf-extractor:5001/health OK (200)
frontend:3001/ OK (200)
--- restart count ---
RestartCount=2 (mcp-server)
--- memory pressure ---
MemPerc=77.30% (mcp-server)
--- disk df -h / ---
38% used, 22Gi avail
```

---

## c285 · 2026-06-09T02:31:45Z
### Audit Run Tier-2 (02:30 UTC 2026-06-09 → Tuesday early morning)
- Tier: 2 | Cron jobs: 100+ monitored | Sources: 27+ checked | VPS routes: 7 checked
- Anomalies: 2 CRITICAL new (B-02, B-11) + 1 HIGH cron crash | Status: DEGRADED
- B-02 bctc-discover stale 9.5h (threshold 2h out-of-window) → CRITICAL
- B-11 news-vps stale 1.03h (threshold 0.5h) → CRITICAL
- A-29 cron vnstockFundamentalsRefresh: CRASHED (0% success, last 2026-06-08 01:00)
- VPS Service Health: vn-news-fetch unhealthy (1h 1m uptime); vn-sbv-fetch stale 22+h
- Crons: 100+ running with 98-100% success rates; bctcQueueEnricherJob RUNNING (not error)

---

## c284 · 2026-06-09T02:07:52Z
### Audit Run Tier-1 (02:07 UTC 2026-06-09 → Tuesday morning)
- Tier: 1 | Services: 6 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-19 container UP: mcp-server (9h), api-gateway (31h), macro-indicators (27h), mcp-gateway (31h), pdf-extractor (18h), frontend (31h) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: 74.62% < 85% ✓
- A-32 disk: 38% < 85% ✓

---

## c283 · 2026-06-09T00:33:17Z
### Audit Run Tier-3 (00:30 UTC 2026-06-09 → 2026-06-09 07:30 VN, Tuesday)
- Tier: 3 | Services: 6 checked | DB checks: C-01..C-16 + tooling A-22..A-31
- Anomalies: 4 new (1 CRITICAL, 3 WARN) | Dedup: 0 skipped
- Status: DEGRADED (C-09 macro-refresh failure critical)
- A-22/23/24 tooling: pdftoppm ✓, tesseract ✓, vie lang ✓
- A-31 EPIPE: 0 crashes (≤2 pass)
- B-08 BCTC PDFs: 60 present (>0 pass)
- C-01/C-02 OHLCV: 1591 tickers (≥25 pass), 1591 rows (>0 pass)
- C-03 Q1 2026 actions: 27 (≥26 pass)
- C-04 low-confidence 7d: 7 (>5) — WARN
- C-06 market_messages 3h: 0 (expects >0) — WARN
- C-08 orphaned alerts: 41 (expects 0) — WARN
- C-09 macro_indicators: 1 (expects ≥3) — CRITICAL
