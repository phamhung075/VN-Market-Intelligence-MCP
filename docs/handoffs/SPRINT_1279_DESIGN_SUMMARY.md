# SPRINT 1279 — MSCI Index Inclusion Cascade Design Summary

**Architect:** Claude Haiku 4.5
**Date:** 2026-04-22
**Status:** APPROVED_FOR_DEVELOPER_INTAKE

---

## Sprint Overview

**Title:** MSCI Index Inclusion Cascade Detection
**Size:** M (Medium, 2 tasks, ~8 hours total)
**Reference Spec:** docs/REQ_1279.md
**Technical Design:** docs/TECH_1279.md
**Task Count:** 2 (RED + GREEN phases)

| Task | Title | Size | Branch | Est. Hours | Depends |
|------|-------|------|--------|-----------|---------|
| 1279a | RED: MSCI cascade tests | S | `task/1279a-msci-inclusion-cascade-red-test` | 3 | None |
| 1279b | GREEN: Implement + integrate | M | `task/1279b-msci-inclusion-cascade-green-impl` | 5 | 1279a |

---

## What This Sprint Delivers

**Feature:** Automated detection of MSCI (Morgan Stanley Capital International) index inclusion announcements in Vietnamese/global news, with automatic alert cascading to large-cap watchlist stocks.

**Real-world context:** When Vietnam's MSCI status changes or a Vietnamese stock becomes MSCI-eligible (keywords: "nộp danh sách", "đáp ứng tiêu chí", "chỉ số MSCI"), passive fund inflows + foreign rebalancing drive multi-quarter positive returns for affected large-caps (MWG, KDH, FPT, MSN, VCB, HPG).

**Current state:** No systematic detection; relies on manual market scanning.

**Post-sprint state:** Automated keyword detection + credibility filtering (Reuters/Bloomberg/SSC PASS, local news FAIL) + cascade to large-cap watchlist stocks.

---

## Key Design Decisions

### 1. **Credibility Threshold = 0.7**
- Reuters/Bloomberg/SSC official sources (0.88–0.95) → PASS
- Local news / CafeF (0.50–0.65) → REJECT
- Rationale: MSCI inclusion is proven price catalyst → require high-quality sources only

### 2. **Large-Cap Only Targeting** (not sector peers like insider dump)
- Insider dump (Task 1278): CEO exits banking stock → cascade to **peer banks** (contagion risk)
- MSCI inclusion (Task 1279): Stock joins MSCI → cascade to **specific large-caps** across all sectors (cross-sector liquidity play)
- Hardcoded fallback: [MWG, KDH, FPT, MSN, VCB, HPG, BID, CTG] if stock classification unavailable

### 3. **Sentiment Direction = BULLISH** (opposite insider dump)
- MSCI keywords trigger bullish sentiment in domain/services/sentimentClassifier.ts
- Index inclusion = positive signal; insider dump = negative signal
- No keyword overlap between the two (separate keyword sets completely)

### 4. **DDD Layer Separation**
- **Domain** (`msciDetector.ts`): Pure keyword detection + credibility check (no I/O)
- **Application** (`cascadeExecutor.ts`): Orchestration (compose domain functions + business logic)
- **Integration** (`cascadeEngine.ts`): `buildCausalChain()` calls msciDetector, creates HIGH-severity domain entry

### 5. **TDD / Contract-First Approach**
- RED (1279a): Write 6 test cases; 5 PASS (sentiment keywords exist), 1 contract FAIL (rule not yet defined)
- GREEN (1279b): Implement to make all tests PASS
- Final state: 16 new assertions (6 RED + 10 GREEN), baseline 6171 → 6187

---

## Cascade Rule Structure

```typescript
// cascadeEngine.ts:2180
export const MSCI_INCLUSION_RULES: CascadeKeywordRule[] = [
  { key: "msci_large_cap_1", keyword: "nộp danh sách", sector: "all_largecp" },
  { key: "msci_large_cap_2", keyword: "đáp ứng tiêu chí", sector: "all_largecp" },
  { key: "msci_large_cap_3", keyword: "chỉ số msci", sector: "all_largecp" },
];
```

All rules target "all_largecp" (pseudo-domain) — application layer filters actual large-cap stocks from watchlist.

---

## Files Changed

### Created (NEW)
- `src/domain/services/msciDetector.ts` — Keyword detection + credibility filter
- `src/__tests__/1279a-msci-inclusion-cascade-red.test.ts` — Contract tests (6 cases)
- `src/__tests__/1279b-msci-inclusion-cascade-green.test.ts` — Integration tests (8–10 cases)
- `docs/handoffs/TASK_1279a.md` — RED phase handoff
- `docs/handoffs/TASK_1279b.md` — GREEN phase handoff
- `docs/TECH_1279.md` — Full technical design

### Modified (EXTEND)
- `src/domain/services/cascadeEngine.ts` — Add MSCI_INCLUSION_RULES at line 2180; extend buildCausalChain() for MSCI detection
- `src/application/cascadeExecutor.ts` — Add detectMsciCascadePeers() function
- `TASKS.md` — Add sprint 1279 + 2 tasks

### Unchanged
- `docs/data/stock-classification.json` — Large-cap lookup only (no schema changes)
- `src/infrastructure/credibilityMap.ts` — Reference only
- All other modules

---

## Test Coverage

### RED Phase (1279a) — 6 test cases
| TC | Title | Status | Notes |
|----|----|--------|-------|
| TC-1 | "nộp danh sách" keyword → detected | PASS | Sentiment keyword exists from sprint 1272 |
| TC-2 | "đáp ứng tiêu chí" keyword → detected | PASS | Same |
| TC-3 | "chỉ số msci" keyword → detected | PASS | Same |
| TC-4 | MSCI_INCLUSION_RULES contract | FAIL → PASS | Intentional fail until GREEN; tests rule structure |
| TC-5 | buildCausalChain integration | PASS | Plumbing already exists |
| TC-6 | Credibility threshold 0.7 | PASS | Domain logic verification |

