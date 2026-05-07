# PO Triage Batch — 2026-05-07

**Processed:** 20 unresolved + 1 new report
**Deduplicated:** 10 root causes
**Output:** 8 actionable tasks (2 UNBLOCK/FIX, 4 MONITORING, 2 BACKLOG)

---

## Summary Table

| Report IDs | Root Cause | Type | Severity | Action | Owner |
|---|---|---|---|---|---|
| #2751 | vnstock-sync crash: Array.filter guard | FIX | HIGH | NEW TASK: 1850a | developer |
| #2752 | news-scout schema divergence | FIX | MEDIUM | NEW TASK: 1850b | developer |
| #2753, #2754, #2758, #2759, #2762, #2765, #2806 | pollNews 0 items — VPS/network | UNBLOCK | CRITICAL | MONITOR 24h; see recovery log 1847c | ops |
| #2755 | HSG price inconsistency: bootstrap vs history | FIX | MEDIUM | NEW TASK: 1850c | developer |
| #2756, #2757, #2760, #2761 | BCTC low confidence: FPT/VNM Q4 OCR | MONITORING | LOW | Threshold logic working; inserts with low_confidence flag | — |
| #2763 | Prediction system cold 10d | BLOCKED | MEDIUM | Depends on #2764 (outcome_check tool) | — |
| #2764 | run_prediction_outcome_check missing | BACKLOG | LOW | Post-U-5 feature; mark WONTFIX | — |
| #2766 | DBC domain misclassification | CLEAN | LOW | NEW TASK: 1850d | code-janitor |
| #2767 | Cascade rule gap: chem/petrochem | CLEAN | LOW | NEW TASK: 1850e | code-janitor |
| #2768, #2769, #2770 | Polymarket test fixture contamination | FIX | HIGH | NEW TASK: 1850f | developer |

---

## Detailed Resolution Map

### UNBLOCK (Recurring)

**Reports: #2753–2806 (×8) — pollNews 0 items**

- **Root cause:** Likely VPS tunnel connectivity or source disable
- **Evidence:** Task 1847c (2026-05-06) fixed "Cloudflare tunnel routing gap — VPS push scripts wrong path prefix. Fixed SSH. News restored (208 items/cycle)."
- **Current state:** News restored 2026-05-06; new report 2026-05-07 suggests possible regression or transient outage
- **Recovery SLA:** 24h observation window. If 0 items still shows 2026-05-08 06:00 UTC → escalate to ops with ECONNREFUSED or service-down evidence
- **Status:** MONITORING — No new task until SLA breach
- **Assignee:** ops (if escalated)

---

### FIX (Priority Order)

#### Task 1850a — vnstock-sync crash

- **Reports:** #2751
- **Issue:** `officers.filter is not a function` — missing Array.isArray guard on vnstock_officers.code
- **Files to check:** `apps/mcp-server/src/services/stockPriceService/vnstockSync.ts`
- **Fix:** Add guard before filter call
- **Tests:** Existing 1833i test suite covers this; verify re-pass
- **Type:** FIX
- **Severity:** HIGH (syncs fail → price data stale)
- **Owner:** developer

#### Task 1850b — news-scout schema mismatch

- **Reports:** #2752
- **Issue:** SKILL.md schema for `urgent_news` field diverges from actual MCP schema
- **Files to check:** `.claude/skills/news-scout/SKILL.md` vs `apps/mcp-server/src/interface/mcp/tools/briefings/newsScoutTools.ts` (MCP registration)
- **Fix:** Reconcile SKILL.md to reflect actual schema
- **Type:** FIX
- **Severity:** MEDIUM (documentation mismatch, not functional break)
- **Owner:** developer

#### Task 1850c — HSG price inconsistency

- **Reports:** #2755
- **Issue:** `get_price_history` bootstrap vs history show different change_pct for HSG (-21.63% vs +2.04%)
- **Root cause:** Likely double-computation or schema field mismatch (related to 1848a: `actionCode → code` rename)
- **Files to check:** `apps/stock-price/src/services/priceHistoryService.ts` (compare bootstrap vs historical query)
- **Fix:** Verify bootstrap and history use same formula for change_pct
- **Tests:** Add test case: call `get_price_history` with same date range twice, assert consistency
- **Type:** FIX
- **Severity:** MEDIUM (trust in data degraded)
- **Owner:** developer

#### Task 1850f — Polymarket test fixture contamination

- **Reports:** #2768, #2769, #2770
- **Issue:** Test fixtures `t163-mkt-*` leaked to prod environment; markets now breached/invalid
- **Root cause:** Test/prod data isolation gap
- **Files to check:** Backtest test fixtures location vs prod data directory
- **Fix:** Isolate test fixtures; add git ignore or separate test-data/ folder; regenerate prod markets from actual API
- **Type:** FIX
- **Severity:** HIGH (backtesting data corrupted; all prior runs suspect)
- **Remediation:** Mark affected backtest runs as "test_contamination=true", block them from analysis
- **Owner:** developer

