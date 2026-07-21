---
sprint: DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING
task_id: DESIGN-COWORK-FANOUT-T2-CYCLE-BOOTSTRAP-EXTRACTION
type: TASK
size: S
zone: .claude/skills/cycle-bootstrap/
priority: P1
depends_on: [DESIGN-COWORK-FANOUT-T1-TICK-SNAPSHOT-WON-SLOTS]
blocks: [DESIGN-COWORK-FANOUT-T4-ALERT-COMMANDER-RECHECK-LOGIC]
order: tier2-after-t1
---

## TLDR

cycle-bootstrap/SKILL.md is the shared skill every cowork agent already invokes to read the current tick's bootstrap snapshot (market_context, macro_snapshot). Extend Step -1 to also extract the new `won_slots` field from the snapshot into the existing `$CYCLE_SNAPSHOT` environment variable, making it available to all agents (alert-commander in particular) without changing any spawn-fanout.md prompt templates or per-agent invocations.

## [PM] Planning Context

**Zone:** .claude/skills/cycle-bootstrap/

**Root Cause (Brief §4.2, §F5):** The dispatcher (tick-snapshot.md) now captures `won_slots` at dispatch time. The dispatch information needs to reach consumers (alert-commander) without adding dispatch-layer plumbing (prompt templates, per-agent custom slots) that would bloat spawn-fanout.md and require maintenance per new consumer added. Solution: surface it through the already-shared bootstrap skill that every cowork agent reads on every cycle, using the existing 7-min freshness window and the existing "never block on a missing snapshot" fallback.

**Acceptance Criteria:**
- [ ] cycle-bootstrap/SKILL.md Step -1 (tick-snapshot file read, already reads `market_context` and `macro_snapshot`) adds extraction of `won_slots` array into the same `$CYCLE_SNAPSHOT` jq object
- [ ] If `won_slots` is absent/stale/malformed in the snapshot, it is simply unavailable this cycle (same fallback as the two fields already handled this way — no new error handling)
- [ ] Output: `$CYCLE_SNAPSHOT.won_slots` is now an environment variable available to any downstream step (particularly alert-commander's cycle.md, T4)
- [ ] The skill's frontmatter already lists cycle-bootstrap as used by: news-scout, market-watcher, alert-commander, digest-predict, fb-market-poster, unified-agent — no update to that list needed; all of them can now optionally read `$CYCLE_SNAPSHOT.won_slots`
- [ ] Commit message includes: `AC: T2 — cycle-bootstrap won_slots extraction`

**Files to read first:**
- `.claude/skills/cycle-bootstrap/SKILL.md:1-60` (Step -1, current market_context and macro_snapshot extraction, fallback pattern)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md:84-86` (§4.2: design intent, generalizes mechanism)
- `docs/agents/cowork-team/flow/tick-snapshot.md:1-20` (understand the snapshot JSON output format from T1)

**Files to modify:**
- `.claude/skills/cycle-bootstrap/SKILL.md:20-40` (Step -1: add `won_slots` jq extraction alongside `market_context` extraction)

**Files to create:** none

**Dependencies:** T1 (tick-snapshot.md must write `won_slots` first).

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` (§4.2)
- cycle-bootstrap/SKILL.md existing pattern (read & understand how market_context extraction works)

**Why Tier 2 after T1:** T2 depends on T1. T2 must complete before T4 (alert-commander) can run (T4 reads `$CYCLE_SNAPSHOT.won_slots`).

---

## Implementation Notes

- The snapshot is written by T1 at `docs/data/cycle-snapshot-<HH:MM>.json` per the dispatcher tick time.
- Step -1 already has a precedent: it reads the snapshot, extracts `market_context` and `macro_snapshot` from it, and makes them available as `$CYCLE_SNAPSHOT` (an exported jq object/associative array).
- The new line will be a jq fragment similar to what's already there: `$CYCLE_SNAPSHOT.won_slots = ($snapshot.won_slots // empty)`
- The `// empty` (null coalescing) ensures that if `won_slots` is absent or null, the field is simply not present in `$CYCLE_SNAPSHOT`, allowing downstream code to safely check `if [ -n "$CYCLE_SNAPSHOT.won_slots" ]`
- No new file I/O — just an additional line in the existing jq assembly that's already reading the snapshot file.

---

## Generalization (Note)

Brief §4.2 states: "On a snapshot MISS (absent/stale/malformed — already-documented fallback path, 'never block on a missing snapshot'), `won_slots` is simply unavailable this cycle — same degradation posture as the two fields already handled this way. This generalizes the mechanism to any future producer/consumer pair without per-pair plumbing in `spawn-fanout.md`." This task is a building block for that generalization. Future producer/consumer pairs can reuse this pattern.

---

## Tier Sequencing

- **Tier 2:** After T1 completes (T1 writes the field, T2 reads it)
- **Blocks:** T4 (alert-commander recheck logic) depends on this to read co-dispatch info
