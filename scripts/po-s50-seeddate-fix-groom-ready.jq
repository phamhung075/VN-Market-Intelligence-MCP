# po-s50-seeddate-fix-groom-ready.jq
# Idempotent groom: INFRA-TEST-SEEDDATE-FIX -> claimable READY.
# Defect (last-ship, free-zone apps/stock-price/): fetchers_test.go:228
#   TestSQLiteRepo_GetHistory_OHLCFieldParity seeds daily_ohlcv at a HARDCODED
#   seedDate="2026-05-22" then asserts GetHistory("FPT",7) returns exactly 1 row.
#   Production GetHistory filters `date >= date('now','-7 days')` (CORRECT).
#   So the seeded row drifts OUT of the 7-day window once now > 2026-05-29 ->
#   len(history)==0 -> t.Fatalf. Today 2026-06-13 the test is ALREADY RED (rots
#   silently with calendar drift). NOT a runtime defect; fixture non-determinism.
# Generic fix (no hardcode / no widen-offset / no skip): make seedDate relative
#   to current date (e.g. time.Now().UTC().AddDate(0,0,-1)) so the row always
#   lands inside the lookback window regardless of run date.
# Idempotent: re-running yields identical state (sets explicit fields by id).

(.task_board.backlog[] | select(.id == "INFRA-TEST-SEEDDATE-FIX")) |= (
  .status = "READY"
  | .owner = "dev-stock-price"
  | .zone = "apps/stock-price/"
  | .blocked_by = []
  | .test_only = true
  | .no_rebuild = true
  | .acceptance_criteria = [
      "ROOT CAUSE: apps/stock-price/pkg/infrastructure/fetchers_test.go TestSQLiteRepo_GetHistory_OHLCFieldParity seeds daily_ohlcv with a hardcoded seedDate=\"2026-05-22\"; GetHistory filters `date >= date('now','-7 days')`, so the seeded row drifts out of the window once now > seedDate+7d and len(history) becomes 0. Today (2026-06-13) the test is already RED.",
      "GENERIC FIX: derive seedDate from current date at runtime so the row always lands inside the GetHistory lookback window — e.g. seedDate := time.Now().UTC().AddDate(0,0,-1).Format(\"2006-01-02\") and reuse that same value for the updated_at literal and the row.Date assertion. No hardcoded calendar date, no widening the -7d window, no t.Skip.",
      "ASSERTION INTACT: keep the asymmetric OHLCV field-parity assertions (open=10/high=40/low=5/close=20/volume=1000) and assert row.Date == the relative seedDate so any Scan column-transposition still fails loudly.",
      "DETERMINISM GATE: cd apps/stock-price && go test ./pkg/infrastructure/ -run TestSQLiteRepo_GetHistory_OHLCFieldParity -count=1 -v passes GREEN. Use -count=1 because Go's test cache does NOT key on wall-clock date and would otherwise serve a stale PASS/FAIL.",
      "ADVERSE-CONDITION PROOF: prove green under simulated future dates — run the package with libfaketime or a date-injection harness at now+30d, now+180d and now+1y (or, if no faketime available, document the relative-date math proving the seeded row is always >= date('now','-7d')). The fix must hold for any current date, not just today.",
      "NO REGRESSION: cd apps/stock-price && go test ./... -count=1 stays green; container health unaffected (test_only — no rebuild, no deploy).",
      "SCOPE: edit ONLY apps/stock-price/pkg/infrastructure/fetchers_test.go (and, if a shared test helper is cleaner, a sibling *_test.go in the same package). Do NOT touch production fetchers.go — GetHistory windowing is correct."
    ]
  | .target_files = ["apps/stock-price/pkg/infrastructure/fetchers_test.go"]
  | .gate = "cd apps/stock-price && go test ./pkg/infrastructure/ -run TestSQLiteRepo_GetHistory_OHLCFieldParity -count=1 -v is GREEN at today's date AND at simulated future dates (now+30d / now+180d / now+1y); go test ./... -count=1 green; container health unaffected."
  | .priority = "medium"
  | .groomed_at = $now
  | .groomed_by = "po"
  | .note = (.note + " | [po S50 groom " + $now + "] -> READY. Confirmed ALREADY RED today (seedDate 2026-05-22 + 7d window, now 2026-06-13). Generic relative-date fix; test_only/no_rebuild; -count=1 cache-defeat + future-date proof gate.")
)
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
| ._updated_at = $now
| ._updated_by = "po"