---

### CLEAN (Knowledge DB Updates)

#### Task 1850d — DBC domain misclassification

- **Reports:** #2766
- **Issue:** Dabaco (DBC, agriculture) tagged as "tech" sector
- **Fix:** Update `docs/data/stock-classification.json` — DBC → agro/food sector
- **Type:** CLEAN
- **Owner:** code-janitor

#### Task 1850e — Cascade rule gap

- **Reports:** #2767
- **Issue:** Chemicals/petrochemicals domain missing from cascade alert map
- **Fix:** Update `.claude/knowledge/stock-classification.json` or cascade-rules file to add chem/petrochem rules
- **Type:** CLEAN
- **Owner:** code-janitor

---

### MONITORING (Non-actionable, track only)

#### Reports: #2756, #2757, #2760, #2761 — BCTC low confidence

- **Issue:** FPT & VNM Q4 2025 composite=0.10/0.00 (very low OCR confidence)
- **Context:** BCTC pipeline has intentional low-confidence insertion logic:
  - Confidence=0 → skip insert
  - 0 < Confidence < 0.2 → insert with `low_confidence=true` flag
  - Confidence ≥ 0.2 → normal insert, alert WORK channel
- **Current behavior:** If inserting with `low_confidence=true`, this is WORKING AS DESIGNED
- **Action:** Query BCTC store — are these 4 records present with `low_confidence=true`?
  - YES → WORKING AS DESIGNED, mark MONITORING
  - NO → insert logic failed, escalate to FIX
- **Status:** MONITORING until dev-team confirms insert status
- **Reference:** `.claude/knowledge/bctc-extraction-runbook.md` § "Low Confidence Handling"

---

### BACKLOG (Post-U-5)

#### Task 1850g — run_prediction_outcome_check tool missing

- **Reports:** #2763, #2764
- **Issue:** `run_prediction_outcome_check` tool not registered in MCP; prediction outcome cycle blocked 10d
- **Root cause:** Feature not yet implemented (post-U-5 scope)
- **Reference:** PO notebook (2026-05-06 session): "outcome tracking not implemented yet — Feature request post-U-5"
- **Status:** BACKLOG — Not a regression, intentional feature gap
- **Resolution:** Mark WONTFIX; trigger new SPRINT-S task for outcome_check tool + Brier calibration wiring after 2026-05-10 prediction outcome data accumulates
- **Depends on:** get_calibration_report() must show ≥5 outcomes by 2026-05-10

---

## New Tasks to Create

```markdown
| Task ID | Title | Priority | Type | Owner | Blocked by |
|---------|-------|----------|------|-------|------------|
| 1850a | FIX: vnstock-sync Array.filter guard — officers may be non-array | HIGH | FIX | developer | — |
| 1850b | FIX: news-scout schema reconciliation — SKILL.md vs MCP schema | MEDIUM | FIX | developer | — |
| 1850c | FIX: HSG price inconsistency — bootstrap vs history change_pct | MEDIUM | FIX | developer | — |
| 1850d | CLEAN: DBC sector classification — agriculture not tech | LOW | CLEAN | code-janitor | — |
| 1850e | CLEAN: cascade rule gap — add chemicals/petrochemicals | LOW | CLEAN | code-janitor | — |
| 1850f | FIX: Polymarket test fixture contamination — isolate t163-mkt-* | HIGH | FIX | developer | — |
```

---

## Channel Audit Signals (Step 0)

From new report #2806 + context of 1847c recovery:

| Channel | Signal | Action |
|---------|--------|--------|
| WORK | pollNews 0 items recurring ×8 on 2026-05-07 (after 1847c fix 2026-05-06) | MONITOR 24h for regression |
| BUG | Multiple LOW-severity schema mismatches (#2752, #2755) | Route to developer for batch review |
| — | Test fixture contamination (#2768–2770) HIGH severity | Escalate; may require backtest run invalidation |

---

## Pipeline Status

- **Idle since:** Sprint 1846 DONE (2026-05-03)
- **Current date:** 2026-05-07
- **Next action:** Wait for developer feedback on 1850a–1850f tasks
- **U-5 gate:** Unblock 2026-05-10 if get_calibration_report() ≥5 outcomes

---

## Appendix: Deduplication Rules Applied

1. **Multiple pollNews 0 items** (×8) → 1 MONITORING issue (shared root cause: VPS/network)
2. **Multiple BCTC low confidence** (×4) → 1 MONITORING issue (working as designed)
3. **Multiple Polymarket stale** (×3) → 1 FIX issue (test fixture leak)
4. **Prediction blocked** (#2763) + **Tool missing** (#2764) → 1 BACKLOG issue (feature gap, not regression)

---

Generated by PO — Triage flow Step 0 complete.
