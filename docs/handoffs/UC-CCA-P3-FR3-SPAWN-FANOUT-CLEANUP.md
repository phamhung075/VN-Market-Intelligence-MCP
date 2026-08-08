# UC-CCA-P3-FR3-SPAWN-FANOUT-CLEANUP — Trim spawn-fanout.md FR-P2-7 documentation block

**Task ID:** UC-CCA-P3-FR3-SPAWN-FANOUT-CLEANUP · **Priority:** P0 · **Zone:** docs/agents/cowork-team/  
**Assigned to:** dev-cowork-team  
**Depends on:** UC-CCA-P3-FR1-FR2-SKILL  
**Handoff from:** pm

---

## Acceptance Criteria

1. **spawn-fanout.md lines 84-121 (FR-P2-7 block):** Trim to a one-line pointer
   - Current: ~35L of inline pattern documentation + copy-pasted pseudocode (the original source of the 4 EARLY-claim defects across chef/fb/digest/tran-ngoc)
   - Change to: `See .claude/skills/published-marker-gate/SKILL.md — dispatcher does NOT call publish markers, the spawned agent does (unchanged invariant).`
   - This removes now-duplicated prose while preserving the essential fact: the dispatcher never invokes the marker gate; it is always agent-side

2. **Verify surrounding prose remains coherent:**
   - Lines before 84 and after 121 should flow logically around the one-line pointer
   - No orphaned references to the deleted prose

3. Single file modification, atomic commit

---

## Technical Spec

**File to modify:** `docs/agents/cowork-team/flow/spawn-fanout.md` (lines 84-121)

**Rationale:**
- **Q-skill-siting resolution:** the FR-P2-7 block in spawn-fanout.md was documentation/pattern-reference only
- It was **never itself an invocable gate** — the entire block existed to explain design intent
- This block was the **original copy-paste source** the 4 EARLY-claim defect instances were cloned from (chef.md, fb-market-poster.md, digest-predict/main.md, tran-ngoc-bau/main.md all copied this pattern verbatim before the redesign)
- Now that the redesign is happening and a shared skill exists (`.claude/skills/published-marker-gate/SKILL.md`), this ~35L block is **duplicated prose** (all the logic is now in the skill)
- **Cleanup action:** trim to a 1-line pointer to the skill, preserving the essential invariant

**Why this matters:**
- The block's detailed pseudocode was a teaching tool when there was no other reference
- Now the skill is the canonical reference; the block becomes noise that could mislead future readers into thinking the dispatcher-side contains logic it doesn't
- Per the architect brief §4: `spawn-fanout.md` itself is trimmed to a 1-line pointer (§ Q-skill-siting doc-debt cleanup)

---

## Current Block (Approximate, for reference)

From architect brief §4:
```
(lines 84-121 contain FR-P2-7 pattern documentation, ~35L of prose explaining:
 - why the dispatcher doesn't invoke the marker
 - what the marker claim pattern looks like (inline pseudocode)
 - references to the 6 flow files that use it
 - example TTL/key structures
)
```

**To be replaced with:**
```
See .claude/skills/published-marker-gate/SKILL.md — dispatcher does NOT call publish markers, the spawned agent does (unchanged invariant).
```

---

## Related Documents

- Architect brief: `docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md` (§4 explicit instruction to trim this block to 1-line pointer)
- Skill spec: `.claude/skills/published-marker-gate/SKILL.md` (the canonical reference that replaces this block's detailed prose)
- Sibling briefs: `2026-08-06-cowork-marker-lifecycle-anchor-and-release.md`, `2026-08-07-chef-midflow-bail-determinism-guard.md` (both reference the dispatcher's role, now clarified)

---

## QA Gate

- [ ] spawn-fanout.md lines 84-121 trimmed to a single line pointer
- [ ] Pointer text matches: "See .claude/skills/published-marker-gate/SKILL.md — dispatcher does NOT call publish markers, the spawned agent does (unchanged invariant)."
- [ ] Surrounding prose (before line 84, after line 121) still reads coherently
- [ ] File still parses as valid flow doc
- [ ] No orphaned references to deleted prose elsewhere in the file

---

## Blocker(s)

**Upstream:** UC-CCA-P3-FR1-FR2-SKILL (the skill should exist so the pointer makes sense)

---

## Follow-on Tasks

None specific. This is non-blocking documentation cleanup; can run in parallel with or after the 6 gate wiring tasks. No follow-on dependencies.

---

## Notes

- This task is cosmetic/doc-debt cleanup, not a functional requirement for AC-1 through AC-6
- It unblocks future maintainers from searching for the canonical skill reference without confusion
- The ~35L deletion aids code readability: less duplication = clearer intent
