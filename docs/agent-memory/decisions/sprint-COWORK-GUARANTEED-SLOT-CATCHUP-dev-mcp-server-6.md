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
