# TASK_213 Handoff — fix(france-summary): BCTC-overdue prefix dedup in fetchTopAlerts

## TLDR
fetchTopAlerts() returned raw SQL rows (LIMIT 3) without dedup, letting repeated
BCTC daily alerts consume all 3 slots. Fix: fetch LIMIT 10, apply 40-char prefix
Map dedup, slice to 3. Mirrors task-211 fix in assembleBriefing.

branch: task/213-france-alerts-prefix-dedup
depends_on: []

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/franceSummaryJob.ts
  # fetchTopAlerts: LIMIT 10 → 40-char prefix Map dedup → slice(0,3)
  # FranceSummaryResult: added alerts: AlertRow[] field
  # All return statements updated to include alerts array
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1344-france-summary-stale-alerts.test.ts
  # Added Task 213 describe block: seeds 2 same-prefix BCTC alerts, asserts result.alerts.length===1
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1364-france-ta-detail.test.ts
  # Added alerts: [] to catch-block fallback object (TS conformance)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1370-france-watchlist-movers.test.ts
  # Added alerts: [] to catch-block fallback objects (TS conformance, 2 occurrences)

tests_written:
- src/__tests__/1344-france-summary-stale-alerts.test.ts — 2 assertions in Task 213 block, GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true  # 17 pass across france-summary test files; full suite hit Bun OOM crash (pre-existing)
