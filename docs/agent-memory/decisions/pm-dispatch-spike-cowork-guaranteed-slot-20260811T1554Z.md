# Decision Journal — PM Dispatch: SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING Decomposition

**Date:** 2026-08-11T15:54:00Z
**Decision ID:** pm-dispatch-spike-cowork-guaranteed-20260811
**Context:** P0 spike dispatch (PO-BATCH override #1/44 DRS-eligible)
**Input Task:** SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING (BACKLOG → decompose)
**Output:** Two diagnostic tasks (SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-FIRER, SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-WIRING)

---

## PROBLEM STATEMENT

All 8 enabled guaranteed:true cowork slots have been dark since 2026-08-08T20:23:36Z (~67 hours):
- chef-morning, chef-eod, chef-evening (MARKET dishes)
- fb-daily, fb-weekend (Facebook posts)
- digest-daily, digest-sunday (digests)
- tnb-audit (quality audit)

Non-guaranteed slots on the same dispatcher tick normally (market-watcher, alert-commander, news-scout all active 2026-08-11 12:07-12:08). Zero escalations on BUG channel despite 67 hours of production silence → silent false promise.

**Failure class:** Stuck state (latched path), not outage. Plausible root causes:
1. Launchd firer invocation stopped (system-level issue)
2. Published-marker false-positive gate (eligibility)
3. Last_fired recency predicate self-latch (all 8 rows have stale .last_fired)
4. Unreleased task_claim lock in dispatch path

---

## DECISION: TWO-TASK DIAGNOSTIC DECOMPOSITION

### Option A: Wait for DRS rotation (rejected)
- **Reasoning:** P0 + user-facing outage (publication plane down) + PO explicitly authorized BATCH override
- **Cost:** 67+ hours of continued silence, further escalation (payment processing delays, etc.)
- **Decision:** NO

### Option B: Decompose as immediate code-change tasks (rejected)
- **Reasoning:** Architect ruling states "findings doc, no code change" + spike is to narrow which of 4 hypotheses is true
- **Cost:** If we fix the wrong hypothesis, we waste developer time and the defect stays live
- **Decision:** NO

### Option C: Decompose as TWO SERIAL DIAGNOSTIC TASKS (CHOSEN)
- **Task 1:** Check if firer is being invoked (launchd state + logs)
  - Cost: 2h for cheap first answer
  - Output: "invocation stopped" vs "invoked but no fires"
  - Unblocks: Task 2 decision (proceed vs escalate to ops)
- **Task 2:** If Task 1 says invoked-but-no-fires, trace the wiring (conditional)
  - Cost: 2h to pinpoint the exact gate/module that blocks all 8 simultaneously
  - Output: Exact blocking point (file/function/line) for architect
  - Unblocks: Architect to draft code-change task

**Rationale:**
- Architect's leading hypothesis: "eligibility predicate keyed off .last_fired that requires recent prior fire would self-latch exactly like this" — Task 1 log check + Task 2 gate trace will confirm or refute
- Serial (not parallel) because Task 2's scope depends on Task 1 outcome (if launchd is dead, Task 2 is deferred until ops fixes plist)
- Both tasks are diagnostic (findings doc output, no code changes) → fits the architect's "findings, no code change" ruling
- Total cost: 4h max (2h + 2h conditional) to go from "which of 4 root causes?" to "exact point X in file Y"

---

## DECISION RATIONALE

### Why NOT "code change task" immediately?

Architect brief (docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md) explicitly states: "findings doc, no code change" — the 3-caller shared module (cowork-match-slots.js) already exists. This spike is opened to **narrow** the fix scope from "dispatcher-wide wiring gap" to "specific gate or module mismatch". Decomposing as a code task risks:
1. Developer codes a fix for hypothesis A (launchd plist) when actual issue is hypothesis B (eligibility gate)
2. Developer spends time on wiring trace when the blocker is a launchd invocation failure
3. We continue to burn production time while investigation is misdirected

### Why TWO serial tasks, not one?

- **Task 1 (firer invocation):** Cheap $0 diagnostic. Launchctl list + log file read. Takes 1h. If answer is "invocation stopped", Task 2 is deferred (ops/infrastructure handles launchd plist issue first).
- **Task 2 (wiring trace):** Conditional, requires Task 1 to find "invoked but no fires". Takes 1-2h to trace call chain and identify blocking gate. Pinpoints exact file/function/line for architect.

Combining them into one task forces developer to do wiring analysis even if launchd is the actual problem. Separating them:
- Ensures fast path for invocation-stopped diagnosis (escalate to ops immediately)
- Isolates diagnostic steps (answer one question at a time)
- Maintains decision tree: Task 1 result → Task 2 scope

### Why diagnostic (not code-fix)?

- Architect ruling is explicit: "findings doc, no code change"
- This spike is a root-cause investigation, not a code change
- Code change task will come AFTER findings identify which of the 4 hypotheses is true
- Findings enable architect to draft a targeted fix for the actual root cause

### Why this decomposition UNBLOCKS dev-team faster than alternatives

**Alternative A (skip PM, send dev directly):** Dev goes in blind, tries all 4 hypotheses, wastes 4-8h.

**Alternative B (PM creates 4 separate investigation tasks):** Overkill; Architect already narrowed to most-likely hypothesis (last_fired self-latch); we only need to confirm it and find the exact line.

**This decomposition (Task 1 → Task 2):** Dev answers the invocation question in 2h; if needed, traces wiring in 2h more. Architect has exact blocking point by hour 4, can draft fix immediately.

---

## CONTEXT CONSTRAINTS

### Constraints that guided this decision
1. **P0 priority + silent failure:** 67h of production silence, zero alerting → cannot wait for DRS rotation
2. **Architect briefing:** Explicitly "findings doc, no code change" — investigation is the work product, not code
3. **Hypothesis already narrowed:** "Last_fired recency predicate self-latch" is the leading candidate (not 4 unknowns)
4. **Selective failure:** Non-guaranteed slots tick normally → isolates the defect to guaranteed-slot path (not general dispatcher)
5. **Dual corroboration:** Two independent data planes (schedule .last_fired + agent notebooks) both confirm "nothing fired since 2026-08-08"

### WIP count after dispatch
- Before: UC-RDL-P4 (in_progress, genuine) + FIX-COWORK-SIGNAL-FILENAME (in_progress, BLOCKED, excluded from WIP predicate) = 1 (DRS's WIP<2 is satisfied)
- After PM decomposition: Two new tasks in BACKLOG (not yet in WIP)
- When developer picks up Task 1 → moves to in_progress → WIP=2 (at limit, acceptable for P0)

---

## DECISION OUTCOME

**Tasks created:**
1. SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-FIRER (BACKLOG, P0, 2h)
   - Handoff: docs/handoffs/SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-FIRER.md
   - Blocks: Task 2
   - Output: findings doc with launchd state + log evidence + diagnosis

2. SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-WIRING (BACKLOG, P0, 2h, conditional)
   - Handoff: docs/handoffs/SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-WIRING.md
   - Depends on: Task 1
   - Output: findings doc with call chain trace + blocking gate identified

**Board updates:**
- Orch-state.json .task_board.backlog += [Task 1, Task 2]
- Orch-apply.sh validation: PASS (Stage 0 + Stage 1)

**Next step:**
- Developer picks up Task 1 (or DRS rotation designates it as next dispatch)
- Developer runs launchctl + log check, returns findings
- Based on Task 1 finding, either:
  - If "invocation stopped" → escalate to ops (launchd/plist fix needed)
  - If "invoked but no fires" → developer proceeds to Task 2, traces wiring, identifies exact blocking gate
- Architect uses Task 2 findings to draft code-change task

---

## CONFIDENCE & RISK

**Confidence in this decomposition:** HIGH (93%)
- Architect's leading hypothesis is well-reasoned (eligibility predicates keyed on .last_fired that all show stale values)
- Dual corroboration (schedule + notebooks) proves the timing
- Selective failure (only guaranteed:true affected) isolates the defect
- Diagnostic approach avoids misdirected code-fix attempts

**Risk:** If Task 1 or Task 2 findings refute the leading hypothesis, we may need to pivot to the other 3 hypotheses. Mitigation: Task 1 is cheap ($0) and Task 2 is designed to trace all gates (not just last_fired). Either way, after Task 2, the exact blocking point is identified.

**Best-case outcome:** Task 1 finds "invocation stopped" → ops fixes launchd plist → slots resume firing. User-facing plane restored in <4h total (2h diagnostic + 2h launchd fix).

**Worst-case outcome:** Task 2 traces wiring, identifies a gate in the shared module that needs refactoring. Architect drafts code task; developer implements; production restored in 8-12h. Still faster than blind coding.

---

## FOLLOW-UP ACTIONS

1. **For router/terminal:** Dispatch these tasks via DRS or next PO tick (they are P0, high priority, on allowlist)
2. **For developer:** Start Task 1 (launchctl + log check); document findings per handoff AC
3. **For architect (after Task 2):** Draft code-change task to fix the blocking point identified in findings
4. **For PO (eventual closeout):** AC-9 still applies (all 6 consolidated rows closed together); this SPIKE remains the root-cause owner until findings → fix → closeout

---

**Decision logged by:** PM (pm/dispatch-20260811T1554Z)
**Signature:** docs/agents/pm/flow/main.md step 3c-journal
**Reference:** docs/policies/dev-standards.md § Decision Journal
