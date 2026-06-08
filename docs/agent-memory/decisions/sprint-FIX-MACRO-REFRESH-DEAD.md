# Decision Journal — FIX-MACRO-REFRESH-DEAD

**Agent:** dev-macro-indicators
**Date:** 2026-06-08
**Task:** FIX-MACRO-REFRESH-DEAD (priority: CRITICAL)

---

## What I found

### One-pass fail-loud audit — ALL swallows surfaced

**SWALLOW-1 (ROOT CAUSE A): env-var mismatch**
- `apps/mcp-server/src/infrastructure/microservices/clients.ts:26`
- Code reads `MACRO_SERVICE_URL`, docker-compose sets `MACRO_INDICATORS_URL`
- Result: `getMacroSnapshot()` always used `localhost:5004` (connection refused in container)
- Duration of failure: ~30 days (macro_indicators.fetched_at stuck at 2026-05-16)

**SWALLOW-2 (ROOT CAUSE B): outer catch swallows throw**
- `macroIndicatorRefreshJob.ts` outer catch (after line 413 in original)
- Catches all errors, sends Telegram alert, returns void
- `recordJobRun`/`wrapRun` NEVER sees a throw → records status='success'
- Observable evidence: all macroIndicatorRefreshJob runs show duration=82-347ms
  (real HTTP call would take 500ms+); status=success for 30+ days

**SWALLOW-3: inner upsert catch (non-fatal, acceptable)**
- `macroIndicatorRefreshJob.ts` line 250 — macro_indicators upsert error
- Logged as warn, continues — non-fatal by design (Telegram notification still goes out)
- Assessment: acceptable but should be auditable via logger.warn

**SWALLOW-4: commodity_prices inner catch (non-fatal, acceptable)**
- `macroIndicatorRefreshJob.ts` line 311 — commodity upsert error
- Same pattern as SWALLOW-3: non-fatal, logged

**SWALLOW-5: recordJobRun table-missing path**
- `cronJobRunStore.ts` line 214-217 — if insertCronJobRunStart fails, fn() runs without recording
- AND the inner catch swallows fn() errors silently
- Assessment: edge case (table always exists in production), acceptable

**SWALLOW-6: getMacroExternal never throws**
- `clients.ts:212-230` — entire function catch returns null, logged at WARN
- Assessment: correct design (optional enhancement data), non-blocking

---

## Decisions made

### Fix A: align env-var name
- Changed `MACRO_SERVICE_URL` → `MACRO_INDICATORS_URL` in `clients.ts:26`
- Why this over adding a second env var to docker-compose: the existing `MACRO_INDICATORS_URL`
  is already set in docker-compose and used by `macroHttpClient.ts`. Only `clients.ts` used the
  wrong name. Single fix, minimal blast radius.

### Fix B: re-throw in outer catch
- Added `throw err;` after the Telegram alert in `macroIndicatorRefreshJob` outer catch
- Why: `wrapRun` needs to see the throw to record status='error'. Without re-throw, any
  fatal error in the job produces a false-green SUCCESS row in cron_job_runs, making
  the green-while-stale condition invisible to monitoring and auditor checks.
- The Telegram alert still fires before the re-throw — no regression in observability.
- `recordJobRun` is documented as "NEVER re-throws" (it absorbs and records) so the
  cron scheduler loop is protected. The re-throw from the job function is absorbed by
  `wrapRun`'s try/catch.

### Fix C: new test file
- `FIX-MACRO-REFRESH-DEAD.test.ts` — 5 tests, all GREEN
- Tests: env-var wiring (MRD-01/02), fail-loud re-throw (MRD-03/04), happy path (MRD-05)

---

## Baseline evidence

**Before fix (stale):**
```
macro_indicators.fetched_at = 2026-05-16T22:41:54.294Z  (22+ days stale)
macroIndicatorRefreshJob duration = 82ms (near-instant = connection refused)
macroIndicatorRefreshJob status = success (false-green)
```

**After fix (fresh):**
```
macro_indicators.fetched_at = 2026-06-08 02:36:41 (fresh today)
getMacroSnapshot() returns live data: vnIndex=1809.99, oilUsd=95.06, usdVnd=26124
Fail-loud demo: threw=true, alert_sent=true, recorded_status={status:"error"}
```

---

## Commit
- `b7ce338f` — fix(mcp-server): FIX-MACRO-REFRESH-DEAD — silent-swallow + env-var mismatch
