---
sprint: FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER
branch: fix/CWKSCH-1-last-fired-monotonic-guard
size: S
zone: docs/agents/cowork-team/flow/
depends_on: []
blocks: ["TASK-CWKSCH-2"]
---

## TLDR
Update `docs/agents/cowork-team/flow/last-fired.md` Step 5b to add a monotonic guard on line 28 of the in-memory update loop. The guard prevents concurrent writers from clobbering fresher `last_fired` timestamps with stale values. Replace unconditional `slot.last_fired = FIRED_AT` with a 3-line guard: write only if `currentLastFired === null OR FIRED_AT > currentLastFired` (ISO-8601 lexicographic compare for UTC strings).

## [PM] Planning Context

### Zone
- **Zone:** `docs/agents/cowork-team/flow/`
- **Build-standard:** Not applicable (flow-doc update, no production code)

### Acceptance Criteria
- [ ] Line 28 of Step 5b update loop replaced with FR-4 monotonic guard (3 lines total)
- [ ] Guard handles null first-run case (NFR-4): `if currentLastFired === null → always write`
- [ ] Pseudo-code uses ISO-8601 lexicographic string compare (no Date parsing)
- [ ] Step 5b header comment clarifies "single-slot CAS + monotonic forward-only write" semantics
- [ ] Non-fatal error contract unchanged (guard inside try block)
- [ ] No structural change to `cowork-schedule.json` (NFR-3)

### Files to read first
- `docs/agents/cowork-team/flow/last-fired.md:1-42` — current Step 5b pseudo-code, lines to modify
- `docs/architecture-briefs/2026-06-18-cowork-schedule-stale-base-clobber.md:43-67` — monotonic guard design + pseudocode template
- `docs/handoffs/FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER-BA-spec.md:89-96` — FR-4 functional requirement

### Files to modify
- `docs/agents/cowork-team/flow/last-fired.md:28` — replace line with monotonic guard (3 lines)
- `docs/agents/cowork-team/flow/last-fired.md:4-10` — clarify Step 5b semantics in header comment

### Files to create
- None

### Dependencies
- None (independent flow-doc change)

### Knowledge needed
- `docs/architecture-briefs/2026-06-18-cowork-schedule-stale-base-clobber.md` § Monotonic Guard Design
- ISO-8601 UTC string lexicographic comparison (e.g. "2026-06-18T03:00:00Z" > "2026-06-18T02:00:00Z")
- FR-4 requirement from BA spec

### Verification
1. Read the updated Step 5b; verify the guard condition is present and correct
2. Verify null handling: `if currentLastFired === null → always write` branch is explicit
3. Verify no Date object creation (ISO strings compare lexicographically, valid for UTC)
4. Verify non-fatal contract: guard is inside the try block

---

## Context

### Root Cause
`docs/data/cowork-schedule.json` carries the `last_fired` ledger for all 17 scheduler slots. A writer (cowork-team dispatcher) holds a STALE in-memory snapshot and writes the ENTIRE file back, clobbering `last_fired` stamps of every slot it did not update in that tick. Evidence 2026-06-18T04:07Z: multiple slots reverted to 3-day-old values despite fresh stamps earlier in the day. Effect: adaptive cadence due-check reads stale elapsed times and triggers spurious re-fires (doublefire class).

### Why This Fix
The monotonic guard is FR-4 (functional requirement). It makes the write idempotent and forward-only: a writer MUST NOT decrease any slot's `last_fired` value. If the live-read value for a slot is already newer than FIRED_AT, leave it unchanged. This is the direct fix for the stale-base clobber pattern, applied at the point of write (Step 5b in-memory update loop).

### Architecture Rationale
- **ARCH-RATIFY-CWKSCH-2 resolved:** flow-doc spec update only; no shared helper script. The write loop executes as Claude Code agent prose, not a Node.js helper.
- **Fresh-read (FR-1):** already present in Step 5b (readFileSync inside the try block)
- **Atomic temp→rename (FR-3):** already correct in Step 5b
- **Single-slot CAS (FR-2):** reinforced by guard: only mutate if the guard passes
- **Monotonic guard (FR-4):** THIS TASK — the missing piece

### Risk Flags
None specific to this task. The guard is a 3-line addition, tested indirectly via T-14b in TASK-CWKSCH-2 (the adversarial case: stale stamp rejected by guard → RED without guard, GREEN with guard).

---

## Handoff Notes

**Developer:** dev-mcp-server (owns the cowork-team flow zone per zone-enforcement refactor)

**AC Trailer:** When complete, commit with:
```
Task: TASK-CWKSCH-1
AC: Monotonic guard replaces line 28; null handling explicit; non-fatal contract unchanged
```

**Dependencies:** Must complete BEFORE TASK-CWKSCH-2 (the test task depends on reading this flow-doc update to understand the guard shape).

**Blockers:** None. This is a standalone flow-doc change that does not require code review from other agents.

---

## [Developer] Implementation Notes

1. Read `docs/agents/cowork-team/flow/last-fired.md` lines 15-42 (the Step 5b pseudo-code block).
2. Replace line 28 (`slot.last_fired = FIRED_AT`) with the FR-4 monotonic guard:
   ```
   currentLastFired = slot.last_fired
   if currentLastFired === null OR FIRED_AT > currentLastFired:
     slot.last_fired = FIRED_AT
   ```
   (The comment `# else: sibling already wrote a fresher stamp — leave unchanged` is optional but recommended for clarity.)
3. Update the Step 5b header comment (lines 5-10) to add: "Single-slot CAS + monotonic forward-only write: no slot's last_fired ever decreases."
4. Verify the guard is inside the try block (it is; no scope change needed).
5. No other files change. The atomic temp→rename path (lines 31-32) is untouched.
6. Self-verify: read the updated pseudo-code; mentally trace a stale-base scenario (Writer-A reads FIRED_B, Writer-A fires with FIRED_A < FIRED_B, guard blocks → slot stays FIRED_B). ✓
