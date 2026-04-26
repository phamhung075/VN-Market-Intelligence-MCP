# TASK 1332b — GREEN Phase: Insider Governance Signal Implementation

**Sprint:** 1332
**Phase:** GREEN — make all 1332a tests pass
**Size:** S
**Depends on:** TASK_1332a.md (RED phase complete, all tests confirmed failing)

---

## Goal

Add insider governance sell-high-buy-low keyword set to `VN_BEARISH` in `sentimentClassifier.ts`.
All 10 tests in `1332a-insider-governance.test.ts` must turn green. Zero regressions.

---

## File to Modify

**Single file:** `apps/mcp-server/src/domain/services/sentimentClassifier.ts`

Section: `VN_BEARISH` array (around line 125–242).

**No other files touched.** Domain layer only — zero infrastructure imports.

---

## Keywords to Add

Add after the Task 1315a block (after line ~242), before the closing `];` of `VN_BEARISH`:

```typescript
// Task 1332b: Insider governance — sell-high-buy-low pattern
// "Chủ tịch bán 88 triệu cổ phiếu giá cao rồi mua lại khi giá giảm"
// Governance red flag: insider extracted value at peak, re-entered at lower price.
// Weight 4: must beat incidental "mua lại" (bullish +1) + "giảm" (bearish +1) already scored.
// Compound phrase longest-first sort suppresses shorter "mua lại" sub-match.
{ word: "bán giá cao rồi mua lại", weight: 4 },
// Weight 3: standalone re-buy-after-drop phrase, confirms sell-high pattern context.
{ word: "mua lại khi giá giảm", weight: 3 },
// Weight 3: "sold then re-bought" without explicit price qualifier — covers headline variants.
{ word: "bán rồi mua lại", weight: 3 },
```

---

## Weight Rationale

The exact article headline fires these matches on the current (pre-fix) scorer:
- Bullish: "mua" sub-token overlap through "mua lại" → +1 (approximation; exact depends on phrase boundary)
- Bearish: "giảm" → +1, "bán ra" → +2 (already in table from Task 1308a)

Net before fix: bearish=3, bullish=1 — this suggests the current system may already lean bearish for the full headline, but the test confirms it was classified BULLISH in production (the article body, not just the title, is classified). The body contains phrases like "tích lũy cổ phiếu", "nhìn xa", "kế hoạch dài hạn" which the chairman used to explain the move — those are bullish-leaning. The compound phrase weight-4 ensures the governance signal dominates regardless of explanatory context in the body.

Score floor check for worst-case article body:
- "bán giá cao rồi mua lại" → bearish +4
- "mua lại khi giá giảm" → bearish +3 (if both match)
- "tích lũy" (not in bullish table) → 0
- "dài hạn" (not in table) → 0
- Plausible bullish leakage from explanatory text: +2 max

Net: bearish 7 vs bullish ≤ 2 → direction "bearish", confidence > 0.7. Passes TC-1332a-2.

---

## Insertion Point

```
// Task 1315a: Cost-push compound patterns (FR-5)
// Weight 3: beats generic "tăng"(w1)+"chi phí"(w2) in mixed text.
// Weight 4 (compound): net-bearish even with "tăng mạnh"(w2) co-firing.
{ word: "giá đầu vào tăng", weight: 3 },
{ word: "chi phí nguyên liệu tăng", weight: 3 },
{ word: "giá than tăng gây áp lực", weight: 4 },
{ word: "giá khí đốt tăng gây áp lực", weight: 4 },
{ word: "giá xăng tăng gây áp lực", weight: 4 },
{ word: "vật liệu xây dựng tăng giá", weight: 3 },
// ← INSERT HERE (Task 1332b block)
```

The sort `(a, b) => b.word.length - a.word.length` in `ALL_BEARISH` construction ensures "bán giá cao rồi mua lại" (28 chars) is evaluated before "bán rồi mua lại" (15 chars) and "bán ra" (6 chars), preventing sub-phrase double-scoring.

---

## Regression Guard

Before committing, run:

```bash
cd apps/mcp-server && bun test src/__tests__/1332a-insider-governance.test.ts
cd apps/mcp-server && bun test src/__tests__/1308a-sentiment-patterns.test.ts
cd apps/mcp-server && bun test src/__tests__/134-sentiment-classifier.test.ts
cd apps/mcp-server && bun test
```

Targets:
- 1332a: 10/10 pass (all green)
- 1308a: unchanged (all still pass)
- 134: unchanged
- Full suite: ≥ 6872 pass, ≤ 5 fail (no regression vs baseline)

---

## Acceptance Criteria (GREEN)

- [ ] All 10 tests in `1332a-insider-governance.test.ts` pass
- [ ] `1308a-sentiment-patterns.test.ts` still all pass (regression)
- [ ] `134-sentiment-classifier.test.ts` still all pass (regression)
- [ ] Full test suite: pass count ≥ 6872, fail count ≤ 5
- [ ] `bun tsc --noEmit` exits 0
- [ ] Diff is confined to `VN_BEARISH` array in `sentimentClassifier.ts` — no other file changes
- [ ] No infrastructure imports added to `sentimentClassifier.ts`

---

## DDD Layer Compliance

- `sentimentClassifier.ts` is `domain/services` — pure function, no I/O
- Adding keywords to a `const` array is a zero-layer-violation change
- No new functions, no new exports, no interface changes

---

## Commit Format

```
feat(domain): add insider governance sell-high-buy-low signal (task-1332b)

Add VN_BEARISH keywords for sell-high-buy-low pattern:
- "bán giá cao rồi mua lại" (w4)
- "mua lại khi giá giảm" (w3)
- "bán rồi mua lại" (w3)

Fixes: article "Chủ tịch Phát Đạt bán 88 triệu cổ phiếu giá cao rồi mua lại"
classified BULLISH instead of BEARISH.
```
