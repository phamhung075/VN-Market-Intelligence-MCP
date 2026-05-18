# TASK 1948e-B — Add `legal_risk` dispatch block to news-scout flow

**Sprint:** 1948e-fix (child of SPIKE-1948e)  
**Date:** 2026-05-18  
**Owner:** dev-mcp-server (flow edit)  
**Priority:** MEDIUM  
**Size:** S (~25 min)  
**Branch:** `task/1948e-b-legal-risk-dispatch`  
**Zone:** `.claude/flows/news-scout/`  

---

## Context

SPIKE-1948e identified that `stage-signals.md` (news-scout flow) has **no dispatch path for legal risk events**. The flow recognises only two signal types:
- `urgent_news` — watchlist-hit breaking news
- `chain_catalyst` — macro catalysts and crisis ripples

When news-scout detects a legal event (prosecution, asset freeze, investigation) via `legalRiskDetector.ts`, it has nowhere to route it. This task adds a new dispatch block that routes legal risk signals to the alert bus.

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-1 | `.claude/flows/news-scout/stage-signals.md` contains a new dispatch block for `legal_risk` signals | grep -n "legal_risk" stage-signals.md (block present) |
| AC-2 | Block is positioned **before** the existing `urgent_news` block (processing order) | Line number check: legal_risk dispatch < urgent_news dispatch |
| AC-3 | Block fires when `legalRiskDetector.detectLegalRisk()` returns non-empty result OR article contains prosecution keywords + watchlist/reference-stock code | Manual code review: conditional check present |
| AC-4 | Block includes 6-hour dedup guard: suppress if `(stock_code, signal_type: "legal_risk")` pair posted within 360 minutes | Flow logic: dedup check before post_agent_signal |
| AC-5 | `post_agent_signal` call includes all required fields: `from_agent`, `to_agent`, `signal_type: "legal_risk"`, `stock_code`, `payload`, `ttl_minutes`, `finding_data` with `confidence_score` | Schema check: all 7 fields present |
| AC-6 | Confidence scores follow risk levels: 0.95 prosecution/asset_freeze, 0.85 tax/license issues, 0.70 investigation | Code review: confidence mapping correct |
| AC-7 | Integration test: post_agent_signal roundtrip + get_legal_risk_signals returns the signal | Test TC2: detect PC1 prosecution → post → query returns row |
| AC-8 | No changes to `verdictResolutionJob.ts` or alert_accuracy tables | grep verdictResolution stage-signals.md (no contact) |

---

## What Changes

**File:** `.claude/flows/news-scout/stage-signals.md`

Insert a new **Legal Risk Dispatch Block** BEFORE the existing `urgent_news` block. The block should:

1. **Detect legal risk:** Trigger when:
   - `legalRiskDetector.detectLegalRisk(articleText, watchlistCodes)` returns non-empty, OR
   - Article text contains any `CRIMINAL_PROSECUTION_KEYWORDS` (from `policyImpactMapper.ts`) AND a watchlist or reference-stock code is detected

2. **Dedup:** Before posting, query recent `agent_signals` for same `stock_code` + `signal_type = "legal_risk"` within 360 minutes. If found, suppress.

3. **Post:** Call `post_agent_signal` with:
   ```
   {
     "from_agent": "news-scout",
     "to_agent": "alert-commander",
     "signal_type": "legal_risk",
     "stock_code": "<TICKER>",
     "payload": {
       "title": "<headline>",
       "detail": "<riskType> — <matched patterns> — <source>"
     },
     "ttl_minutes": 360,
     "finding_data": {
       "title": "<headline>",
       "detail": "<riskType> — <matched patterns>",
       "confidence_score": <0.95 | 0.85 | 0.70>
     }
   }
   ```

4. **Stock resolution:** Use `detectStocksInText()` from `stockAliases.ts` to resolve ticker codes. This function checks both primary watchlist AND reference stocks (utilities, energy, etc.). PC1 is in `referenceStocks.utilities`.

---

## Pseudo-code (insert before `urgent_news` block)

```markdown
### Legal Risk Signal Dispatch

Legal risk event detected (prosecution / asset freeze / investigation) in article for PC1 or other watched ticker →

1. Check dedup: Recent `agent_signals` with `(stock_code, signal_type = "legal_risk")` within 360 min?
   - If yes: suppress, log "dedup hit"
   - If no: proceed to post

2. Classify risk level:
   - "prosecution" / "asset freeze" → confidence 0.95
   - "tax issue" / "license suspension" → confidence 0.85
   - "investigation" → confidence 0.70

3. Call post_agent_signal:
   signal_type: "legal_risk"
   ttl_minutes: 360 (legal events durable, no need for frequent repost)
```

