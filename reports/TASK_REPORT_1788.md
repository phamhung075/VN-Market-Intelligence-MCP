# Task Report: 1788 — News Alert Ticker False Positive HCM/TP.HCM
date: 2026-04-30
outcome: APPROVED

## Test Results
- Unit tests (1788 file): 10 passed / 0 failed
- Full suite: 8463 passed / 0 failed
- TypeScript: 0 errors

## DDD Compliance: PASS
- `newsNormalizer.ts` is in `domain/services/` — no imports from `infrastructure/` or `application/`
- Comments referencing infra paths are JSDoc only — no actual import statements

## Security: PASS
- Pure domain function — no SQL, no env vars, no credentials

## Issues Found
### Blocking
None

### Non-Blocking
None

## Acceptance Criteria Verified
- AC-1: "TP.HCM" in title — HCM not extracted
- AC-2: "TP HCM" (space variant) — HCM not extracted
- AC-3: "thành phố Hồ Chí Minh" in content — HCM not extracted
- AC-4: "TP.HCM" in content — HCM not extracted
- AC-5: parenthetical "(HCM)" still extracts HCM ticker (Pattern 1 unguarded)
- AC-6: alias "chứng khoán Hồ Chí Minh" still extracts HCM via stockAliases
- AC-7: alias "hcm securities" via detectStocksInText still matches
- AC-8: detectStocksInText with TP.HCM context does NOT match HCM via alias
- AC-9: pure geographic TP.HCM article — no HCM in affectedActions
- AC-10: multiple TP.HCM occurrences in long text — all blocked
- Look-behind window: 10 chars before match covers all "tp.", "tp ", "tphcm" prefixes
- 191 adjacent tests in newsNormalizer suite continue passing

## Merge Status
Merged to main as part of 1786+1788+1794 merge commit. Branch `task/1788-news-alert-ticker-fix` deleted (was already at main tip — code delivered in stacked branch).
