---
sprint: DESIGN-COWORK-FANOUT
task_id: DESIGN-COWORK-FANOUT-T2-CYCLE-BOOTSTRAP-EXTRACTION
size: S
zone: .claude/skills/cycle-bootstrap/
depends_on: [DESIGN-COWORK-FANOUT-T1]
blocks: [DESIGN-COWORK-FANOUT-T4]
---

## TLDR
Extend `.claude/skills/cycle-bootstrap/SKILL.md` Step -1 (tick-snapshot check — already read by every cowork agent including alert-commander) to extract one additional field from the snapshot: `$CYCLE_SNAPSHOT.won_slots`. On snapshot miss/stale/malformed, this field is simply unavailable this cycle, degrading exactly like `market_context` and `macro_snapshot` already do (never block on missing snapshot, proceed with direct tool call fallback).

## [PM] Planning Context

**Zone:** `.claude/skills/cycle-bootstrap/`

**Acceptance Criteria:**
- [ ] `.claude/skills/cycle-bootstrap/SKILL.md` Step -1 now extracts `$CYCLE_SNAPSHOT.won_slots` alongside existing `market_context` and `macro_snapshot` fields
- [ ] On snapshot MISS (absent/stale/malformed): `$CYCLE_SNAPSHOT.won_slots` is undefined; skill continues without blocking (existing degradation pattern)
- [ ] Parsing is safe: `won_slots` is an array of objects with `{slot_id, agent, parallel_group}` schema from T1 (no new error handling beyond existing)
- [ ] AC T-2 fixture test passes: fixture with `won_slots` containing a `parallel_group:"gatherers"` entry → extraction yields non-empty `$CYCLE_SNAPSHOT.won_slots`

**Rationale:**
- Fixes F5 from brief: dispatcher already has exact data, snapshot is already the shared channel to all cowork agents; this just generalizes the mechanism
- Enables T4 (alert-commander Firing Gate) to read co-dispatched producer list without re-invoking dispatcher logic later (which would fail due to F4: `last_fired` timing)
- Non-breaking: field absence degrades gracefully (same as any other optional snapshot field), so no new failure-handling design

**Files to read first:**
- `.claude/skills/cycle-bootstrap/SKILL.md` (Step -1: understand current snapshot field extraction, fallback path)
- `docs/data/cycle-snapshot-HH:MM.json` (sample fixture — understand `won_slots` shape from T1 output)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` § F5 § 4.2 (design rationale)

**Files to modify:**
- `.claude/skills/cycle-bootstrap/SKILL.md` (Step -1: add `won_slots` extraction line)

**Files to create:**
- None

**Dependencies:**
- Depends on T1 (T1 must populate `won_slots` in snapshot before this can extract it)
- Blocks T4 (T4 consumes `$CYCLE_SNAPSHOT.won_slots` in its logic)

**Knowledge needed:**
- `.claude/skills/cycle-bootstrap/SKILL.md` Step -1 structure and jq patterns
- Existing snapshot field extraction patterns (reference `market_context` / `macro_snapshot`)
- Brief § 4.2 (design, degradation posture)
