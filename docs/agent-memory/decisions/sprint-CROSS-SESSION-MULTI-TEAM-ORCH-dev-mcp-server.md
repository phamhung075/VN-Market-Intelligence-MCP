# Decision Journal — Sprint CROSS-SESSION-MULTI-TEAM-ORCH · dev-mcp-server

**Sprint goal:** Close the same-role multi-team bug: owner_client_session is the sole authoritative ownership key for all coordination locks.
**Agent:** dev-mcp-server
**Started:** 2026-06-28T08:30:00Z

---

### DJ-GATE-1 · dev-mcp-server · 2026-06-28T10:30:00Z

**task-id:** TASK_1980 (P1-FINAL)
**what-done:** Made `owner_client_session` REQUIRED (z.string() — not optional) in all 4 coordination tool schemas; removed the owner_agent/owner_session fallback matching-ladder from heartbeatTask, releaseTask, and releaseOrphanTask in coordinationStore.ts. Updated every caller (doc .md files + TypeScript test files + production bctcRefineJob.ts scheduler) to supply the field. Wrote AC-A/B/C acceptance tests (1980-p1-final-required-flip.test.ts). TypeScript clean; 13613 tests pass; 49 pre-existing failures are unrelated.

**what-considered:**
- OPTION-A (remove fallback immediately, clean break): chosen. All callers audited and updated in this session before removing the fallback. No caller is left without the field.
- OPTION-B (keep soft fallback as an escape hatch): rejected per PO-mandated locked gate (po-S2). A permanent owner_agent rung silently re-opens the same-role multi-team bug: two sessions with the same owner_agent both fall through to role-match and can cross-heartbeat each other's locks.
- Pre-P1 rows with NULL owner_client_session become unmatchable by new ownership checks → they expire naturally via TTL and are GC'd. This is intentional and documented.

**why-decision:** PO locked this gate as non-negotiable (po-S2). The same-role multi-team bug is a silent data-race: no error, no log, just a wrong session releasing another session's lock. The only fix is a sole-key match: `WHERE task_id=? AND owner_client_session=?`. Any fallback re-opens the race.

**why-change:** Point-of-no-return. After TASK_1974-1979 verified all callers supply the field, removing the fallback is safe. Keeping it would permanently defer the bug fix.

**security-note:** owner_client_session is a coordination key — never echoed to logs or Telegram. Implementation confirmed: it is stored in DB and used in WHERE clauses only; never returned in health probes or log lines.
