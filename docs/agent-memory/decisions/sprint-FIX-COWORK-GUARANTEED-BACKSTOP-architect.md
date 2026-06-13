# Decision Journal — Sprint FIX-COWORK-GUARANTEED-BACKSTOP · architect

**Sprint goal:** Restore session-independent backstop for guaranteed cowork slots (5th recurrence)
**Agent:** architect
**Started:** 2026-06-13T00:00:00Z

---

### STEP architect-S1 · architect · 2026-06-13T21:00Z
**task-id:** FIX-COWORK-GUARANTEED-BACKSTOP
**what-done:** Selected Option A (restore Layer-A RemoteTriggers for 5 guaranteed slots) and authored architecture brief docs/architecture-briefs/2026-06-13-cowork-guaranteed-backstop.md.
**what-considered:**
- Option C (make Layer B durable via launchd plist): off the table — no proven persistence mechanism exists; launchd plist approach requires a separate spike before trust; observed failure mode matches exactly.
- Option B (silence-watchdog): watchdog itself needs session-independent trigger, which means it IS Option A at one level of indirection — adds 20+ min latency without closing the root; G3 not satisfied.
- Option A (restore RemoteTriggers): closes root directly; dedup already designed in sprint 1951 §7 via last_fired wall-clock gate; coexistence rules are proven (24h parallel-run in sprint 1957a).
**why-decision:** Option A is the only path that satisfies G3 (session-restart survival without manual re-arm). B is A in disguise with latency. C lacks a concrete persistence mechanism.
**why-change:** No change from logical analysis; constraint was that §9 gate was premature — this restores the backstop that was removed too early.
