# dev-mcp-server -- Notebook

## 2026-07-08 — FACTORY-APP-dedup-date-freshness-helpers → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

`midnightVietnamAsUtc`/`todayVietnam`/`parseAffectedCodes`/`isPriceFresh` were duplicated verbatim in `assembleBriefing.ts` and `assembleEveningSummary.ts` (`todayVietnam` duplicated a 3rd time in `assembleAlertDigest.ts`, using a bare `7*3_600_000` literal instead of `VN_OFFSET_MS`). One home each: `domain/services/timeHelpers.ts` (date fns — `timeConstants.ts`'s own header forbids functions, so this is a new sibling module), `domain/utils/affectedCodesParser.ts` (pure JSON parse, no I/O — same layer as sibling `sqlHelpers.ts`/`safeQuery.ts`), `application/utils/priceFreshnessGate.ts` (`isPriceFresh(db, logLabel)` — takes the per-caller log label as an arg since application/utils may import `infrastructure/logger.js`, same precedent as sibling `windowPartitioner.ts`; domain/utils cannot). Added named `PRICE_FRESHNESS_MS = 24*MS_PER_HOUR` to `timeConstants.ts` (mirrors existing `VN_INDEX_FRESHNESS_MS`), replacing the bare `<=24` literal — preserved via `ageHours <= PRICE_FRESHNESS_MS/MS_PER_HOUR` (same rounded-hour comparison as before, not a raw-ms rewrite, to keep the 24h29min edge-case identical).

New test `FACTORY-APP-dedup-date-freshness-helpers.test.ts` (15 assertions). tsc clean. Targeted suite (14 files incl. all 3 call-sites) 206/206 pass. Full `bun test`: 14346 pass/40 skip/71 fail/10 errors/1180 files (612s) then the same Bun 1.3.13 crash-at-teardown as prior siblings — grepped the full log for every touched/created filename: zero mentions in fail/error output; all 71 fails are the documented pre-existing pollNews/VPS-push/RSS-timeout + shared-DB-race flaky class (Task 125's one briefing-adjacent fail is a pollNews network timeout, not an assembleBriefing assertion — passed 0-fail in the isolated targeted run). Server boot verified PORT=3998: health 200, toolCount=183 unchanged. scheduler cron.schedule grep=3 unchanged (no scheduler files touched).

Commit: dbb87db26. Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (application-layer usecase change runs against live briefing/evening/alert-digest cron paths).

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, server boot health 200 verified | HEALTHY.

## 2026-07-08 — FACTORY-APP-split-fetchParseAndStoreBctc → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

`fetchParseAndStoreBctc.ts` (895L) split into `bctc/resolvePdfText.ts` (Step 2 PDF download + OCR-cache fallback + news-chain-fallback terminal decision, discriminated-union return), `bctc/newsChainFallback.ts` (`tryNewsChainFallback`/`buildFiscalPeriod`/`buildAnalysisSummary`, 4 tuning literals hoisted to named exports `NEWS_FALLBACK_BASELINE`/`TEMPORAL_DISCOUNT`/`FALLBACK_CONF_MIN`/`FALLBACK_CONF_MAX` — resolved values unchanged), plus 2 extras beyond the backlog's named 2-file split (`bctc/types.ts`, `bctc/insertBctcAnalysis.ts` for Step 4) needed because the DoD's "orchestrator <=120L" is a hard constraint — the 2-file split alone left ~191L. Orchestrator is now 117L. The pre-existing per-date special-case (`signalText.includes('2023') && year===2024`) is left byte-identical, flagged as JANITOR-035 in `docs/data/code-janitor-known-findings.json`.

tsc clean. Targeted suite (17/18 relevant files, excluding FIX-1267): 156 pass/2 skip/0 fail. FIX-1267 AC-7/AC-8 reproduce identically on the unmodified pre-split file (confirmed via `git show HEAD:...`) — pre-existing subprocess/network-timing flakiness, not caused by this split. Also fixed `p2-f-rag-http-rewire.test.ts`'s AC that grepped the orchestrator for the string `ragHttpClient` — that import legitimately moved to `bctc/insertBctcAnalysis.ts` with Step 4, updated to check both files. Full `bun test`: 14353 pass/40 skip/64 fail/6 errors/1180 files (605s) then the known Bun 1.3.13 crash-at-teardown — only the 2 pre-existing-flaky FIX-1267 fails reference any touched file. Server boot verified PORT=3997: health 200 toolCount=183 unchanged, `/api/bctc-inspect` + `/dashboards/news-fetch/` both 200. scheduler cron.schedule grep=3 unchanged (no scheduler files touched).

Doc updates: `usecases.md` (split description), `pdfOcrWorker.ts` pointer comment relocated to `bctc/resolvePdfText.ts`.

Commit: 5027fda09. Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (BCTC pipeline runs against live named-volume market.db; RAW-verify of unchanged confidence values is this task's own DoD, routed via the Docker Microservice Code-Change Close Gate).

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, server boot health 200 + dashboard routes 200 verified | HEALTHY.

## 2026-07-08 — FACTORY-INFRA-split-vnstockBridge → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (isolated worktree — concurrent dev-mcp-server session working FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE in the main tree)

`vnstockBridge.ts` (1206L) held 11 inline Python `*_SCRIPT` templates, 9 of which re-embedded the identical FIX-FUNDAMENTALS-REFRESH-CRON-DEAD stdout-suppression preamble verbatim (proof the fix was hand-applied 9 times). Extracted each template to `fetchers/vnstock/scripts/*.ts` (one `buildXxxScript()` per data type); added `wrapVnstockScript(opts)` in new `fetchers/vnstock/runtime.ts` that owns the preamble once — 8 scripts plus `financials.ts` (2-dataframe variant via `resultVar`/`extraInit` options) now call it; `prices.ts` (multi-symbol loop) and `events.ts` (bypasses `Vnstock().stock()` via a viz-mock, pre-existing v4-compat workaround) stay bespoke, genuinely different control flow. `VnstockRateLimiter`/`runPython`/`runPythonWithBackoff`/backoff/junk-detection moved into `runtime.ts` (374L, size-justified — the backlog approach names this exact file). `vnstock/index.ts` barrel re-exports `runtime.ts`; `vnstockBridge.ts` (330L, size-justified — the approach explicitly keeps the 11 public fetch* wrappers as the one canonical import path 15+ tests/consumers depend on) imports the barrel + 11 script builders.

Verified via a scratch equivalence script comparing generated Python text pre/post-split (pre-split consts exported via `git show HEAD:...`) across 3 symbols × 11 templates = 35 checks: 32 byte-identical, 3 (financials.ts) differ only in a shortened shared comment (4 lines → 1 line) — confirmed line-by-line every subsequent statement (fetch calls, math, dict keys) is unchanged. tsc clean, eslint clean. Targeted vnstock suite (24 files) 252/252 pass. Server boot verified PORT=3996: health 200 toolCount=183 unchanged, `/api/bctc-inspect` + `/dashboards/news-fetch/` both 200. Gate 2d scheduler cron.schedule grep=3 unchanged. Full `bun test` run 1: 14349 pass/40 skip/68 fail/7 errors/1180 files (732.30s); run 2 (full log captured to a file, not `tail`-truncated, for exhaustive grep): 14350 pass/40 skip/67 fail/4 errors/1180 files (702.33s) — both then hit the known Bun 1.3.13 crash-at-teardown (non-authoritative). Exhaustive grep of run 2's complete 22.5k-line log: zero of the 67 `(fail)` lines mention "vnstock"; zero mentions anywhere in the whole log of `vnstockBridge.ts`/`vnstock/runtime`/`vnstock/scripts`/`wrapVnstockScript`/any of the 11 `buildXxxScript` names — confirms regression-free against the full suite, not just the targeted one.

Doc updates: `infrastructure.md` (vnstock Python Bridge section rewritten for the new file layout).

Commit: e27121d93. Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (vnstock fetchers run against live named-volume market.db; RAW-verify of unchanged fetch values is this task's own DoD, routed via the Docker Microservice Code-Change Close Gate).

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, server boot health 200 + dashboard routes 200 verified | HEALTHY.
