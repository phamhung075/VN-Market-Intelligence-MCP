# dev-mcp-server -- Notebook

## 2026-07-08 — CONTAM-10-WRITER-H → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (pm-decomposed, dev-team dispatch)

VPS backfill queue poller (`POST /api/push-ohlcv-history`, ~15–30min cadence) was actively re-contaminating `daily_ohlcv` with whole-row thousand-scale bars (6,533 rows/27 tickers as of 2026-07-07) because `handlePushOhlcvHistory` did a raw INSERT + manual `validateOhlcvUnit` on **raw un-normalized** values — a naive per-row `>=100` floor that contaminated bars (e.g. open=131/close=130 for a stock worth ~130,000) pass undetected. Swapped for `writeOhlcvBatch(rows, db, {conflictStrategy:"backfill"})` — runs `normalizeOhlcvToVnd` + `detectAndNormalizeScaleFromPrevClose` (cross-day + `fetchCleanReferenceCloseMap` cleanRef guard) ahead of `validateOhlcvUnit`, matching Writers A/C/D. WIC-2 parse-and-reject pre-pass preserved verbatim; response `{ok,inserted,skipped,code}` now derives from `writeResult.written` / `writeResult.skipped + rejected.length`.

New `CONTAM-10-WRITER-H-backfill-scale-guard.test.ts` (3/3, live-HTTP-route, not unit-only): TC-WH-1 contaminated batch + cleanRef history → ×1000 corrected; TC-WH-2 brand-new ticker (no prior history) → written as-is (documents accepted cold-start gap); TC-WH-3 legit cheap stock → unchanged. Found + fixed 1 real regression while running the full suite: `TASK-VNINDEX-RS-B-durability.test.ts` FR-B1-TC2 asserted the OLD reject-on-open<100 semantics — updated (with inline rationale) to expect the new, correct, cross-writer-consistent ×1000 auto-correction instead of outright rejection.

Rebuilt `mcp-server` image (id `4c8ea4cfd41f`) but did NOT swap it into the running container — `docker compose up -d` is a gated live-container swap (standing policy, ops-owned). Full `bun test`: 14302 pass/57 fail/6 errors + Bun 1.3.13 crash-at-teardown (panic after summary line — known engine bug). Confirmed via git-stash-to-baseline isolation testing that the 57 failures are pre-existing full-suite-only flakiness unrelated to this change (2 representative files reproduce identically on baseline). Flipped task to REVIEW (not done_verified) — pending QA RAW-probe + ops-gated container swap before `CONTAM-10-EXEC-2` can proceed.

Zone health: tsc clean, tools=183 unchanged, targeted CONTAM-10 suite (5 files) 38/38 pass | HEALTHY.

## 2026-07-08 — FACTORY-INTERFACE-sequential-confidence-05-mask → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

`sequential-market-analysis.ts:170` `result.confidence = input.confidence ?? 0.5` fabricated a mid-point confidence whenever a hypothesis was stated without one. Now only assigns when `input.confidence !== undefined`; init default `confidence: 0` → `undefined`; type `number` → `number | undefined`. `generateRecommendations` also fixed to label an unstated confidence honestly ("No confidence stated: ...") instead of folding it into "Low confidence" — same fabrication one call deeper, and required for `exactOptionalPropertyTypes` to type-check the new union cleanly.

`AnalysisResult` (incl. `confidence`) is genuinely internal — `handle()` only ever returns `{status,thought,progress,nextSteps}`, never the result object. Added `_analysisState` (test/introspection-only, additive, not consumed by `registerSequentialMarketAnalysisTools`/the MCP SDK) so the fix is actually testable given that contract. Flagging for QA: the DoD's "served payload shows null/absent" RAW-verify language does not map to a live HTTP/MCP route today — verify at the unit level via `_analysisState`, not an HTTP probe.

New `FACTORY-INTERFACE-sequential-confidence-05-mask.test.ts` (5/5 pass): omitted confidence stays `undefined`; supplied confidence (0.9) unchanged; explicit `0` (falsy but stated) preserved; recommendation text no longer says "Low confidence" for an unstated one; `handle()` response shape unchanged.

Rebuilt `mcp-server` image (id `180382145ee7`) but did NOT swap into the running container (still `4c8ea4cfd41f`, serving CONTAM-10-WRITER-H) — ops-gated live swap per standing policy.

Full `bun test`: 14296 pass/40 skip/68 fail/10 errors (1176 files, 620s) then Bun 1.3.13 crash-at-teardown (known engine bug, non-authoritative). All 68 fails are pre-existing VPS-push/RSS/insider-transactions/foreign-flow network-flaky-in-sandbox class (1146/1324/1898b/1113/1518/083/etc.) — zero overlap with our changed file (grepped: no failing file imports `sequential-market-analysis`); isolation re-run of the top-2 offenders confirms unrelated (1146 alone: 17/17 pass; 1324 alone: fails identically, pure SQLite/rag-service network contention, no shared module with our change).

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, server boot health 200 + dashboard routes 200 verified | HEALTHY.

