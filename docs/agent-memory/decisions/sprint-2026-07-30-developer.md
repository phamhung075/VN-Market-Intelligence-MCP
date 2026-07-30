# Decision Journal — Sprint 2026-07-30 · developer

**Sprint goal:** no active sprint entry found in orch-state.json — ambient/BOUNDED-1 pickup work.
**Agent:** developer
**Started:** 2026-07-30T12:30:00Z

---

### STEP developer-S1 · developer · 2026-07-30T12:40:00Z
**task-id:** FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS
**what-done:** Empirically reproduced (2 in-process scripts, before any code edit) BOTH candidate mechanisms named in the task's SCOPE, plus discovered a distinct 3rd variant of the same class.
**what-considered:**
- Assume the SCOPE hypothesis (thrown-error text ignored) and fix only mcp-call.sh — rejected: would have missed the dedup-suppression `id<=0` fallthrough, which is reproducible with ZERO db corruption and is the more general root cause.
- Fix only agentSignalTools.ts (tool side) — rejected: `_run_e1()` still trusted `mcp_call` rc alone with no JSON-body/read-back check, so signals_posted would still over-count on any future tool-contract regression.
**why-decision:** AC-1 explicitly demands empirical determination "before changing code" — ran 3 monkeypatch repro scripts (dedup no-op, forced INSERT throw) confirming: (a) `id<=0` dedup fallthrough → `success:true,signal_id:-1`; (b) thrown DB error → `Error:` text with `isError` unset, silently accepted by `mcp_call`'s isError-only check. Fixed all 3 layers (tool, shared caller, E-1 read-back) rather than one, per AC-2's explicit "read-back, never a call tally" wording.
**why-change:** no change from plan — scope grew from "1 of 2 hypothesized mechanisms" to "both, plus a 3rd sibling variant", all within the same task's AC-1..AC-4, not scope creep into unrelated code.
