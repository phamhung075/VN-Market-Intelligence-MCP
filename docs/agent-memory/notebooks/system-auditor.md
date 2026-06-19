# System Auditor Notebook

## c403 · 2026-06-19T22:30:32Z
### Audit Run Tier-2 (22:30–22:31 UTC 2026-06-19)
- Tier: 2 | Cron checks: pass | Sources checked: 7 | VPS routes: 7 | DB freshness spot: 3
- Anomalies: 3 new (C critical=1, W warn=2) | Dedup: 0 skipped
- Status: DEGRADED — data freshness SLA breaches detected
- B-01 CRITICAL: SSC iBoard price 47 min old (threshold 30 min) ⚠ STALE
- B-06 HIGH: vn-sbv-fetch unhealthy (2699s > 2100s) ⚠ data lag
- B-08 HIGH: vn-bctc-fetch unhealthy (275258s > 86400s) ⚠ data lag 3.2d
- B-09 OK: SSC URL check 0 found ✓
- B-13 OK: Stale BCTC pending 0 rows ✓
- C-06 OK: market_messages last 3h count=1 ✓
- C-07 OK: agent_signals last 24h count=152 ✓

## c402 · 2026-06-19T22:08:14Z
### Audit Run Tier-1 (22:08–22:08 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Container tooling: ✓ | Inter-service: ✓
- Anomalies: 0 new | Dedup: 0 skipped
- Status: HEALTHY — all runtime checks PASS
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L14]
- A-12..A-19 health endpoints: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓
- A-20 multi-probe pdf-extractor: 3/3 PASS ✓
- A-21 restart count: mcp-server=0 PASS ✓
- A-22 pdftoppm: present ✓ | A-23 tesseract: present ✓ | A-24 vie lang: present ✓
- A-25..A-28 inter-service: all ✓
- A-30 memory: mcp-server 28.13%/2GiB PASS ✓
- A-31 EPIPE: 0 ✓ | A-32 disk: 34% ✓

## c401 · 2026-06-19T21:37:32Z
### Audit Run Tier-1 (21:37–21:39 UTC 2026-06-19)
- Tier: 1 | Services: 12 | Status: HEALTHY
- Anomalies: 0 new | All runtime checks PASS ✓
- A-01..A-32 all PASS ✓ (containers/health/tooling/memory/disk all nominal)

## c400 · 2026-06-19T21:08:09Z
### Audit Run Tier-1 (21:06–21:08 UTC 2026-06-19)
- Tier: 1 | Status: HEALTHY | All checks PASS ✓
- Runtime: containers UP, health OK, memory 19.25%, disk 34%

## c399 · 2026-06-19T20:38:56Z
### Audit Run Tier-1 (20:38–20:39 UTC 2026-06-19)
- Tier: 1 | Status: HEALTHY | All runtime checks PASS ✓
- Memory: 17.80%, Disk: 35% — all nominal
