---
sprint: SPIKE-COWORK-GUARANTEED-SLOT
branch: spike/guaranteed-slot-diagnostic-wiring
size: S
zone: cross-service/
depends_on: ["SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-FIRER"]
blocks: []
---

## TLDR

Diagnose the guaranteed-slot dispatcher wiring gap IF Task 1 findings show "invoked but no fires". Trace the call chain from cowork-dispatcher through guaranteed-slot backstop wiring to cowork-match-slots.js, identify the exact point where fires are being blocked (published-marker gate, last_fired predicate, unreleased lock, etc.), and document root cause. If Task 1 finds "invocation stopped", this task is deferred (ops/infrastructure handles launchd plist issue first).

---

## [PM] Planning Context

### Zone
**cross-service/** — Guaranteed-slot dispatcher wiring (shared cowork-dispatcher logic)

### Acceptance Criteria (Task 1 dependency: only runs if Task 1 finds "invoked but no fires")
- [ ] If Task 1 finding is "Invocation stopped": Mark this task as DEFERRED with note "Awaiting Task 1 ops escalation resolution; if launchd issue fixed and fires still blocked, this task resumes"
- [ ] If Task 1 finding is "Invoked but no fires": **Proceed with wiring trace:**
  - [ ] Call chain fully traced: cowork-dispatcher → guaranteed-slot-firer → cowork-match-slots.js (3-caller shared module)
  - [ ] Each step documented: function names, file paths, line numbers
  - [ ] Eligibility gates identified: all predicates checked
    - Published-marker gate: does `published:<slot-kind>:<period>` exist and block re-fire?
    - Last_fired gate: does last_fired predicate require recent prior fire, self-latching on stale value?
    - Task-claim lock: is there an unreleased task_claim in the dispatch path?
  - [ ] Shared module arguments verified: does guaranteed-slot caller pass all required args to cowork-match-slots.js?
  - [ ] Exact blocking point identified with evidence (code snippet, log output, or state check)
- [ ] Two-page findings doc created: `docs/data/cowork-guaranteed-slot-findings-wiring-diagnosis-20260811.md`
  - Section 1: Call chain diagram (text or ASCII)
  - Section 2: Each gate's state (published marker status, last_fired values, lock state)
  - Section 3: Exact blocking point (which gate/line blocks the fire)
  - Section 4: Root cause hypothesis (gap in 3-caller module? gate logic? lock state?)
  - Section 5: Recommendation for architect (code fix needed? wiring change? lock release?)
- [ ] Ready for architect: findings identify exactly which file/function/line needs change

### Files to read first
- **scripts/agents-flow/cowork-guaranteed-slot-firer.sh** (the firer; call chain entry point)
- **apps/mcp-server/src/cowork-dispatcher.ts** (guaranteed-slot backstop wiring)
- **apps/mcp-server/src/cowork-match-slots.js** (the 3-caller shared module; its callsites in guaranteed-slot path)
- **docs/data/cowork-schedule.json** (current state: all 8 rows, .last_fired, _superseded_by fields)
- **docs/standards/task-lock/SKILL.md** (if investigating lock issues)

### Files to create
- **docs/data/cowork-guaranteed-slot-findings-wiring-diagnosis-20260811.md** — findings doc (call chain, gate analysis, blocking point, recommendation)

### Files to modify
- None (this is a diagnostic task; no code changes)

### Dependencies
- **SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-FIRER** (Task 1 must complete and find "invoked but no fires"; if Task 1 finds "invocation stopped", this task defers)

### Blockers unblocked by this task
- None directly; findings enable architect to create code-change task

### Knowledge needed
- TypeScript/JavaScript code reading (cowork-dispatcher, cowork-match-slots)
- Task-lock protocol (docs/standards/task-lock/SKILL.md)
- Cowork signal flow (docs/standards/mcp-tools.md § Signal Bus)
- docs/policies/dev-standards.md § Git conventions

---

## [PM] Background

### Why This Task Exists
Task 1 (firer invocation check) is the cheap $0 diagnostic. If it finds the firer IS invoked but fires still don't happen, this task narrows the root cause from "dispatcher-wide wiring gap" to "specific blocking gate or module mismatch". Architect brief (docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md) explicitly marks this as "findings doc, no code change" — the shared module exists; this task identifies which of its 3 callers is misconfigured or which gate logic is broken.

### The Hypotheses to Test
1. **Published-marker false-positive:** If a published:<slot-kind>:<period> marker exists from a prior failed fire, it blocks all re-fires (eligibility gate keyed off marker presence)
2. **Last_fired self-latch:** If an eligibility predicate requires .last_fired to be recent, and .last_fired is stale on all 8 rows, predicate self-latches (all 8 rows excluded simultaneously — matches the exact symptom)
3. **Unreleased task_claim:** If the guaranteed-slot firer claims a task_id but never releases it, subsequent fires fail (stale lock blocks new fire)
4. **Shared module caller mismatch:** If the guaranteed-slot backstop passes wrong args to cowork-match-slots.js (missing required field, wrong type), the module rejects the call (but logs the failure, which Task 1 would have seen)

### Evidence This Task Depends On
- Task 1 findings: launchd confirms invocation occurred; logs confirm the firer was called
- If Task 1 instead finds "invocation stopped": this task doesn't run; ops/infrastructure fixes launchd/plist first

### Related Architecture
- **Shared module:** apps/mcp-server/src/cowork-match-slots.js (3 existing callers; guaranteed-slot is the 4th or reuses one)
- **Catch-up epic:** BA-COWORK-GUARANTEED-SLOT-CATCHUP (FR-1..9 work extends the shared module; this findings task is a subset)
- **Lock protocol:** docs/standards/task-lock/SKILL.md (if investigating unreleased locks)

### User-Facing Impact
All 8 guaranteed:true slots dark for 67 hours → zero MARKET dishes, FB posts, digests, quality audit. Every user-facing notification from VN-Market is down. This task's findings enable the architect to draft a fast fix.

---

## [Developer] Checklist

### Prerequisites (check Task 1 output first!)
- [ ] Task 1 (SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-FIRER) is complete
- [ ] Task 1 findings say: **"Invoked but no fires"** (if it says "invocation stopped", this task is deferred)
- [ ] You have the launchd confirmation and log evidence from Task 1

### Investigation Steps

1. **Understand the Call Chain**
   - Read scripts/agents-flow/cowork-guaranteed-slot-firer.sh
   - What function does it call? (find the main entry point)
   - What args does it pass?
   - Trace into apps/mcp-server/src/cowork-dispatcher.ts (or wherever the backstop logic lives)

2. **Identify All Eligibility Gates**
   - Look for any predicate that checks:
     - `published:<kind>:<period>` marker exists
     - `.last_fired` recency (is recent? is within N days?)
     - task_claim lock state
     - Any other conditional block
   - For each gate, document:
     - File and line number
     - The condition being checked
     - What happens if condition fails

3. **Check Gate State Against Stale Data**
   - Read docs/data/cowork-schedule.json
   - For each of the 8 guaranteed:true slots:
     - What is `.last_fired` value? (all are stale, pre-2026-08-08)
     - What is `._superseded_by` value? (all should be empty or "cowork-dispatcher")
     - Is there a published:<slot-kind>:<period> marker? (check task locks or signal queue)
   - Hypothesis test: if a gate checks "last_fired must be recent", would all 8 slots simultaneously fail? YES → this is the blocker

4. **Trace the Shared Module Call**
   - Find apps/mcp-server/src/cowork-match-slots.js
   - What are its function signatures? (which function is called for guaranteed slots?)
   - What are the required arguments?
   - Find the call from the guaranteed-slot backstop wiring
   - Are all required args being passed? Are types correct?
   - Does the call have a dispatch or retry loop?

5. **Check for Stale Locks**
   - If investigating task_claim gates:
     - Read docs/standards/task-lock/SKILL.md
     - Check if any `task:<slot-id>` locks exist from before 2026-08-08
     - Are they held by a dead session?
     - Is there a release pattern in the code that should have fired but didn't?

6. **Pinpoint the Exact Block**
   - Of all the gates/conditions you found, which one(s) would cause ALL 8 guaranteed slots to simultaneously stop firing?
   - Verify your diagnosis: if you fix/bypass this gate, would the slots fire? (sanity check)
   - Evidence: code snippet, logic flow, or state check that proves the block

7. **Write Findings Doc**
   - Create `docs/data/cowork-guaranteed-slot-findings-wiring-diagnosis-20260811.md`
   - **Section 1: Call Chain Diagram**
     ```
     cowork-guaranteed-slot-firer.sh
       ↓ calls [function X]
     cowork-dispatcher.ts [func X, line NNN]
       ↓ checks gates (A, B, C)
     cowork-match-slots.js [func Y, line MMM]
       ↓ returns fire/no-fire decision
     ```
   - **Section 2: Gate Analysis**
     - Gate A (line NNN): checks `published:<kind>:<period>` exists? State: [current state] | Blocks all 8? NO/YES
     - Gate B (line MMM): checks `.last_fired` recent? State: [all .last_fired stale] | Blocks all 8? YES ← **← BLOCKER**
     - Gate C (line PPP): checks task_claim unreleased? State: [check for stale locks] | Blocks all 8? NO/YES
   - **Section 3: Root Cause**
     - "Gate B (last_fired recency check in cowork-match-slots.js:MMM) is the blocker. All 8 guaranteed slots have .last_fired pre-2026-08-08. The gate logic requires last_fired to be within N hours/days, causing all 8 to be permanently excluded. This is a self-latching predicate: once a slot misses once, if that slot's fire is gated by its own most-recent fire being recent, it can never recover."
   - **Section 4: Recommendation**
     - "For guaranteed slots, either: (A) remove the last_fired recency check (guaranteed should always fire on cron), (B) add a special-case bypass for guaranteed:true slots, or (C) add a recovery mechanism that resets last_fired on first missed fire attempt."
     - "Recommended: (A) or (B), since guaranteed:true semantics already mean 'must fire' regardless of prior history."

8. **Commit & Move to REVIEW**
   - Commit findings doc: `git add docs/data/cowork-guaranteed-slot-findings-wiring-diagnosis-20260811.md`
   - Commit message per docs/policies/commit-convention.md
   - Update task to REVIEW (via pm/po)

---

## [QA] Review Criteria

- [ ] Call chain is fully traced (entry point to decision point documented)
- [ ] All gates are identified and documented (no missing conditions)
- [ ] Gate state is verified against actual docs/data/cowork-schedule.json data
- [ ] Exact blocking gate is identified and justified (why this one blocks all 8 simultaneously)
- [ ] Code snippet or line reference supports the diagnosis
- [ ] Recommendation is actionable (architect can turn it into a code task)
- [ ] Findings doc is self-contained (can be read independently)
- [ ] Hypothesis from Task 1 ("last_fired self-latch") is either confirmed or eliminated

---

## Decision Point: When to Run This Task

- **If Task 1 says "Invocation stopped":** STOP here. Defer this task. Ops/infrastructure will fix launchd/plist issue first. If fires still block after plist is fixed, resume this task then.
- **If Task 1 says "Invoked but no fires":** Proceed immediately (this task is unblocked).

---

## Open Questions for Developer

- Which version of cowork-dispatcher.ts has the guaranteed-slot backstop logic? (brief references 2026-07-22; code may be stale)
- How recently was cowork-match-slots.js modified? (is it carrying a pre-2026-08-08 gate that's now broken for guaranteed slots?)
- Do any system logs or MCP server output logs show "guaranteed-slot fire blocked" or similar? (Task 1 findings should hint at this)

---

**End Handoff**
