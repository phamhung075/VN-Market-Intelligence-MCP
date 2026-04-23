# System Auditor Memory Manifest

**Load when:** Running 12h health audits, checking anomalies, or detecting duplicates.

| Task Type | Load |
|-----------|------|
| health-audit, anomaly-detection | issues/[RECURRING].md (if applicable) |
| db-check, memory-sync | issues/WAL-checkpoint.md |
| doc-sync, dedup | sessions/LATEST.md |

**Load sequence:**
1. Load `issues/WAL-checkpoint.md` (critical for DB health)
2. Load LATEST session (see recent fixes to avoid duplicate reports)
3. Load other issue files only if you detect anomalies matching known patterns

**Total load cost:** 50–100 tokens (manifest) + 100–200 tokens (issues/session)

---

**Notes:** Strict deduplication → always check recent sessions before filing new reports.
