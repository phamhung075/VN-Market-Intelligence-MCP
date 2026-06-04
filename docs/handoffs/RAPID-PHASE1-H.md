---
sprint: RAPID-DATA-LAYER
branch: task/RAPID-H-insider-lookback-180d
size: XS
zone: apps/mcp-server/
depends_on: []
blocks: []
---

## TLDR

Extend `get_insider_transactions` max lookback from 90 days to 180 days. Single-line change in insiderTools.ts:108: `Math.min(days, 90)` → `Math.min(days, 180)`. Unblocks SKILL-4 ownership-governance-screen Step 2 full 6-month insider-exit detection (currently capped at 3 months).

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Acceptance Criteria:**
- [ ] Edit verified: apps/mcp-server/src/interface/mcp/tools/market-data/insiderTools.ts line 108 `Math.min(days, 90)` → `Math.min(days, 180)`
- [ ] Unit tests: 3 new tests (days=91 returns 91-day window or sparse-honest coverage; days=180 same; days=365 same)
- [ ] Integration test: `get_insider_transactions(code=FPT, days=180)` on live corpus returns insiders with executedVolume/registeredVolume spanning 180d window (or sparse honest coverage if corpus < 180d deep)
- [ ] TypeScript: tsc clean, no new any types
- [ ] Tool behavior honest: returns whatever data exists up to 180d (sparse is OK if insiderCheckJob hasn't populated 180d yet); no fake-fill zeros

**Files to read first:**
- `apps/mcp-server/src/interface/mcp/tools/market-data/insiderTools.ts:89-120` — the insiderTools handler and the max 90 cap at line 108
- `apps/mcp-server/src/__tests__/insiderTools.test.ts` (or equivalent) — existing test patterns
- `docs/policies/dev-standards.md` — TypeScript standards

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/tools/market-data/insiderTools.ts:108` — change `.max(90)` to `.max(180)`

**Files to create:**
- Add 3 new test cases to existing insiderTools test file (or RAPID-H-insider-lookback.test.ts if preferred)

**Dependencies:**
- None (P1 no-deps task, parallel with FIX-B-1/B-2)

**Knowledge needed:**
- `docs/policies/dev-standards.md` (TypeScript, test template)
- Brief: docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md § FIX-H (lines 271-276)

---

## Scope Boundary

**NOT in this task:**
- Backfilling insider transaction history beyond current population (insiderCheckJob scope)
- Changing insiderCheckJob population cadence (separate task if needed)
- Extending other lookback windows (just insider transactions)

---

## Build Standard — Lean

**Mandatory Gates (G1–G6):**
1. **Fence** — edit confined to insiderTools.ts, one line
2. **Sandbox** — unit test with :memory: SQLite, zero credentials
3. **Replay** — insert test data once, call tool twice (same result)
4. **Red/Green** — show pre-fix test failing (expects 180d but current code caps at 90d), then passing
5. Honest artifact (test file exists, code change minimal and verifiable)
6. TypeScript clean (tsc)

**DoD verification command line:**
```bash
# Fence: verify one-line edit in expected file
grep -n "Math.min.*days.*180" apps/mcp-server/src/interface/mcp/tools/market-data/insiderTools.ts

# Sandbox: :memory: test
cd apps/mcp-server && bun test __tests__/insiderTools.test.ts --testNamePattern="180"

# Red/Green: pre-fix test should fail (cap at 90d), post-fix should pass (cap at 180d)
echo "Pre-fix (cap 90d):" && bun test __tests__/insiderTools.test.ts --testNamePattern="180" 2>&1 | head -5
# Edit insiderTools.ts:108
# Post-fix
echo "Post-fix (cap 180d):" && bun test __tests__/insiderTools.test.ts --testNamePattern="180" 2>&1 | grep "3 pass"

# TypeScript
tsc --noEmit
```

---

## Acceptance Criteria Detail

**Test 1: 91-day request**
```
input: get_insider_transactions(code="FPT", days=91)
expected: returns insiders with transactions up to 91 days ago (from today)
         or sparse-honest fewer days if corpus doesn't have 91d depth
verify: response.insider_transaction[0].executedDate is ~91 days old OR array is empty (honest)
```

**Test 2: 180-day request**
```
input: get_insider_transactions(code="FPT", days=180)
expected: returns insiders spanning up to 180 days (6 months)
verify: oldest transaction executedDate is ~180 days ago OR array is sparse/empty (honest)
```

**Test 3: 365-day request (beyond new cap)**
```
input: get_insider_transactions(code="FPT", days=365)
expected: tool caps to 180d (Math.min(365, 180) = 180), returns 180d window
verify: response doesn't go beyond 180d, no fake-future dates
```

**Live Integration Note:**
Data availability depends on insiderCheckJob population. If insiderCheckJob only has 90d of data loaded for a ticker, the tool will honestly return 90d (correct behavior — no fake-fill). The lookback parameter increase is mechanically safe; data depth is a separate concern.

---

## Handoff Notes

**Brief source:** docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md § FIX-H (lines 271-276)

**Leverage:** Unblocks SKILL-4 ownership-governance-screen Step 2 (insider transaction window for 6-month net-sell detection). Currently capped at 90d; brief requires 180d. Low-risk change: SQLite date query already parameter-driven.

**Why XS (extra-small):**
- One-line change to an existing tool (no new tool creation)
- No schema migrations
- No new dependencies
- Test coverage is 3 assertions (small test footprint)
- Change is purely parameter-boundary widening (safe)

**Commit message template:**
```
feat(rapid-phase1/FIX-H): extend get_insider_transactions max lookback from 90d to 180d

- Modify insiderTools.ts:108 Math.min(days, 90) → Math.min(days, 180)
- Underlying insiderStore SQLite query already parameter-driven (no schema change)
- Test: 3 new tests (days 91/180/365 return honest coverage up to lookback)
- DoD: G1–G6 LEAN (fence/sandbox/replay/red-green/tsc)

Task: FIX-H (RAPID-DATA-LAYER Phase 1 P1, unblocks SKILL-4 Step 2)
Size: XS (one-line change + 3 tests)
```

---

## Parallel with FIX-B

This task runs in **parallel** with FIX-B-1 and FIX-B-2 (no dependencies). Both should dispatch together in WIP=2 parallel dispatch.
