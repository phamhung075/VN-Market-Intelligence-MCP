# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c332 · 2026-06-25T05:14:56Z
### Audit Run Tier-1 (05:13–05:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 9/9 HTTP 200 OK (mcp 166 tools)
- Containers all UP: mcp-server (34min, RestartCount=0 FRESH-REBUILD-04:40Z, OOMKilled=false), frontend (24h), macro-indicators (24h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (44min, RestartCount=116 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY OOM-cycle), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-22–A-24 tooling: pdftoppm✓ tesseract✓ vie✓ | A-25–A-28 inter-svc: stock✓ ta✓ alert✓ pdf✓
- A-30 mcp-server mem=13.30% (272.5MiB/2GiB) | A-31 EPIPE=0 | A-32 disk=25% (41Gi free)
- B-05 BCTC healthy-idle: queue=38 pending, push-age=199.7h << SLA-1714.5h out-of-window, PASS
- DB C-01–C-16: C-01(942 tickers)✓ C-02(1616 rows)✓ C-03(32 actions Q1)✓ C-04(0 low-conf)✓ C-05(0 SSC URLs)✓ C-06(4 msgs 3h)✓ C-07(243 signals 24h)✓ C-08(1 orphan-alert-transient)✓ C-09(3 macro-ind)✓ C-10(0 PDF-fail)✓ C-11(0 PDF-done-off-season)✓ C-12(integrity=ok)✓ C-13(WAL=4.1MB)✓ C-14(top-3=0.4%)✓ C-15(schema✓)✓ C-16(0 stale-pending)✓
- Anomalies: 0 new | Dedup-skipped: 0 | Status: HEALTHY

## c331 · 2026-06-25T04:43:12Z
### Audit Run Tier-1 (04:43–04:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (4min, RestartCount=0 FRESH-REBUILD-04:38Z, OOMKilled=false), frontend (23h), macro-indicators (24h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (14min, RestartCount=114 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-20 pdf-extractor multi-probe: 3/3 passed HTTP 200 (event-loop responsive, healthy)
- A-30 mcp-server mem=16.34% (334.6MiB/2GiB, PASS <85% — fresh start) | A-32 disk=25% (41Gi free, PASS)
- Cron: 100+ jobs active, success rates ≥98%, no gaps detected
- B-05 bctc-discover: push-age≈200h vs out-of-window threshold≈1714.5h; queue OK; HEALTHY-IDLE gate PASS
- Anomalies: 0 new | Status: HEALTHY

## c330 · 2026-06-25T04:17:51Z
### Audit Run Tier-3 (04:14–04:18 UTC 2026-06-25)
- Tier: 3 | Tables: 16 checked | Container tooling: 3/3 (pdftoppm, tesseract, vie) | Inter-service: 4/4 UP
- **CRITICAL: C-12 market.db index corruption detected** — PRAGMA integrity_check failed: row 11335 missing from idx_mph_code_fetched
- C-01: 877 distinct codes (PASS); C-02: 976 rows (PASS); C-03: 32 action codes (PASS); C-04: 0 low-conf last 7d (PASS)
- C-05: 0 SSC URLs (PASS); C-06: 3 market_messages 3h (PASS); C-07: 234 signals 24h (PASS); C-08: 1 orphaned (transient)
- C-09: 3 macro indicators Vietnam (PASS ≥3); C-10: 0 PDF failed 24h (PASS); C-11: 0 PDF done 48h (expected-empty Q2)
- C-13: WAL 0 bytes (PASS); C-14: top-3 share=0.6% (PASS <60%); C-15: schema complete (PASS); C-16: 0 stale pending (PASS)
- A-22–A-24 tooling: pdftoppm, tesseract, vie lang all present (PASS); A-25–A-28 inter-service: stock/ta/alert/pdf all 200 OK
- Anomalies: 1 CRITICAL (C-12 index corruption) | Signal posted=1 | Status: DEGRADED
