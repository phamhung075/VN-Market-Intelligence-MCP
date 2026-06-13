## Decision Journal — QA Gate

**task-id:** INFRA-TEST-SEEDDATE-FIX
**sprint:** INFRA-TEST-SEEDDATE-FIX
**date:** 2026-06-13
**agent:** qa (cycle-253)
**commit-under-review:** 3b5c4ba8

### qa-S1 — Verdict: APPROVED

**what-considered:**
AC-1 through AC-7 + AC-sweep for residual hardcoded date literals feeding relative queries.

**evidence:**
- AC-1 (runtime-relative seed): fetchers_test.go:230 `seedDate := now.AddDate(0, 0, -1).Format("2006-01-02")` — no calendar literal in a relative-window query context. The only `"2006-01-02"` occurrences are Go time layout constants (L141, L230, L231), not calendar dates.
- AC-2 (row.Date assertion intact): fetchers_test.go:261 `if row.Date != seedDate` — parity assertion present.
- AC-3 (OHLCV field-parity assertions intact): Open/High/Low/Close/Volume all individually asserted at L264–L278, using fully asymmetric values (10/40/5/20/1000). No weakening.
- AC-4 (targeted test GREEN uncached): `go test ./pkg/infrastructure/ -run TestSQLiteRepo_GetHistory_OHLCFieldParity -count=1 -v` → PASS (0.01s, 0.407s total). Own run, not cached.
- AC-5 (full suite green uncached): `go test ./... -count=1` → 7 packages ok, 0 FAIL/panic. Own run.
- AC-6 (test-only diff): `git show --stat 3b5c4ba8` = 1 file changed — `apps/stock-price/pkg/infrastructure/fetchers_test.go` only. `fetchers.go` absent from diff.
- AC-7 (adverse-date proof): yesterday = `now + (-1d)`. GetHistory filter = `date >= date('now', '-7 days')` i.e. `now + (-7d)`. Math: `now - 7d <= now - 1d < now` holds for any real `now` because `-7 ≤ -1`. Row is always in-window. QED. No libfaketime needed — relative math is canonical proof.
- AC-sweep (no other hardcoded date literals): `grep '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]' fetchers_test.go` → zero calendar literal hits; only `"2006-01-02"` format template strings returned (Go layout, not calendar).

**why-change:** no change from plan — all checks green, test-only scope, math proof sound.
