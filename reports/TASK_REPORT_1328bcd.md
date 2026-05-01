# Task Report: 1328b + 1328c + 1328d — Signal Payload Completeness (combined)
date: 2026-04-24
outcome: APPROVED

---

## Tasks Reviewed

| Task | Title | Branch | Verdict |
|------|-------|--------|---------|
| 1328b | validateSignalPayload propagates new 1328a fields | task/1328b-validator | APPROVED |
| 1328c | DB migration: 3 new columns on agent_signals | task/1328c-db-migration | APPROVED |
| 1328d | enrichDimensionScores() + ConvictionInput new fields | task/1328d-conviction-enrichment | APPROVED |

All three tasks shared a single branch (`task/1328b-validator`). Commits verified on main:
- `e7d29292` — task(1328b): verify validateSignalPayload propagates 1328a new fields end-to-end
- `4aa160d8` — task(1328c): add news_sentiment, kinh_dich_confidence, agent_signals_majority columns
- `22a11f04` — task(1328d): add enrichDimensionScores() and 3 new ConvictionInput fields

---

## Test Results

### Targeted suite (3 test files)
- 1328b: 9 pass / 0 fail
- 1328c: 6 pass / 0 fail
- 1328d: 10 pass / 0 fail
- **Subtotal: 25 pass / 0 fail** (40 expect() calls, 192ms)

### Full regression (577 files)
- 6838–6841 pass / 8 fail (21 skip)
- Pre-existing failures on main (baseline): 8 — identical set
- Branch failures: 9 in one run (Task 026 HOSE flake appeared once; passes in isolation, confirmed timing-sensitive under parallel execution)
- **No regressions introduced by 1328b/c/d**

### TypeScript
- `bun tsc --noEmit` — 0 errors

---

## DDD Compliance: PASS

- `apps/mcp-server/src/domain/services/convictionScorer.ts` — zero imports from `infrastructure/` or `application/`. `enrichDimensionScores()` is a pure function with no I/O. `WEIGHTS` object unchanged.
- `apps/mcp-server/src/infrastructure/db/schema-news.ts` — infrastructure layer, no upward violations.
- `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` — infrastructure layer, no upward violations.
- 1328b test-only change — no production code modified (confirmed by diff scan).

---

## Security: PASS

- No `process.env` in any modified file (Bun.env policy respected).
- All SQL in 1328c uses parameterized `db.prepare(...).run(...)` bindings. The three new columns (`news_sentiment`, `kinh_dich_confidence`, `agent_signals_majority`) are passed as positional `?` parameters — no string interpolation.
- The `ALTER TABLE` blocks in schema-news.ts are wrapped in `try/catch {}` — idempotent pattern consistent with existing migration style.
- No hardcoded credentials or API keys.

---

## Per-Task Notes

### 1328b — NO_CHANGES to production code confirmed
The diff shows only `src/__tests__/1328b-validator-propagation.test.ts` added under this task commit. All 9 tests exercise `validateSignalPayload()` from `agentSignalTools.ts` (interface layer) without touching it. Tests cover: valid in-range fields, out-of-range rejection for `newsSentiment`/`kinhDichConfidence`, invalid enum for `agentSignalsMajority`, boundary values, and backward compat (base payload without new fields). Meaningful, non-trivial assertions throughout.

### 1328c — Migration idempotency verified
`initNewsTables()` already uses the `try/catch` idempotency pattern established in prior sprints. The three new `ALTER TABLE` blocks follow the same pattern. Test "initDatabase() runs idempotently — second call does not throw" confirms double-init is safe. INSERT round-trip test (AC5) and NULL-default test (AC6) confirm both write and backward compat paths work correctly.

### 1328d — Pure function, weights unchanged
`enrichDimensionScores()` returns a new `ConvictionInput` via object spread — it does not mutate the argument (AC5 verified). The three enrichment rules (sentiment, kinhDich, cascade) are all non-overriding: they only set fields when the corresponding dimension field is absent (AC6/7/8 guard against override). The `WEIGHTS` object is declared `as const` and unchanged. `computeConviction()` now calls `enrichDimensionScores()` as its first step, making the enrichment transparent to existing callers.

---

## Issues Found

### Blocking
None.

### Non-Blocking
- `agentSignalStore.ts` `getSignalEffectiveness()` (lines 719–720) uses string interpolation for `fromAgent` and `signalType` filter values (escaped with `replace(/'/g, "''")`) rather than parameterized bindings. This is pre-existing (not introduced by 1328c) and already has SQL-injection mitigation via quote escaping. Recommend parameterized refactor in a future task.

---

## Merge Status

Merged to main. Branches deleted:
- `task/1328b-validator` (was 58b3c132 — all commits already on main)
- `task/1328c-db-migration` (was 58b3c132)
- `task/1328d-conviction-enrichment` (was 58b3c132)

TASKS.md updated: 1328b, 1328c, 1328d → Done.
