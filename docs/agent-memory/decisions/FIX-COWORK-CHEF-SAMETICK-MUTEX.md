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

---

### STEP cowork-refactory-expert-S5 · dev-team · 2026-06-30T09:05:00Z

**what-done:** CRITICAL: RAW-verified that initial Step 4.5c implementation was non-functional. Wrote comprehensive test harness proving two bugs prevent mutex from firing.

**what-considered:**
- Run existing test harness from coordinator → confirmed bugs
- Write independent test harness (chosen) → comprehensive coverage of all 3 cases

**why-decision:** Independent test harness proves bugs empirically and validates corrected implementation. Three test cases cover (1) double-publish scenario, (2) safe solo non-guaranteed, (3) no false-drop of guaranteed.

**why-change:** Discovery changed from "IMPLEMENTED and ready for runtime verification" to "NON-FUNCTIONAL, requires correction". Root cause: two shell-integration bugs made mutex condition always false.

---

### STEP cowork-refactory-expert-S6 · dev-team · 2026-06-30T09:10:00Z

**what-done:** Identified and documented two critical bugs in Step 4.5c (pressure-cadence.md lines 140–150):
  - BUG 1: Uppercase AND in jq select() → jq compile error. jq uses lowercase 'and'.
  - BUG 2: xargs/paste pattern for IN-list → produces single junk element ["chef-morning chef-eod chef-evening"] instead of three proper array elements → membership check always fails → HAS_GUARANTEED=false → mutex never fires.

**what-considered:**
- Quick patch: only fix uppercase AND, keep xargs/paste
- Complete rewrite: jq-native with --argjson (chosen) — eliminates shell string concat entirely

**why-decision:** Shell string concatenation in jq IN() arguments is inherently fragile. jq-native approach with --argjson array passing is the only robust pattern: arrays built in jq, passed safely via --argjson, membership checked via jq index(). Zero shell interpolation risk.

**why-change:** Initial design used shell loops; corrected to pure jq logic (same functional outcome, safe integration, no shell pitfalls).

---

### STEP cowork-refactory-expert-S7 · dev-team · 2026-06-30T09:15:00Z

**what-done:** Rewrote Step 4.5c using jq-native pattern:
  - G_ARR=$(... | jq -c '[.slots[] | select(.parallel_group=="chef" and .guaranteed==true) | .slot_id]')
  - HAS_GUARANTEED=$(... | jq --argjson g "$G_ARR" 'any(.[]; ... ($g | index($s)) != null)')
  - Filtering: jq 'map(select(... | ($ng | index($s)) == null))'

**what-considered:**
- Minimal patch (fix AND only) — leaves BUG 2 in place
- Full rewrite with jq-native arrays (chosen) — eliminates entire class of string-concat bugs

**why-decision:** Root cause is shell string manipulation inside jq constructs. Jq-native arrays (built in jq, passed via --argjson) is the standard safe pattern. Zero string interpolation, zero xargs fragility.

**why-change:** Initial implementation violated jq best-practices; corrected to pure jq logic.

---

### STEP cowork-refactory-expert-S8 · dev-team · 2026-06-30T09:18:00Z

**what-done:** Validated corrected Step 4.5c against comprehensive test harness covering all three cases:
  ✓ CASE 1 PASS: chef-morning + chef-intraday matched → mutex fires, kept=[chef-morning], dropped=[chef-intraday]
  ✓ CASE 2 PASS: Only chef-intraday → mutex does NOT fire, chef-intraday retained (safe to publish alone)
  ✓ CASE 3 PASS: Only chef-morning → mutex does NOT fire, no false drop, chef-morning retained

**what-considered:**
- Empirical validation only (run tests, observe)
- Formal proof (chosen) — test harness output is the contract evidence

**why-decision:** Three test cases prove: (a) mutex works when intended, (b) no false-positives, (c) no regressions when only one slot matches.

**why-change:** Status: from NON-FUNCTIONAL to CORRECTED & VALIDATED.

---

### STEP cowork-refactory-expert-S9 · dev-team · 2026-06-30T09:22:00Z

**what-done:** Committed 6d080acf: "fix(cowork-team): rewrite Step 4.5c CHEF mutex with jq-native" documenting both bugs, the jq-native fix, and test coverage (all 3 cases PASS).

**what-considered:**
- Amend previous commit c2c2aa9f — rejects per CLAUDE.md (create new commit for corrections)
- New commit on top (chosen) — maintains audit trail; clear separation of buggy vs corrected

**why-decision:** New commit makes bug discovery + correction explicit in git log. Easier to bisect issues and understand the correction rationale.

**why-change:** Commit protocol change from attempted amendment to sequential correction commit.