### GREEN Phase (1279b) — 8–10 test cases
| GC | Title | Status | Notes |
|----|----|--------|-------|
| GC-1 | Large-cap filtering | PASS | Returns [VCB, FPT, MWG], excludes VNM |
| GC-2 | Credibility <0.7 → empty | PASS | Rejects low-quality sources |
| GC-3 | Multi-stock filtering | PASS | 5 stocks → 3 large-caps |
| GC-4 | Non-MSCI keywords → no match | PASS | Negative test |
| GC-5 | Sentiment bullish | PASS | Opposite insider dump |
| GC-6 | Peer isolation (MWG → NOT retail peers) | PASS | No sector-peer cascade |
| GC-7 | buildCausalChain domain entry HIGH severity | PASS | Integration E2E |
| GC-8 | Confidence calculation | PASS | (cred × keywordCount / 3.0) formula |
| GC-9 | Multi-keyword boost | PASS | 2 keywords → higher confidence |
| GC-10 | Complex cascade scenario | PASS | E2E happy path |

**Baseline impact:** 6171 (current) → 6187 (+16 assertions)

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| MSCI keyword too broad → false positives | Credibility threshold 0.7 enforces signal quality |
| Market cap data stale | Use stock-classification.json (daily refresh) + hardcoded fallback |
| Unmapped news source | Default credibility 0.6 (reject); log warning |
| Sentiment conflict (bullish vs insider bearish) | Keyword sets completely separate; no overlap |
| buildCausalChain coupling | msciDetector is pure function; inject as dependency |
| Large-cap definition varies | Hardcoded list covers tier-1 stocks; fallback if JSON unavailable |

---

## Success Criteria (Post-Sprint)

- [ ] RED phase (1279a) merged: 6 test cases, 5 PASS + 1 expected FAIL
- [ ] GREEN phase (1279b) merged: All 8–10 tests PASS
- [ ] Baseline: 6171 → 6187 (+16 assertions)
- [ ] `bun tsc --noEmit` passes (no type errors)
- [ ] DDD rules respected: domain/ zero infrastructure imports
- [ ] Task reports written (TASK_REPORT_1279a.md + TASK_REPORT_1279b.md)
- [ ] Branches merged + deleted; main is clean

---

## Developer Handoff Files

- **RED phase:** `docs/handoffs/TASK_1279a.md` (3-hour task, contract tests)
- **GREEN phase:** `docs/handoffs/TASK_1279b.md` (5-hour task, implementation + integration)
- **Full spec:** `docs/TECH_1279.md` (architecture + detailed implementation guide)
- **BA requirement:** `docs/REQ_1279.md` (business context + AC)

---

## TASKS.md Entry (for tracking)

```
## Sprint 1279 — MSCI Inclusion Cascade Detection (M-size)

Status: PLANNING | Ref: TECH-1279 | Goal: Detect MSCI index inclusion → HIGH alerts to large-cap watchlist | Size: M (2 tasks, ~8 hours)

| ID | Title | Status | Layer | Notes |
|----|----|--------|-------|-------|
| 1279a | RED: MSCI cascade tests | Todo | test | 6 assertions; contract test for MSCI_INCLUSION_RULES |
| 1279b | GREEN: Implement MSCI rules + cascadeExecutor | Todo | domain+app | msciDetector.ts, MSCI_INCLUSION_RULES, detectMsciCascadePeers(), buildCausalChain integration |
```

---

## Next Steps for Developer

1. **Start Task 1279a (RED):**
   - Read `docs/handoffs/TASK_1279a.md`
   - Create `src/__tests__/1279a-msci-inclusion-cascade-red.test.ts`
   - Write 6 test cases per handoff spec
   - Run: `bun test src/__tests__/1279a-*.test.ts`
   - Expected: 5 PASS, 1 FAIL (TC-4 contract test)
   - Commit + push to `task/1279a-msci-inclusion-cascade-red-test`

2. **Merge 1279a + Start Task 1279b (GREEN):**
   - After QA approves 1279a, merge to main
   - Read `docs/handoffs/TASK_1279b.md`
   - Create `src/domain/services/msciDetector.ts`
   - Modify `cascadeEngine.ts` + `cascadeExecutor.ts`
   - Write 8–10 GREEN test cases
   - Run: `bun test src/__tests__/1279*.test.ts`
   - Expected: All 16 tests PASS
   - Commit + push to `task/1279b-msci-inclusion-cascade-green-impl`

3. **QA Review + Merge 1279b:**
   - Write `reports/TASK_REPORT_1279a.md` + `TASK_REPORT_1279b.md`
   - Verify baseline 6171 → 6187
   - Verify no DDD violations
   - Approve + merge to main
   - Clean up branches + worktrees

---

## Questions for Developer?

Refer to:
- **Architecture/design:** `docs/TECH_1279.md` (this document covers all high-level decisions)
- **RED phase specifics:** `docs/handoffs/TASK_1279a.md`
- **GREEN phase specifics:** `docs/handoffs/TASK_1279b.md`
- **BA requirement:** `docs/REQ_1279.md`
- **Reference pattern:** Task 1278 (insider dump cascade) — same TDD structure
- **DDD rules:** `.claude/knowledge/dev-standards.md`
- **Cascade framework:** `.claude/knowledge/market-analysis.md` § Causal Cascade Framework

---

**Design approved for developer intake.** Ready to create SPRINT_GOAL.md + notify PM.
