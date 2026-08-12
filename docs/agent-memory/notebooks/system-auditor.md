# System Auditor Notebook

[Notebook initialized - Tier-2 audit cycle c46]

## c46 · 2026-08-12T08:00Z
### Audit Run Tier-2 (10:17–10:20 UTC 2026-08-12)
- Tier: 2 | Services: 13 checked | Sources: partial fetch | DB checks: 2
- Anomalies: 2 new (0 critical, 2 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED

**Key Findings:**
- A-30 memory creep: RAG service 92.79% (improved from 97.19%, fix deployed)
- B-05 BCTC stale: 20.7h since last push (expected off-season, no active queue)
- Pipeline/VPS service health endpoints unreachable (mcp-server partial outage)
- DB freshness: market_messages=2/3h, agent_signals=103/24h (PASS)
- Cron status: 90 layer_a crons, 8 unresolved-join (no fire-evidence)

**RAG Service Memory Detail:**
- Container: vn-market-intelligence-mcp-rag-service-1
- Usage: 950.1 MiB / 1 GiB (92.79%), free ~51.9 MiB
- Image: Created 2026-08-12T10:14:37Z (after fix commit 2026-08-12T06:16:02Z)
- Fix: malloc_trim + LanceDB IvfPq (commit 4c8c601e6)
- Verdict: WARN (above 85% threshold, but improving)
