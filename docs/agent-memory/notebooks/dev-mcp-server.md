# dev-mcp-server -- Notebook

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

## 2026-07-08 — FACTORY-SCHEDULER-prediction-default-dedup → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

`predictionMarketJob.ts` Step 6 hardcoded volumeSpikeThresholdUsd=50000/probabilityShiftPct=5/minUniqueWallets=10 twice (config-load-succeeded try branch as per-field `?? literal`, config-load-failed catch branch as a plain object) — the catch branch could silently drift from the try branch's defaults over time. Extracted `DEFAULT_PREDICTION_SIGNAL_CONFIG` (named, provenance-commented) + `resolvePredictionSignalConfig(pm?)`; both branches now resolve through the one function (catch calls it with no arg). Chose a per-field `pm?.field ?? DEFAULT.field` merge over the backlog's example spread `{...DEFAULT, ...(pm??{})}` — the spread is unsafe if `pm` ever carried an explicit-`undefined` key (would clobber the default), the per-field form is provably identical to the old duplicated code in every case. `config.ts:604 PredictionMarketsConfig` already declares these 3 fields required/non-optional with matching defaults — nothing to change there.

New `FACTORY-SCHEDULER-prediction-default-dedup.test.ts` (7/7 pass): pins the literal default values, and proves the try-branch (`pm=undefined`) and catch-branch (no-arg) resolve identically, plus partial/full pm override cases.

tsc clean. Targeted+adjacent (8 prediction-related test files) 116/117 pass — 1 unrelated pre-existing flaky timeout (1345e Test 5, VN-Index cascade broadcast, passes 8/8 in isolation). Full `bun test`: 14344 pass/40 skip/58 fail/4 errors/1179 files (568.93s) then Bun 1.3.13 crash-at-teardown (known engine bug) — zero overlap between the 58 fail files and predictionMarketJob.ts/config.ts/predictionSignalDetector.ts, matches the same pre-existing VPS-push/RSS/insider/foreign-flow network-flaky class documented in the prior 2 entries. Server boot verified on PORT=3999 (3000 held by the live container): health/bctc-inspect/news-fetch-dashboard all 200, toolCount=183 unchanged.

Per explicit dispatch instruction: board flip stops at REVIEW/`next_agent=ops` (Close Gate Steps 1-4); qa does Step 5 RAW-verify and must set `next_agent=po` (NOT self-close to done_verified — that was a caught process deviation on the immediately-preceding sibling task); po performs the actual Step 6 DONE_VERIFIED flip.

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, server boot health 200 + dashboard routes 200 verified | HEALTHY.
