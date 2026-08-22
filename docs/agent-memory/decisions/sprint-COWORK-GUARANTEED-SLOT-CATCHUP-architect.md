# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · architect

**Sprint goal:** no goal set
**Agent:** architect
**Started:** 2026-08-22T19:02:00Z

---

### STEP architect-S1 · architect · 2026-08-22T19:02:00Z
**task-id:** FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST
**what-done:** Ratified BA's two-stage inner-DESC/outer-ASC SQL wrap for `getConvictionHistoryRows()`; resolved NFR-2 durable-freshness trade-off.
**what-considered:**
- NFR-2 (a) calendar-day window vs (b) keep absolute-row LIMIT
- (a) would decouple rows-returned from client `?limit=` value — conflicts with BA's own §6 Scope Out lock on `?limit=[1,2000]` clamp semantics (store's `limit` param IS the client's limit, passed straight through)
**why-decision:** (b) preserves the locked API contract with zero risk to AC-14; (a) is structurally incompatible with a constraint BA itself wrote into the same spec, not just a lower-priority option — recommended a follow-up monitoring row (reusing existing `checkConvictionHistoryGap.ts` audit-check plumbing) instead of building it into this S-size task.
**why-change:** no change from BA's FR-1 SQL shape; NFR-2 resolved as BA explicitly deferred to architect.

### STEP architect-S2 · architect · 2026-08-22T19:02:00Z
**task-id:** FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD
**what-done:** Ratified BA's one-line subquery non-null guard for `queryForeignFlow()` verbatim; designed AC-15 regression + 2 edge-case tests (all-NULL table-wide, consecutive NULL-only days).
**what-considered:** only path — BA's spec already named the exact fix (file's own docstring states the intended contract); no alternative design considered.
**why-decision:** confirmed live via code read: subquery lacks the guard, outer guard fires too late; verified SQLite three-valued-logic guarantees the all-NULL edge case degrades to the existing empty-response path with no special-case code.
**why-change:** no change from BA's plan.
