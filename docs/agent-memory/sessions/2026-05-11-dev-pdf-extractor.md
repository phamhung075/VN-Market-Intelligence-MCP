# Session Log — dev-pdf-extractor — 2026-05-11

## Task: 1870a — VERIFY FPT BCTC Q4 2025 reparse post-hotfix

**Start:** 2026-05-11 04:40 UTC
**End:** 2026-05-11 04:50 UTC
**Result:** FAIL

## What was done

1. Read runbook + hotfix handoff files
2. Snapshotted pre-reparse DB state: net_revenue=20.22545, net_profit=14324284.500434
3. Confirmed hotfix code IS deployed in container (incomeStatementExtractor.ts has sentinel guards)
4. Diagnosed why reparse job returned `found:0` — FPT row already existed, disk-scan skips it
5. Deleted FPT Q4 2025 row to force reparse
6. First reparse attempt caused SQLITE_CORRUPT (bun -e running while container alive = concurrent write)
7. Recovered db using alpine sqlite3 `.recover` → container restarted healthy
8. Deleted row again, triggered reparse cleanly from within container exec
9. Post-reparse values identical to pre-reparse — hotfix doesn't cover this case

## Root cause confirmed

Mixed-unit PDF (balance sheet VND + giải trình triệu). P_NET_PROFIT regex matches balance sheet
"Lợi nhuận sau thuế chưa phân phối" (14.3T raw VND). Sentinel poisoned → m=0.000001 applied
to correctly-extracted triệu revenue 20,225,450 → stored as 20.22545.

## Files updated

- docs/TASKS.md — 1870a moved to Done with FAIL verdict
- docs/handoffs/TASK_hotfix_bctc_parser2.md — VERIFY 1870a FAIL appended to QA checklist

## Follow-up required

Task 1870b: Fix P_NET_PROFIT negative lookahead in incomeStatementExtractor.ts
