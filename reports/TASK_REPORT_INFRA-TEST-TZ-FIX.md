## Task Report INFRA-TEST-TZ-FIX

changed: [apps/alert-engine/pkg/infrastructure/sqlite_test.go]
tests: 17 pass / 0 fail (TZ=UTC) | 17 pass / 0 fail (TZ=Pacific/Kiritimati) | 17 pass / 0 fail (TZ=America/New_York) | tsc: N/A (Go) | ddd: SKIP (test-only) | security: SKIP (test-only)
verdict: APPROVED

### AC Evidence

**AC4 — Scope:**
```
git show --name-only 02bed9fa
→ apps/alert-engine/pkg/infrastructure/sqlite_test.go
(only file — no prod code, no Dockerfile, no go.mod, no go.sum)
```

**AC3 — Determinism (verbatim, non-cached):**
```
TZ=UTC:
ok  github.com/vn-market-intelligence/alert-engine/pkg/infrastructure  0.418s

TZ=Pacific/Kiritimati (+14):
ok  github.com/vn-market-intelligence/alert-engine/pkg/infrastructure  0.429s

TZ=America/New_York (-4):
ok  github.com/vn-market-intelligence/alert-engine/pkg/infrastructure  0.431s
```
All three runs executed with `-count=1`; no "(cached)" output in any.

**AC2 — Fix quality:**
- `TestSQLiteAlertRepository_CountTodayAlerts` (L173): `refNow := time.Now()` → `todayNoon := time.Date(refNow.Year(), refNow.Month(), refNow.Day(), 12, 0, 0, 0, refNow.Location())` → `yesterdayNoon := todayNoon.AddDate(0, 0, -1)`. Injected reference, local-TZ noon, calendar-day step. Not hardcoded, not offset-widened, not t.Skip.
- `TestReadPendingOutcomeAlerts_ExcludesOlderThan90Days` (L347): `refUTC := time.Now().UTC()` → `refNoon := time.Date(refUTC.Year(), refUTC.Month(), refUTC.Day(), 12, 0, 0, 0, time.UTC)` → `old := refNoon.AddDate(0, 0, -91)`. Same pattern, UTC anchor.

**AC1 — Completeness audit of remaining time.Now() sites:**

| Line | Test | Site | Boundary-safe reasoning |
|------|------|------|------------------------|
| 138 | GetRecentAlerts | `now := time.Now().UTC()` | Fixtures at -5m and -60m relative to same `now`; query window is 30m. Pure relative ordering, no calendar-day bucket. Safe. |
| 217 | StoreAlert | `time.Now().UTC().Format(...)` | Only satisfies NOT NULL on `triggered_at`; no date assertion made. Safe. |
| 237 | HasDuplicateFingerprint | `now := time.Now().UTC().Format(...)` | Duplicate window is 60min; record inserted at `now` and checked immediately (0min gap). Always within window. Safe. |
| 284 | IsStockMuted | `time.Now().UTC().Add(+1*time.Hour)` | `muted_until` 1h in the future; production checks `muted_until > now`. Relative ordering (future > now), not calendar boundary. Safe. |
| 305 | IsStockMuted_Expired | `time.Now().UTC().Add(-1*time.Hour)` | `muted_until` 1h in the past; checks `muted_until > now` → always false. Relative ordering. Safe. |
| 326 | NullOutcomeOnly | `now := time.Now().UTC().Format(...)` | Assertion on outcome=NULL vs 'HIT', not on date filtering. Both records inserted at `now` (well within 90-day window). Safe. |
| 382 | RespectsLimit | `now := time.Now().UTC().Format(...)` | 5 records at `now`, limit=2 assertion. No date boundary. Safe. |
| 400 | ReturnsRequiredFields | `now := time.Now().UTC().Format(...)` | 1 record at `now`, asserts field values. No date boundary. Safe. |
| 432 | WriteAlertOutcome_Updates | `now := time.Now().UTC().Format(...)` | Provides valid `triggered_at`; assertion on outcome/outcome_at/outcome_detail values. Safe. |
| 468 | WriteAlertOutcome_Idempotent | `now := time.Now().UTC().Format(...)` | Same pattern; assertion on idempotency of outcome write. Safe. |

No remaining TZ-fragile sites found. All ±1h future/past mute fixtures are relative-ordering checks, not calendar-day boundary checks.
