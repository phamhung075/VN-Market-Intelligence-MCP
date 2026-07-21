# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c847 · 2026-07-21T00:38:19Z
### Audit Run Tier-3 (00:38:19 UTC 2026-07-21)
- Tier: 3 | Docs: OK | Memory: OK | DB checks: 16
- Doc/memory audit PASS: git log OK, MEMORY.md OK, task_board 77≤80, sprint_goal 15 entries
- DB integrity checks:
  - C-01 (OHLCV codes): 900 ≥ 25 PASS
  - C-02 (OHLCV rows): 900 > 0 PASS
  - C-03 (FIN codes Q1): 45 ≥ 26 PASS
  - C-04 (low-confidence): 11 > 5 WARN
  - C-05 (SSC URLs): 0 PASS
  - C-06 (market messages): 0 WARN
  - C-07 (agent signals): 292 PASS
  - C-08 (orphaned alerts): 1 WARN
  - C-09 (macro indicators): 3 ≥ 3 PASS
  - C-10 (failed PDFs): 0 ≤ 2 PASS
  - C-11 (completed PDFs): 0 WARN
  - C-12 (integrity): market/alert/pdf OK, stock/rag missing
  - C-13 (WAL): market 7.09MB, pdf-ext none — all < 50MB PASS
  - C-14 (top-3 share): 0.3% < 60% PASS
  - C-15 (schema): all 4 columns present PASS
  - C-16 (stale pending): 0 PASS
- Tooling: pdftoppm/tesseract/vie present; connectivity 3/4 OK (pdf-extractor timeout)
- Anomalies: 4 found (1 C-04 dedup-skip + 3 new: C-06/C-08/C-11) | Status: DEGRADED

## c846 · 2026-07-21T00:10:51Z
### Audit Run Tier-1 (00:10:51 UTC 2026-07-21)
- Tier: 1 | Services: 13 checked | Health: 5 probed
- A-01 to A-11 (container status): 13/13 UP (all deployed and running)
- A-12 to A-19 (health endpoints): 3/5 OK — api-gateway CURL_ERR (A-12), pdf-extractor CURL_ERR (A-20 override)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall persistent (all probes HTTP 000)
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold)
- A-30 (memory): mcp-server=75.14% WARN — **exceeds 68% threshold** (trend: 55.89%→64.65%→61.27%→63.96%→75.14%, monotonic rise last 2 cycles)
- A-32 (disk): 36% < 85% PASS
- Anomalies: 0 new | 3 dedup-skipped (A-12, A-20, A-30 within 7d) | Status: DEGRADED (persistent)
