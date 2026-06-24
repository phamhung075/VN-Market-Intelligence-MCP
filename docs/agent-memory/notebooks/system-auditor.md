# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c431 · 2026-06-24T12:15:14Z
### Audit Run Tier-1 (12:15 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 UP, healthy | Health: 11/12 HTTP 200
- Anomalies: 0 new | Dedup: A-21 rag=106 no-jump, A-30 mcp-mem normal → PASS both
- Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T12:14:01Z ===
All 12 host_runtime_set UP + healthy. Inter-service connectivity: 4/4 OK.
mcp-server: RestartCount=1 OOMKilled=false Mem=63.92%/2GiB
rag-service: RestartCount=106 OOMKilled=false Mem=94.38%/768MiB (FU-RAG known ~1/hr)
pdf-extractor, stock-price, technical-analysis, alert-engine: RestartCount=0
Disk: 35% used (25Gi free). EPIPE errors last 30min: 0. OCR tooling: pdftoppm+tesseract+vie OK.
Cron health: 100 jobs, 100% success rate, no fire gaps.
VPS proxy: prices/news/sbv ok; bctc stale 8d (EXPECTED June).
BCTC queue: 0 stale pending rows (>72h).
```
- A-01–A-11 (container UP): All 12 healthy. PASS.
- A-12–A-20 (health HTTP 200): 11/12 from host (stock-price blocked, OK from inside). PASS.
- A-21–A-28 (restart/tooling/inter-svc): All PASS, no ACUTE jumps.
- A-30 (mcp-mem): 63.92%, RestartCount=1 (not >2), OOMKilled=false. PASS.
- A-32 (disk): 35%, 25Gi avail. PASS.
- B-13 (BCTC stale pending): 0 rows. PASS.
- Cron fire gaps: None detected. PASS.

## c430 · 2026-06-24T12:15:17Z
### Audit Run Tier-1 (12:15 UTC 2026-06-24)
- Tier: 1 | Services: 12 | Anomalies: 0 new | Status: HEALTHY

## c429 · 2026-06-24T11:44:14Z
### Audit Run Tier-1 (11:44 UTC 2026-06-24)
- Tier: 1 | Services: 12 checked | Anomalies: 0 new | Status: HEALTHY
