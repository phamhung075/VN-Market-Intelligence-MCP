# Decision Journal — Sprint 2026-06-15 · dev-mcp-server

**Sprint goal:** no active sprint goal set
**Agent:** dev-mcp-server
**Started:** 2026-06-15T16:30:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-15T16:30:00Z
**task-id:** FIX-SIGNAL-CONFIDENCE-DEFAULT-50
**what-done:** Wired real confidence into all 4 external postSignal producers (finding_data.confidence, chain.conviction, queue-count, SLA severity) via generic Math.round/*100 formula; 22 new tests; rebuilt container; live-verified spread 85/90/78/30 in named-volume DB.
**what-considered:**
- Per-producer allowlist hardcoding each source's confidence → REJECTED (violates /goal#2 generic mandate)
- Single formula `findingData.confidence * 100` for all types → REJECTED (not all producers have findingData; ask-queue/SLA have different honest signals)
- Generic: each producer's own real confidence signal, normalized → CHOSEN
- Making column NOT NULL (force error if omitted) → DEFERRED (column DEFAULT 50 kept; producers override now)
**why-decision:** Generic derivation per source type is the correct fix: chain.conviction is already 0-1, SLA severity has only 2 real values (CRITICAL/HIGH → 90/70), queue count is an honest signal for pending_questions. No fake values.
**why-change:** No plan change — task spec said GENERIC, no allowlist, which was followed exactly.