---

## Files to Touch

| File | Change | Type |
|------|--------|------|
| `.claude/flows/news-scout/stage-signals.md` | Add legal_risk dispatch block before urgent_news | FLOW |
| `apps/mcp-server/src/__tests__/1948e-legal-risk-signal-type.test.ts` | TC2 integration test (detect + post + query) | TEST |

---

## Test Plan

**Test case TC2** (in `1948e-legal-risk-signal-type.test.ts`, added as integration test):

| Scenario | Setup | Action | Expected |
|----------|-------|--------|----------|
| TC2 | Mock article with "PC1 khởi tố" (prosecution keyword) | Call news-scout stage-signals logic (or simulate dedup check) | `post_agent_signal(signal_type: "legal_risk", stock_code: "PC1")` called with confidence 0.95 |
| TC2b | Dedup guard test: post PC1 legal_risk, wait 0 sec, re-run detector on same event | Second dispatch should suppress (6h dedup window) | No second post_agent_signal call |

**Note:** Full end-to-end news-scout cycle testing is ops responsibility (OBSERVE gates). This task verifies the dispatch block is wired correctly.

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| R-1: Dedup gate misses dupe legal events → signal posted every cycle | 6h TTL + explicit dedup check before post |
| R-2: TNB critic gate rejects low-confidence signals | Confidence ≥0.7 (investigation), ≥0.85 (tax), ≥0.95 (prosecution); all above TNB threshold 0.6 |
| R-3: Reference stock detection incomplete (PC1 not detected) | Use `detectStocksInText()` which resolves aliases and checks referenceStocks.utilities |
| R-4: Flow syntax error breaks news-scout cycle | Manual code review + linter check before merge |
| R-5: 1945 window contamination | No contact with verdictResolutionJob.ts or alert_accuracy |

---

## Dependencies

- **Depends on:** 1948e-A (SignalTypeSchema must include "legal_risk" first, though MCP passthrough already accepts signal_type TEXT)
- **Blocks:** None
- **Observational gates:** 1948e-OBSERVE (7-day shadow verification post-deploy)

---

## Notes

- This is a **flow instruction edit**, not code. No TypeScript compilation, no DB schema change.
- Dedup window: 360 minutes = 6 hours. Legal proceedings evolve slowly; no need for higher frequency.
- Confidence scores are **strict** (prosecution/asset_freeze @ 0.95 are well above TNB critic threshold 0.6).
- Post-deploy observational gate will verify ≥1 legal_risk signal detected for PC1 within 7d shadow window.
- Commit message: `fix(1948e-B): add legal_risk dispatch block to news-scout stage-signals.md`

---

## Acceptance Sign-Off

- [x] Flow syntax check: valid markdown, block positioned before urgent_news (line 35 vs line 98)
- [x] Code review: AC-3 through AC-7 verified
- [x] Integration test TC2: GREEN
- [x] Dedup guard TC2b: GREEN (suppress on re-run)
- [x] Ready to merge

---

## [Developer] Implementation Record

- **Files modified:**
  - `.claude/flows/news-scout/stage-signals.md` — Legal Risk Signal Dispatch block inserted before `urgent_news` at line 35 (block ends at line 97; `urgent_news` at line 98)
  - `docs/TASKS.md` — 1948e-B moved from Backlog → Done
- **Tests written:** `apps/mcp-server/src/__tests__/1948e-b-legal-risk-dispatch.test.ts` — 5 assertions, GREEN
  - TC1: detectLegalRisk prosecution signal for PC1 khởi tố article
  - TC2: post_agent_signal roundtrip → get_legal_risk_signals returns row
  - TC2b: dedup guard suppresses second (stock_code, legal_risk) within 360 min
  - TC3: confidence mapping all 7 risk types correct
  - TC4: AC-8 regression — no verdictResolutionJob contact
- **Git commits:** `ddff5105` fix(1948e-B): add legal_risk dispatch block to news-scout stage-signals.md
- **tsc status:** clean (0 errors)
- **Full suite:** 9574 tests / 0 fail (exit code 0)
- **Docs updated:** `docs/TASKS.md` — 1948e-B entry moved to Done
- **Graphify:** skipped (flow .md edit, no TypeScript domain change)
