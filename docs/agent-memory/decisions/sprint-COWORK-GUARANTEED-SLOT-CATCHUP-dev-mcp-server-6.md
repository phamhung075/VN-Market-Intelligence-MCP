# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-mcp-server (continuation 6)

**Sprint goal:** see sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server.md header — this file is a byte-cap rollover continuation (dual-axis cap check, base file capped 2026-07-31, -2 capped 2026-08-01, -3 capped 2026-08-06, -4 capped 2026-08-09, -5 capped 2026-08-13 on byte-axis).
**Agent:** dev-mcp-server
**Started:** 2026-08-13T18:36:27Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-08-14T06:10:00Z
**task-id:** FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET
**what-done:** Implemented architect blueprint verbatim: new `bctc_news_fallback_hints` table (schema-financial-reports.ts), rewrote `tryNewsChainFallback()` to persist there instead of `financial_reports`, rewrote 7 tests (6 named + Finding F-1), added FR-5 RAG-non-leak test + 2 serving-plane tests.
**what-considered:**
- Blueprint §4b's suggested arm-(b1) reason-string rewording ("no hint recorded") — REJECTED: would break the existing AC-2 test's `toContain("preserved")` assertion, which acceptance criterion 5 + blueprint §6 row 7 both require staying byte-unchanged. Kept the original "preserved" wording instead.
- RED-8's 2nd-call `pdfTextOverride` fixture (English text) — discovered it never actually parsed (zero-confidence/empty balance sheet); pre-fix this was masked by a stale financial_reports row from call 1 that a separate "Bug 1352a" extraction_method-only UPDATE silently re-stamped. Fixed root cause: replaced fixture with real Vietnamese BCTC minimal text (mirrors 048-ssc-pipeline.test.ts's MINIMAL_BCTC_TEXT) so the call genuinely succeeds, matching the test's own stated intent.
**why-decision:** Both deviations preserve the row's explicit acceptance criteria (AC-3 exact-rewrite-intent, AC-5 arm-b1 non-regression) more faithfully than following the blueprint's literal text where blueprint and AC conflicted; standing rule "fix root cause not recurrent symptom" for the fixture.
**why-change:** RED-before (git-stash A/B) confirmed 8/19 tests correctly RED against old impl; GREEN after restore. tsc clean, grep-verified zero `INSERT INTO financial_reports` remains in newsChainFallback.ts.

### STEP dev-team-router-S1 · dev-team · 2026-08-14T06:30:00Z
**task-id:** FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET
**what-done:** RAW-verify pass ahead of push (PUSH-AUTONOMY-1 §5 attestation), independent of dev-mcp-server's own self-report — router re-ran the check itself rather than trusting the notebook claim at face value.
**what-considered:** `grep -n "INSERT INTO financial_reports\|financial_reports" apps/mcp-server/src/application/usecases/bctc/newsChainFallback.ts` — confirmed zero write statements, only read/comment references. Confirmed `bctc_news_fallback_hints` table live in `schema-financial-reports.ts` (`initFinancialReportsTables()`, `UNIQUE(action_code, sort_key)`, indexed). Independently ran `bun test src/__tests__/1294b-bctc-fallback.test.ts` live (not from cache/mock) — 10 pass / 0 fail / 40 expect() calls; live log output confirms the actual code path (`"fallback hints recorded (bctc_news_fallback_hints, NOT financial_reports)"`) fires for real fallback cases, not a fabricated/stubbed assertion.
**why-decision:** RAW-verified — commits 215010308/af4d7e166/dd579e292 match their own claims; attesting to unblock push per PUSH-AUTONOMY-1 §5 (RAW-verify token in an added decisions/** line).

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-08-14T09:35:00Z
**task-id:** FIX-CI-BUNTEST-ALLZERO-OHLCV-FETCH
**what-done:** Diagnosed + fixed CI-red `ALLZERO-OHLCV-FETCH.test.ts` — AC-1..AC-3 fixtures hardcoded absolute dates (`2026-06-1x`) against `get_price_history`'s real `date('now','-N days')` SQL filter; wall-clock drift carried them outside the `days=60` window, so the file failed even in isolation (not cross-test leakage). Replaced literals with a `dateStr(daysAgo)` helper deriving fixture dates from `Date.now()` — same idiom already used in `178-price-history.test.ts`.
**what-considered:**
- Widen `days` param instead of fixing dates — REJECTED: masks symptom, next drift cycle re-breaks it; doesn't fix root cause.
- Freeze `Bun.env`/mock the clock — REJECTED: heavier, file has no existing clock-injection seam, `dateStr()` is the established repo convention for this exact class.
**why-decision:** Root-cause fix (dynamic relative dates) matches the sibling test's already-proven pattern; zero production code touched.
**why-change:** No change from brief — brief flagged "per-file isolation" as diagnostic hint; confirmed via isolated run the defect is intra-file (stale fixtures), not cross-file state leakage. Did not touch `FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL.test.ts` (the sibling FAILEDFILE) — separate board row, out of scope.
