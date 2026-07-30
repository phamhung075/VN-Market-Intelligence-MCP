---
sprint: COWORK-DISPATCH-ROUTER-INTENT-MUTEX
task_id: TASK-COWORK-MUTEX-003
branch: task/cowork-mutex-003-annotation
size: S
zone: cross-service/
depends_on: [TASK-COWORK-MUTEX-001]
blocks: []
---

## TLDR

Add cross-reference annotation to `docs/agents/cowork-team/flow/spawn-fanout.md` § Published marker gate comment (1-2 lines). Point future maintainers to the new Step 2.4 collision probe in dispatch-claim/SKILL.md so they know the marker-key logic has a router-side consumer that uses prefix-match (not exact-key), requiring no change here if the marker-key format shifts.

## [PM] Planning Context

- **Zone:** cross-service/ (cowork-team flow documentation layer, non-dev-code)
- **Acceptance Criteria:**
  - [ ] Location: `docs/agents/cowork-team/flow/spawn-fanout.md` § Published marker gate (find the comment describing the marker-key format, e.g., "published:<slot_id>:<period>")
  - [ ] Add 1-2 line comment pointing to `.claude/skills/dispatch-claim/SKILL.md § Step 2.4 — Cowork-Slot Cross-Path Collision Probe`
  - [ ] Comment explains: "Router-side collision probe reads this marker via prefix match on 'published:<slot_id>:' (not exact-key), so changes to the period format/cadence do NOT require router-side updates."
  - [ ] No logic changes (cross-reference annotation only)
  - [ ] Confirm file is readable/editable (not a symlink or generated artifact)

- **Files to read first:**
  - `docs/agents/cowork-team/flow/spawn-fanout.md` § Published marker gate (current comment, find insertion point)
  - `docs/architecture-briefs/2026-07-29-fix-cowork-dispatch-router-intent-mutex-bypass-design.md` § §3 File-level design (item 4 — describes what to add)
  - `.claude/skills/dispatch-claim/SKILL.md` § Step 2.4 (from TASK-COWORK-MUTEX-001, to know exact section name)

- **Files to create:** None

- **Files to modify:**
  - `docs/agents/cowork-team/flow/spawn-fanout.md` — add 1-2 line comment in § Published marker gate

- **Dependencies:** TASK-COWORK-MUTEX-001 (Step 2.4 must exist before referencing it; can run in parallel after task 1 is complete)

- **Knowledge needed:**
  - `docs/architecture-briefs/2026-07-29-fix-cowork-dispatch-router-intent-mutex-bypass-design.md` § §3 item 4 (exact guidance)
  - `docs/agents/cowork-team/flow/spawn-fanout.md` structure (know where § Published marker gate lives, ~line TBD)

## Annotation Text

Reference the section added by TASK-COWORK-MUTEX-001 exactly:

```
# Cross-ref: The router-side Step 2.4 collision probe (.claude/skills/dispatch-claim/SKILL.md)
# reads this marker-key via prefix match on "published:<slot_id>:" (not exact equality),
# so format/cadence changes here do not require router updates.
```

Or inline variant (1 line):

```
# Router: Step 2.4 collision probe reads prefix "published:<slot_id>:" — see dispatch-claim/SKILL.md § Step 2.4
```

Choose whichever style matches the existing comment tone in spawn-fanout.md.

## Why This Annotation Matters

When a future maintainer changes the marker-key format (e.g., from weekly ISO-period to daily, like tnb-audit just did in FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON), they need to know:
- The cowork-team flow's marker-key code is one side (this file)
- The router's collision-probe code is the other side (dispatch-claim/SKILL.md Step 2.4)
- The router side uses prefix-match, NOT exact-key match, so the router code needs NO changes if the period format shifts

Without this annotation, a maintainer could assume the router's probe is exact-key and break the collision detection by changing the format without notifying the router side. This is a "knowledge localization" annotation, not a code change.

## Edge Cases

None — purely documentation. No testing required beyond reading the file to verify the comment was added at the correct location.

## RETURN
DONE: Cross-reference annotation added to spawn-fanout.md.
NEXT: Optional parallel tasks (none defined). Task 001+002+003 close the FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX row.
