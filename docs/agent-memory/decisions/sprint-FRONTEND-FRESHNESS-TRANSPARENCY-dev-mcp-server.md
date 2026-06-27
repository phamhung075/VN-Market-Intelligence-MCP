# Decision Journal — Sprint FRONTEND-FRESHNESS-TRANSPARENCY · dev-mcp-server

**Sprint goal:** Backend L2 data_asof contract for 5 handlers; unblock frontend FreshnessBadge
**Agent:** dev-mcp-server
**Started:** 2026-06-27T20:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-27T20:15:00Z
**task-id:** TASK-FFT-L2
**what-done:** Added data_asof field to 5 handlers using real DB timestamp columns, with empty-sentinel guard in priceHistoryHandler.
**what-considered:**
- Use architect's spec columns verbatim (generated_at/created_at) — would fail: columns don't exist
- Use actual live schema columns (sent_at/triggered_at/updated_at/pushed_at) — correct per contract-from-live-payload rule
**why-decision:** Memory note "Contract from live payload not schema comment" — probed schemas directly, found 3 spec discrepancies (market_summaries.generated_at→market_messages.sent_at; vps_push_log.created_at→pushed_at; alerts.updated_at→triggered_at).
**why-change:** Spec inaccuracies corrected silently; rationale documented in handoff.
