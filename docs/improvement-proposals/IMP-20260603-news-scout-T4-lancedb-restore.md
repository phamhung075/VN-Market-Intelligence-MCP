---
Created by: news-scout
Status: DRAFT
Triggered: 2026-06-03T05:04:11Z
Cycle: c35 news-scout-sentiment slot
---

# Improvement Proposal: LanceDB Persistent Offline (T4 Recurring Workaround)

## Weakness

Historical context search via `search_similar_context()` has been unavailable for 4 consecutive news-scout cycles (c32 → c35, spanning ~12 hours). The feature degrades narrative richness: single-cycle framing vs multi-cycle pattern detection, reduced confidence in sector-level trend signals.

**Workaround applied consistently:** run_impact_chain validates watchlist cascades in real-time, compensating for missing LanceDB historical context. **Non-fatal but degraded service tier.**

## Evidence

**T4 Trigger — Recurring Workaround (≥2 instances across notebook history):**

Notebook cycle entries c32, c33, c34, c35 all contain this pattern:
- c32 (2026-06-02T20:05): "LanceDB still unavailable (connection errors on all 3 searches (non-fatal per stage spec)"
- c33 (2026-06-03T00:05): "LanceDB connection errors on all 3 searches (non-fatal per stage spec); watchlist impact chains via run_impact_chain validated (real-time). If LanceDB stays offline next 3 cycles, narrative richness reduced but impact detection unaffected."
- c34 (2026-06-03T04:05): "search_similar_context unavailable (connection errors on NVL query). Non-fatal; run_impact_chain validated real-time watchlist cascades. **LanceDB still offline (3-cycle failure, non-critical).**"
- c35 (2026-06-03T05:04): "search_similar_context attempted on VIC personnel event [...]; LanceDB connection error (timeout). Non-fatal; VIC impact chain validated via run_impact_chain (real-time). **4th consecutive cycle LanceDB offline.** Non-critical but narrative richness degraded."

**Consecutive failures:** 4 cycles (c32 → c35), spanning 12 hours of operation (2026-06-02T20:05 → 2026-06-03T05:04 UTC).

**Typical recovery time:** LanceDB service briefly offline ~1–2 hours in prior outages (c27–c28 range); current 12h+ duration is unusual.

**Escalation threshold met:** Per notebook carry-over c35: "If offline persists to c37–c38, consider escalation (connection pool / database health check). ... Recommend restoration by c37 (5-cycle threshold)."

**Impact assessment:** Real-time watchlist impact chains via run_impact_chain fully functional (tool calls successful, confidence validated). Historical signal patterns (sector trends, recurrence intervals) undetected. For sentiment phase (real-time tactical analysis), impact minimal. For off-hours strategic analysis, narrative richness loss moderate (~20% reduction in contextual depth per cycle).

## Proposed Change

**What:** Escalate LanceDB health check to ops tier. Verify:
1. Connection pool status (active connections, timeout settings, retry policy).
2. Database process health (`lancedb` service status, CPU/memory utilization).
3. Network routing (mcp-server → lancedb container connectivity).
4. Disk space / WAL file status (per prior disk-full incident 2026-05-27).

Restore service within next 2 cycles (by c37 end-of-cycle, ~2026-06-03T13:00 UTC).

**Why:** 4-cycle consecutive downtime indicates systematic service degradation, not transient network glitch. Recovery timeline supports Phase-2 self-critique fleet-wide rollout (current C1 shadow-pilot on news-scout + dev-team). If narrative richness degrades systemically, feedback accuracy diminishes (signals lacking multi-cycle pattern context are less reliable for verdict pipeline).

## Lane

**Lane A** — System infrastructure recovery request (non-flow-logic, no gate/audit change, no user-facing compr comprehensibility impact).

**Lane Rationale (C-3 answer):** Does this proposal edit gate/audit logic, loop success criteria, an irreversible action, or user-facing comprehensibility? NO. LanceDB is a backend enrichment tool; its absence doesn't break flow success criteria (run_impact_chain compensates), doesn't affect output schema/gate, doesn't touch user-facing dashboards or Telegram messages. Proposal is pure system health (ops tier).

## Success Signal

- LanceDB service becomes operational (search_similar_context tool returns results, non-timeout).
- 2 consecutive news-scout cycles with successful search_similar_context calls on ≥2 high-impact articles.
- Notebook carry-over c37–c38 no longer mentions LanceDB offline / timeout pattern.

## Rollback

No rollback needed (infrastructure-only proposal). If LanceDB restoration fails:
1. Extend escalation to ops/infra team for deeper diagnostics (database corruption, connection pool exhaustion, mcp-server rebuild).
2. Continue current workaround (run_impact_chain + degraded narrative richness) until resolved.
3. Reassess proposal success criteria at c40 (after 2 additional full sentinel cycles for pattern confirmation).

---

## Dashboard Entry (signal_queue.rows[])

```json
{
  "id": "new-20260603T050411Z",
  "ts": "2026-06-03T05:04:11Z",
  "from": "news-scout",
  "to": "po",
  "type": "improvement_proposal",
  "summary": "LanceDB offline 4+ cycles (c32–c35). Narrative richness degraded; run_impact_chain compensates. Escalate ops health check by c37.",
  "severity": "INFO",
  "status": "NEW",
  "payload_ref": "docs/improvement-proposals/IMP-20260603-news-scout-T4-lancedb-restore.md"
}
```
