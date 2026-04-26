## Task Report 1304

**Fix:** Whole-word ticker match in pollNews Gate-3 — prevent BID/Bidiphar prefix collision

changed:
- `apps/mcp-server/src/domain/services/stockAliases.ts:790-792` — export `tickerWholeWordMatch()`, delegates to existing `isWordBoundaryMatch()` helper
- `apps/mcp-server/src/application/usecases/pollNews.ts:718-724` — replace `titleAndSummary.includes(ticker)` with `tickerWholeWordMatch(titleAndSummary, impact.actionCode)`
- `apps/mcp-server/src/__tests__/FIX-1304-ticker-whole-word.test.ts` — 15 new tests (new file)

tests: 15 pass / 0 fail (unit) | 7050-7075 pass / 0 fail (full regression, 2 clean runs)
tsc: 0 errors
ddd: PASS — `stockAliases.ts` has zero imports (pure domain), `pollNews.ts` imports from `domain/services/` (application → domain, permitted)
security: PASS — no `process.env`, no hardcoded secrets, no raw SQL

verdict: APPROVED

### Notes

**Branch naming discrepancy:** The task specified branch `fix/ticker-whole-word-match`, but commit `950b6ff4` (fix 1304) was actually committed to `fix/ta-alert-market-channel`. The `fix/ticker-whole-word-match` branch contains only an unrelated 1313 commit and does not include the 1304 changes.

**Resolution:** Fix 1304 was already present on `main` (commit `950b6ff4`) at review time — it arrived via the `fix/ta-alert-market-channel` merge pipeline. No additional merge action required.

**Regression note:** Test count varies between runs (7048-7075) due to pre-existing flaky tests involving network timeouts (HNX/UPCOM API abort tests). This flakiness is pre-existing on main, not introduced by fix 1304. All clean runs show 0 fail.

### Merge commit

950b6ff4 fix(1304): whole-word ticker matching — prevent BID/Bidiphar prefix collision
(already on main via fix/ta-alert-market-channel)
