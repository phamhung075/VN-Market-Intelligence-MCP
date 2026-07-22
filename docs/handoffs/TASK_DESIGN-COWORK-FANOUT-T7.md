---
sprint: DESIGN-COWORK-FANOUT
task_id: DESIGN-COWORK-FANOUT-T7-MATCH-SLOTS-CLARIFY
size: XS
zone: docs/agents/cowork-team/
depends_on: [DESIGN-COWORK-FANOUT-T6]
blocks: [DESIGN-COWORK-FANOUT-T8]
priority: low
optional: true
---

## TLDR
Add a clarifying comment to `docs/agents/cowork-team/flow/match-slots.md` Step 4b explaining why the collision WARN remains correct post-T6 (after T6 lands, market-watcher will route by `slot=`, eliminating the incident's specific misrouting). This is doc-only, no code change. Optional low-priority task; QA can verify the intent in T-9 regression test without requiring this comment to exist.

## [PM] Planning Context

**Zone:** `docs/agents/cowork-team/`

**Acceptance Criteria:**
- [ ] `docs/agents/cowork-team/flow/match-slots.md` Step 4b (existing collision detection section) adds clarifying prose:
  - Explains that WARN-only (not BLOCK) is deliberate: two agents intentionally running different dish_types in same tick (e.g., chef-eod + fb-daily) is legitimate and expected
  - Notes that post-T6 (market-watcher routing by slot), the incident's specific case (EOD slot misrouting to offhours mode) is fixed by domain-logic in market-watcher itself, not by dispatcher-layer blocking
  - References brief § 5 for full detail on DDD layer boundary
  - One clarifying paragraph, ~100 words max

**Rationale:**
- Documentation clarity: prevents future maintainers from flipping Step 4b to BLOCK as a "fix" when in fact WARN remains correct
- Brief § 5 notes this: unconditional BLOCK would break legitimate cases; root-cause fix is in market-watcher's own routing logic (T6), not in generic dispatcher
- Zero code impact; already-correct behavior, just needs documentation anchor

**Files to read first:**
- `docs/agents/cowork-team/flow/match-slots.md` Step 4b (understand current collision detection)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` § 5 (rationale for WARN-only vs BLOCK)

**Files to modify:**
- `docs/agents/cowork-team/flow/match-slots.md` (Step 4b: add clarifying comment)

**Files to create:**
- None

**Dependencies:**
- Depends on T6 (the fix that makes the comment true; if T6 isn't complete, comment is premature)
- Blocks T8 (QA gate: T-9 regression test refers to this intent)
- OPTIONAL: QA can pass without this task; it is a documentation refinement, not a functional requirement

**Knowledge needed:**
- Brief § 5 (DDD layer boundary reasoning, why WARN-only is correct)