## 2026-07-08 — FACTORY-INTERFACE-source-confidence-10-mask → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

`finalizeBctcRefineTool.ts:398 row.source_confidence ?? 1.0` flagged by the same audit family as S6's sibling fix. Ground-truth investigation FIRST (not assumed): `parseRefinedMarkdown` already always computes a real per-row `source_confidence` (0.1 unparseable/0.2 red/0.4 yellow/1.0 no-flag — never absent), the existing `HC-human-confirm.test.ts` `DV-HC-SC` suite already proves all four variants persist end-to-end, and the live named-volume DB independently confirms it (`bctc_table_rows`: 380 rows @0.1, 2 @0.4, 3257 @1.0, 0 NULLs). The `?? 1.0` was provably unreachable dead code, not an active masking bug — documented honestly rather than claimed as "fixed a live bug."

Hardened the anti-pattern structurally anyway per the required discipline: local row-shape `source_confidence` retyped honestly `number | undefined`; INSERT-boundary fallback extracted into exported `resolveSourceConfidence()` — propagates a real value UNCHANGED (incl. edge cases 0 and 1.0) and falls to the schema default (`bctc_table_rows.source_confidence REAL NOT NULL DEFAULT 1.0`) ONLY when genuinely `undefined`. Column NOT NULL preserved (hard constraint, not made nullable). Added an invariant doc comment on `BctcTableRow.source_confidence` in refinedMarkdownParser.ts (0-diff).

New `FACTORY-INTERFACE-source-confidence-10-mask.test.ts` (6/6 pass) exercises `resolveSourceConfidence` directly at both boundaries — the "parser-absent" case can't be reproduced through the real pipeline today (parser never omits it), so it's tested at the resolver's own honest `number|undefined` signature instead.

tsc clean. Targeted+adjacent (HC-human-confirm/AR-parser-dv/W2-ROW-REPAIR/FU-5b/BANK-AWARE-1/FU-6f + new file) 167/167 pass. Full `bun test`: 14312 pass/58 fail/3 errors/1177 files — fail set is the pre-existing VPS-push/RSS/insider/foreign-flow network-flaky class (grepped: zero overlap with bctc/finalize/parser files), matching S6's documented baseline (14296/68/10). Image rebuilt (`35c8117c1f85`) but NOT swapped into the running container (still `180382145ee7`) — ops-gated per standing policy. Live-DB RAW-verify done against the actual named-volume DB inside the running container (not a decoy).

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 (known-stale baseline, unaffected), server boot health 200 + dashboard routes 200 verified | HEALTHY.

## 2026-07-08 — FACTORY-SCHEDULER-alert-confidence-literals → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

4 scheduler jobs persisted a frozen confidence literal (foreignFlowAlertJob 0.75, insiderCheckJob 0.85, bbAlertScanJob 0.65, taAlertScanJob 0.7) even though a real strength signal already existed (or was easy to add) right beside it. New `deriveConfidenceFromStrength()` (domain/services/alertConfidenceScorer.ts, pure linear interpolation base→ceiling, clamped) now drives all 4, fed by: foreignFlow's own `min(1,|totalNetVolume3d|/500k)`, insider's own `min(1,buyDays/10)`, and two NEW pure extractors — `computeBbBreakoutStrength` (band-penetration ratio) and `computeRsiExtremityStrength` (distance past 70/30 toward saturation, deliberately not `macd` which this job never otherwise reads). Base/ceiling pairs live in alertThresholds.ts (0.55–0.95 for the two HIGH-severity jobs, 0.55–0.85 for the two warning-severity TA scan jobs).

4 code commits (one job each) + 1 shared-test/doc commit + journal + board-flip, per instructions. Each job's test file got a new "two different magnitudes → two different confidences" test; 1 pre-existing literal assertion (1307 AC-1) recomputed 0.7→0.592; 1 (1309 AC-1) happened to still equal 0.65 exactly (floating-point-exact coincidence) so left untouched.

tsc clean. Targeted (5 files) 83/83 pass. Full `bun test` run twice: 14334/61/5 then 14342/53/4 (pass/fail/errors, 1178 files) — the count DIFFERING between two runs of identical code is itself evidence of pre-existing flakiness, not a regression; all failing files (19 total, VPS/RSS/network-timeout class) confirmed zero-import-overlap with the 8 changed/new source files, and `_deprecated/1302-technical-indicators.test.ts` confirmed via git-stash-to-baseline to fail identically pre-change.

Commits: c94c50e24/0bb264fa2/8d041fbb7/3978756bf (4 jobs) + b4e6fd54e (scorer tests+doc) + 7011746eb (journal) + 006cb3819 (board+head flip). Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (Docker Microservice Code-Change Close Gate — persisted signal/evidence confidence values change at runtime). `.head` synced in the same write (was stuck at claim-time `next_agent=developer`).

Zone health: tsc clean, tools unchanged, scheduler jobs unchanged (4 files edited in-place, no new/removed cron.schedule entries) | HEALTHY.
