# Decision Journal — FIX-COWORK-CHEF-SAMETICK-MUTEX

**Fix goal:** Implement unconditional same-tick CHEF mutual-exclusion to prevent duplicate MARKET posts  
**Started:** 2026-06-30T07:00:00Z  
**Status:** IMPLEMENTED

---

### STEP cowork-refactory-expert-S1 · dev-team · 2026-06-30T07:15:00Z

**what-done:** Implemented Step 4.5c in pressure-cadence.md enforcing exactly one CHEF dish per tick by dropping non-guaranteed CHEF slots when guaranteed slots coexist in MATCHES.

**what-considered:**
- Option A (chosen): Step 4.5c after pressure-mode branches complete — runs unconditionally in both adaptive and legacy modes
- Option B: Step 4b in match-slots.md before pressure branching — earlier but less precise (mode-agnostic)
- Option C: Step 5 in spawn-fanout.md — late but accessible; risk of token-claim pollution

**why-decision:** Step 4.5c runs after both pressure modes have executed, ensuring the mutex applies universally regardless of whether legacy or adaptive mode was active. Placed after Step 4.5b (freshness downgrade) so all cadence/pressure gates are complete before mutex filters.

**why-change:** Original problem statement offered 3 fixes (A/B/C); chose Fix A because it is robust and unconditional, eliminating the root-cause gap where legacy-mode cadence-bypass was not protected by mutex logic.

---

### STEP cowork-refactory-expert-S2 · dev-team · 2026-06-30T07:18:00Z

**what-done:** Identified guaranteed vs non-guaranteed CHEF slots from cowork-schedule.json: chef-morning/chef-eod/chef-evening are guaranteed (`guaranteed: true`); chef-intraday is not (`guaranteed: false, policy_id: "chef-intraday"`).

**what-considered:**
- Hardcode slot names in mutex logic — brittle, risks regression if schedule changes
- Read parallel_group + guaranteed fields at runtime (chosen) — self-synchronizing with schedule changes

**why-decision:** Runtime read from schedule.json ensures mutex definition is source-of-truth and cannot drift from the schedule.

**why-change:** No change from plan — approach is runtime-safe and resilient.

---

### STEP cowork-refactory-expert-S3 · dev-team · 2026-06-30T07:22:00Z

**what-done:** Added chef_mutex_applied flag to telemetry.md Step 6.1 payload for observability — signals when mutex filtered slots.

**what-considered:**
- Telemetry flag only — observability without debug noise
- Debug log in pressure-cadence Step 4.5c — already included inline log statement

**why-decision:** Telemetry flag in cowork-team signal is the durable artifact; log statement is runtime transient. Both included for full observability.

**why-change:** No change from plan — both observability layers are standard practice.

---

### STEP cowork-refactory-expert-S4 · dev-team · 2026-06-30T07:25:00Z

**what-done:** Committed c2c2aa9f: "fix(cowork-team): implement same-tick CHEF mutual-exclusion (FIX-COWORK-CHEF-SAMETICK-MUTEX)" with explicit pathspec (pressure-cadence.md + telemetry.md).

**what-considered:**
- Verification gate for runtime behavior — deferred per task RETURN specification; pending next 05:15Z tick
- Documentation update to pressure-cadence.md header — CHEF mutex invariant documented inline in Step 4.5c

**why-decision:** Explicit pathspec commit prevents accidental staging of dirty board; runtime verification deferred to behavioral gate per task spec (next weekday 05:15Z).

**why-change:** No change — this is standard CLAUDE.md commit protocol (explicit pathspec, no -A/-am/-a flags).

