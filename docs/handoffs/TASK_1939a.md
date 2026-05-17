# Handoff — TASK 1939a: TNB Critic Gate — Sprint A (Schema + Types + Scorer)

**Created:** 2026-05-17T20:39Z
**Sprint:** c171
**Branch:** task/1939a-tnb-critic-gate-sprint-a
**Zone:** apps/mcp-server/

---

## [Architect] Design Brief

Architecture brief: `docs/architecture-briefs/2026-05-17-tnb-critic-gate.md`

**What Sprint A delivers (Steps 1, 2, 3, 8 from brief):**

1. Schema migration — 3 new columns on `agent_signals` table
2. CriticInput / CriticResult types in `agentSignalStore.ts`
3. Pure scorer `scoreWithTnbCritic()` in `tnbCriticScorer.ts`
4. PostSignalInput interface extended with optional critic fields

**Sprint A does NOT wire the gate** — that is Sprint B (1939b). Sprint A is safe to ship independently with no behavior change.

### Acceptance Criteria

- AC1: `agent_signals` table has 3 new columns (`critic_score REAL DEFAULT NULL`, `critic_notes TEXT DEFAULT NULL`, `retry_count INTEGER DEFAULT 0`) — via DDL update + `ALTER TABLE ... ADD COLUMN` migration guards in startup.
- AC2: `CriticInput` and `CriticResult` interfaces exported from `agentSignalStore.ts` (or a new types file in domain).
- AC3: `scoreWithTnbCritic(input: CriticInput): CriticResult` exported from `apps/mcp-server/src/domain/services/tnbCriticScorer.ts` — pure function, no I/O.
- AC4: 5 scoring checks implemented per brief § 3c (pillar coverage, source tier, specificity, BCTC forensics gate, confidence anchor). Score threshold = 0.6 (3 of 5 checks).
- AC5: `PostSignalInput` interface extended with optional `critic_score?`, `critic_notes?`, `retry_count?` fields.
- AC6: Unit tests in `apps/mcp-server/src/__tests__/1939a-tnb-critic-scorer.test.ts` — cover all 5 checks individually + pass/fail boundary at 0.6 + BCTC auto-pass for non-BCTC signal types.
- AC7: `tsc --noEmit` exits 0. All existing tests pass.

### Files to Create/Modify

| File | Action |
|---|---|
| `apps/mcp-server/src/infrastructure/db/schema.ts` (or equivalent DDL) | ADD 3 columns to CREATE TABLE DDL + ALTER TABLE migration guards |
| `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` | ADD CriticInput, CriticResult interfaces + extend PostSignalInput |
| `apps/mcp-server/src/domain/services/tnbCriticScorer.ts` | NEW: pure scorer |
| `apps/mcp-server/src/__tests__/1939a-tnb-critic-scorer.test.ts` | NEW: unit tests |

### TDD Requirement

Write failing tests (RED) BEFORE implementing `scoreWithTnbCritic()`. Test file must exist and fail before scorer logic is added.

---

## [PM] Task Notes

- Task created from architecture brief via `dev-team c171` triage of `agents-architect` signal.
- No BA spec needed — brief is fully specified.
- Sprint B (1939b) depends on this sprint completing first.
- Dev should read the full brief at `docs/architecture-briefs/2026-05-17-tnb-critic-gate.md` before starting.

---

## [Developer] Section

_(to be filled by dev-mcp-server on completion)_

---

## [QA] Review Record

_(to be filled by QA after developer handoff)_
