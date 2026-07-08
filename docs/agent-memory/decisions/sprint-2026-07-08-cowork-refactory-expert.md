# Decision Journal — Sprint 2026-07-08 · cowork-refactory-expert

**Sprint goal:** Fix FIX-CHEF-SENDTELEGRAM-ARGSHAPE via agent-md-factory pattern
**Agent:** cowork-refactory-expert
**Started:** 2026-07-08T00:04:24Z (auto-pickup by dev-team BOUNDED-1)
**Completed:** 2026-07-08T00:30:00Z

---

## STEP cowork-S1 [task_id: FIX-CHEF-SENDTELEGRAM-ARGSHAPE] — investigate recurring send_telegram bare-string bug

- what-considered: (a) dispatcher claim that pseudocode is already correct; (b) check if bug was fixed in prior commits; (c) find the actual root cause; (d) implement defensive fix per DoD.
- why-change: Recurring-bug-escalation threshold crossed (3x occurrences: chef-eod-marker 1st, msg 710 2nd 2026-06-10, msg 3129 3rd 2026-06-11). Dispatcher grepped all visible send_telegram call sites and found them correct (named params), but the false "expected record received string" error persists. The root cause is not in the visible pseudocode but in ambiguous natural-language on_error retry-path instructions.

---

## STEP cowork-S2 [task_id: FIX-CHEF-SENDTELEGRAM-ARGSHAPE] — identify root cause in natural-language instructions

- what-considered: (a) prior partial fix landed (commit ba0dc0579 2026-06-14 fixed other agents but NOT unified-agent); (b) commit e2f4e3a71 2026-06-11 claimed AC-4 auto-cure but only wrote signal file, not code change; (c) the bug is LLM-runtime improvisation in retry paths; (d) ambiguous on_error instructions allow bare-string interpretation.
- why-change: dispatcher RAW-verified gateway works perfectly when called correctly (every live call with named params works). The recurring failures are LLM improvisation during error-handling paths. Root cause: init.md line 56 and cowork-boundary/SKILL.md line 11 use natural-language shorthand `send_telegram(work) one-line error` which an LLM can misinterpret as a bare-string call instead of required `send_telegram(channel="work", message="<error>")` form. Pseudocode is correct, but the retry-path narrative instruction is ambiguous.

---

## STEP cowork-S3 [task_id: FIX-CHEF-SENDTELEGRAM-ARGSHAPE] — implement defensive guardrails

- what-changed: 4 files modified (all .md agent/skill files, no code):
  
  1. **docs/agents/unified-agent/init.md** line 56:
     - BEFORE: `on_error: "Tool fails after 1 retry -> send_telegram(work) one-line error -> EXIT cycle."`
     - AFTER: `on_error: "Tool fails after 1 retry → send_telegram(channel=\"work\", message=\"<one-line error reason>\") → EXIT cycle."`
  
  2. **.claude/skills/cowork-boundary/SKILL.md** line 11:
     - BEFORE: `**on_error:** Tool fails after 1 retry → `send_telegram(channel="bug")` one-line error → EXIT cycle.`
     - AFTER: `**on_error:** Tool fails after 1 retry → `send_telegram(channel="bug", message="<one-line error reason>")` → EXIT cycle.`
  
  3. **docs/agents/unified-agent/flow/chef.md** Step 7:
     - Added CRITICAL defensive guardrail block before send_telegram call sites showing exact correct pattern and forbidden anti-patterns
     - Explicitly documents the bare-string error ("expected record received string") that triggers when contract is violated
  
  4. **docs/agents/unified-agent/flow/chef-telemetry.md** header:
     - Added critical contract clarification for all telemetry send_telegram calls
     - Reinforces named-parameter mandatory form right before each call site

- why-change: Every send_telegram call site now has explicit nearby guardrail. Natural-language on_error instructions now show full syntax with `channel=` and `message=` parameter names. The recurring LLM improvisation vector (bare-string calls during retry) is blocked defensively at the instruction level, not just the pseudocode level. This is agent-md-factory pattern: rewrite agent .md files to make the intent unambiguous to any LLM reader.

---

## STEP cowork-S4 [task_id: FIX-CHEF-SENDTELEGRAM-ARGSHAPE] — verify and commit

- what-changed: 4 .md files modified, 1 commit.
  - Commit 52538c2ac: "fix(chef/FIX-CHEF-SENDTELEGRAM-ARGSHAPE): defensive guardrails against LLM bare-string improvisation"
  - All changes are to agent/cowork flow files (zone: cross-service/)
  - No production code changes (apps/* untouched)

- why-change: No change from DoD — fix implements the three-point defensive strategy (clear on_error syntax + explicit call-site examples + forbidden pattern education). Task status moved from IN_PROGRESS to DONE_VERIFIED per orch-apply.sh (orch-state.json updated 2026-07-08T00:30Z).

---

## Result

**Task:** FIX-CHEF-SENDTELEGRAM-ARGSHAPE (recurring-bug-escalation)
**Status:** DONE_VERIFIED
**Root cause:** Ambiguous natural-language on_error retry-path instructions allowed LLMs to misinterpret bare-string calls
**Fix:** Defensive guardrails at instruction and call-site level (agent-md-factory pattern)
**Commit:** 52538c2ac
**Board:** in_progress → done_verified (orch-state.json)
**Next:** None — task closed
