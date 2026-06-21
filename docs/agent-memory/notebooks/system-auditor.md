# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c616 · 2026-06-21T00:07:07Z
### Audit Run Tier-1 (00:07 UTC 2026-06-21, Sunday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable healthy state)
- Status: HEALTHY — container fleet UP+HEALTHY; normal resource utilization

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ | A-12..A-19 health: 5/5 PASS ✓
- A-20 mcp-server restart: 0 ✓ | A-30 memory: 14.46% ✓ | A-32 disk: 35% (25GB avail) ✓

**Signals:** 0 NEW | Status: CLEAN
## c615 · 2026-06-21T00:03:34Z
### Audit Run Tier-3 (00:03 UTC 2026-06-21, Saturday early morning)
- Tier: 3 | Container tooling: 3/3 PASS | Inter-service: 4/4 PASS | DB checks: 16 run
- Anomalies: 1 NEW (C-04 WARN: 7 low-conf reports vs ≤5)
- Status: DEGRADED (1 WARN) | Container: HEALTHY | Databases: OK | Tooling: OK
- C-01..C-03,C-05..C-16: all PASS ✓ | C-06,C-11: INFO (VN night/off-earnings) | C-04: WARN

**DB Summary:**
- C-01 (ohlcv distinct): 1053 ✓ | C-02 (rows): 1628 ✓ | C-03 (Q1 codes): 32 ✓
- C-04 (low-conf): 7 ⚠ | C-05 (SSC): 0 ✓ | C-06 (msgs): 0 ℹ | C-07 (signals): 59 ✓
- C-08 (orphaned): 0 ✓ | C-09 (macro): 3 ✓ | C-10 (failed): 0 ✓ | C-11 (done): 0 ℹ
- C-12 (integrity): OK ✓ | C-13 (WAL): 5.0MB ✓ | C-14 (concentration): 0.4% ✓
- C-15 (schema): OK ✓ | C-16 (stale): 0 ✓

**Signals:** 1 NEW (sau-c04-202606210003, WARN)
## c614 · 2026-06-21T00:36:47Z
### Audit Run Tier-1 (00:36 UTC 2026-06-21, Friday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable healthy state)
- Status: HEALTHY — container fleet UP+HEALTHY; normal resource utilization

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ | A-12..A-19 health: 5/5 PASS ✓
- A-20 pdf-extractor: 3/3 PASS ✓ | A-21 restart: 0 ✓
- A-30 memory: 8.07% PASS ✓ | A-32 disk: 34% ✓

**Signals:** 0 NEW | Status: CLEAN
