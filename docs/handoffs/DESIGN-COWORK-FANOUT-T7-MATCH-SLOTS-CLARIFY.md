---
sprint: DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING
task_id: DESIGN-COWORK-FANOUT-T7-MATCH-SLOTS-CLARIFY
type: TASK
size: S
priority: P1
zone: docs/agents/cowork-team/
depends_on: [DESIGN-COWORK-FANOUT-T6-MARKET-WATCHER-SLOT-ROUTING]
blocks: []
optional: true
order: tier3-after-t6
---

## TLDR

[OPTIONAL, LOW-PRIORITY] cowork-team/flow/match-slots.md Step 4b currently WARNs when it detects that the same agent fires more than one slot in the same tick (e.g., market-watcher-eod AND market-watcher-offhours both matching). With T6 (market-watcher slot routing fix) landed, such a collision now represents two intentionally different sub-flows (eod vs offhours) rather than a symptom of one of them losing its slot identity. Add a clarifying comment to Step 4b explaining why WARN-only (not BLOCK) remains correct post-T6.

## [PM] Planning Context

**Zone:** docs/agents/cowork-team/

**Background (Brief §5):** Brief §5 explains why match-slots.md Step 4b should NOT flip from WARN to BLOCK (even though multi-slot collisions *can* indicate a problem):
1. Intentional multi-slot fires already exist and are legitimate (an agent running two genuinely-different dish types in the same tick)
2. The dispatch layer has no way to distinguish a legitimate case from an incident (market-watcher EOD running as intended vs market-watcher EOD misrouting due to clock drift) without leaking market-domain knowledge ("which trading day's close is this") into the generic scheduler — a DDD layer violation.
3. The correct root-cause fix is at the receiving-flow layer (T6): make market-watcher route by its own dispatched slot identity, not re-derive from ambient clock state.

With T6 landed, a future collision on the same (agent, tick) pair now has higher confidence of being legitimate (two intentionally-different sub-flows). The WARN is accurate telemetry; the solution is in the receiving flow, not in flip of the scheduler's block/warn dial.

**Acceptance Criteria:**
- [ ] match-slots.md Step 4b (the WARN branch for multi-slot collisions) adds one clarifying comment (2-3 sentences, per brief §5) explaining:
  - Why WARN remains correct (it is accurate telemetry for legitimate two-dish cases)
  - Why BLOCK would be wrong (would break documented intentional cases, and dispatch layer cannot disambiguate without DDD violation)
  - Why the root cause fix is in the receiving flow (T6), not in this dial
  - Reference to brief §5 section for readers who want full context
- [ ] Commit message includes: `AC: T7 — match-slots Step 4b clarifying comment (R3 fold-in)`

**Files to read first:**
- `docs/agents/cowork-team/flow/match-slots.md:70-90` (Step 4b, current WARN logic, locate where comment should land)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md:134-149` (§5: full rationale, why WARN-only, why BLOCK would break intentional cases, why root cause is in receiving flow)

**Files to modify:**
- `docs/agents/cowork-team/flow/match-slots.md:80-90` (add clarifying comment to Step 4b)

**Files to create:** none

**Dependencies:** T6 (market-watcher slot routing) should land first so this comment references an existing fix.

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` (§5)

**Why Optional, Low-Priority:** This is documentation/clarity only, not a bug fix or functional change. match-slots.md behavior is unchanged. T7 is included for completeness and context but can be deferred if time is short. The row includes it in the brief's §9 decomposition but flags it as "optional" — priority can be adjusted by PO.

---

## Implementation Notes

- The comment should be inserted right at or just before the WARN condition in Step 4b (the line that currently logs/warns about multi-slot collision).
- Reference the brief section and the T6 fix so future readers understand the full context: "The root-cause fix for this incident is in T6 (market-watcher/flow/main.md Step 2): route by the slot= already dispatched, not by re-deriving from ambient clock state."
- Keep the comment concise — 2-3 sentences, not a full design doc. Point to the brief for full context.
- No code change — purely clarifying prose.

---

## Tier Sequencing

- **Tier 3:** After T6 (so comment references an existing fix)
- **Optional:** Can be deferred or deprioritized by PO
- **Does not block:** T8 (QA) does not depend on this (documentation-only)
