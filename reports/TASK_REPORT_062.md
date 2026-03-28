# Task Report: 062 — Causal Cascade Engine + runImpactChain Use Case

date: 2026-03-27
outcome: APPROVED

---

## Test Results

- Unit tests (062): **23 passed / 0 failed** (`bun test src/__tests__/062-cascade-engine.test.ts`)
- Full regression suite: **346 passed / 0 failed** (`bun test`)
- TypeScript strict check: **0 errors** (`bun tsc --noEmit`)

### Coverage (062 files)

| File | % Funcs | % Lines |
|------|---------|---------|
| `src/domain/services/cascadeEngine.ts` | 100% | 98.68% |
| `src/application/usecases/runImpactChain.ts` | 66.67% | 64.86% |
| `src/__tests__/062-cascade-engine.test.ts` | 98.31% | 100% |

Note: The uncovered lines in `runImpactChain.ts` (105–117) are the `defaultRagRetriever` dynamic import path — this path is only exercised in production when no mock retriever is injected. It is intentionally untested to avoid embedding I/O in the test suite. This is a non-blocking observation.

---

## DDD Compliance: PASS

- `src/domain/services/cascadeEngine.ts`: **zero imports from `infrastructure/` or `application/`**. The file defines its own `SearchResult` interface inline rather than importing from infrastructure — the correct pattern for keeping the domain pure while still being type-safe.
- `src/application/usecases/runImpactChain.ts`: imports from `domain/` and uses a dynamic `import()` to lazily load infrastructure (the default RAG retriever), avoiding a top-level infrastructure dependency in the application layer.
- Pre-existing DDD exception: `src/domain/services/newsNormalizer.ts` uses a `type`-only import from `infrastructure/fetchers/rss.ts` — introduced in task 061, reviewed and accepted then.

---

## Security: PASS

- No `process.env` usage in either file — all config goes through `Bun.env` via `src/infrastructure/config.ts`.
- No `any` types in either file.
- No SQL in these files (pure computation layer).
- No hardcoded credentials.

---

## Architecture Review: PASS

### Two-file split verified

The implementation correctly separates concerns across two files:

1. **`src/domain/services/cascadeEngine.ts`** — pure synchronous function `buildCausalChain`. No I/O, no async, no infrastructure imports. All sector rules are hardcoded as `SECTOR_RULES[]`. RAG results are injected via optional parameter.

2. **`src/application/usecases/runImpactChain.ts`** — async orchestrator. Normalizes raw text via `normalizeNews`, fetches RAG context (best-effort with try/catch), delegates to `buildCausalChain`. The `ragRetriever` is an injectable function parameter, enabling test isolation without mocking the module system.

### Sector impact rules: PASS

14 rules covering all key Vietnamese sectors:
- `oil_gas`: price up/down
- `aviation`: fuel cost impact from oil price rise; FX impact
- `banking`: interest rate hike/cut; inflation
- `real_estate`: interest rate hike (negative) / cut (positive)
- `steel`: price up/down; FX export benefit
- `securities`: VN-Index rally/decline

### Confidence decay through cascade: PASS

Verified mathematically and by test:
- Domain entry confidence = `rule.confidence` (0.60–0.85, always < seed confidence of 0.9)
- Action entry confidence = `domainEntry.confidence * 0.9`

For the key path (oil_gas via OPEC):
- Seed: 0.9
- Domain (oil_gas): 0.85
- Action (GAS): 0.765

---

## Acceptance Criteria: ALL PASS

| Criterion | Result |
|-----------|--------|
| `runImpactChain(newsText, watchlist)` returns chain | PASS |
| Chain has ≥1 domain entry | PASS — 2 domain entries for oil news (oil_gas + aviation) |
| Chain has ≥1 action entry | PASS — GAS action entry present |
| Confidence ≥ 0.5 | PASS — GAS confidence = 0.765 |
| Oil news → oil_gas sector triggered | PASS — impactDirection = "up" |

---

## Issues Found

### Blocking

None.

### Non-Blocking

1. **TDD commit discipline**: test and implementation arrived in one commit (`730baf9`) rather than two separate commits (red → green). The tests themselves are substantive (23 meaningful assertions), so this is a process note only — does not affect quality.

2. **`defaultRagRetriever` coverage**: Lines 105–117 in `runImpactChain.ts` (the production dynamic import path) are not covered by tests. Acceptable: covering this would require embedding model I/O. The path is exercised in production and has a try/catch guard.

3. **`aviationFuel` keyword overlap**: The aviation sector rule shares `"giá dầu tăng"` and `"oil price rise"` keywords with the oil_gas rule. This is intentional and correct — oil price rise should simultaneously be positive for oil_gas and negative for aviation — but a future enhancement could make the cross-sector propagation more explicit via a causal link field.

---

## Merge Status

**Merged to `main`** via `git merge --no-ff task/062-cascade-engine` on 2026-03-27.

Branch `task/062-cascade-engine` deleted after merge.

Post-merge verification: `bun tsc --noEmit` = 0 errors on `main`.

---

## Next Steps

Task **083** (Analysis MCP tools: `fetch_and_analyze`, `run_impact_chain`, `search_similar_context`) is now unblocked. This is Sprint 004 Wave 4 — the final task in the sprint, wiring the cascade engine and RAG retriever into callable MCP tools.

PM notified: Task 062 merged. Task 083 unblocked and ready for assignment.
