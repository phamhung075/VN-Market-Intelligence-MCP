# dev-frontend notebook

**Last updated:** 2026-07-24 | **Sprint:** FACTORY-FRONTEND-split-market-summaries

---

## Session: 2026-07-24 (FACTORY-FRONTEND-split-market-summaries — BOUNDED-1 idle-pickup)

**FACTORY-FRONTEND-split-market-summaries DONE-CODE (rebuild-verify deferred) — 955L route split into domain formatters + 12 components**

Zone health: 83 test files; 2047 pass / 2 fail (pre-existing QUE-TOOLTIP, unrelated — confirmed still red with this change stashed out via git-stash A/B); tsc 0 errors | HEALTHY

Task: same split pattern as FACTORY-FRONTEND-split-dashboard-analysis — `dashboard.market-summaries.tsx` (list/detail dual-mode route).

Files created:
- `domain/market-summaries/format.ts` — 9 pure helpers moved verbatim (PERIOD_LABELS, formatDateRange, formatChangePct, changePctColorClass, directionArrow, directionArrowColorClass, outlookLabel, outlookColorClass, filterTickers). Ticket named only 5; extended to all 9 to avoid a route<->components circular import (the other 4 feed the split-out table components) — see decision journal S1/S2.
- `components/market-summaries/{PeriodBadge,CountChip,PeriodPicker,SummaryCard,TickerFilteredTable,KeyEventsSection,SectionHeader,ListView,StockPerformanceTable,RecommendationsTable,DetailView,DetailContent}.tsx` — 12 files, all <=120L (DetailView needed a 2nd split into DetailView+DetailContent after 1st pass landed at 131L)

Files updated:
- `routes/dashboard.market-summaries.tsx` — 955L→324L; types + `fetchSummaries` (verified inline here, NOT in `lib/api/client.ts` as the ticket assumed — left in place) + loader + thin ListView/DetailView composition remain; re-exports the 9 domain helpers for backward-compat
- `__tests__/task17-market-summaries-loader.test.ts` — 9 helper imports re-pointed `~/routes/...` → `~/domain/market-summaries/format`; fetchSummaries+types unchanged
- `docs/architecture/microservice/frontend/domain-model.md` — split documented (mirrors dashboard.analysis.tsx precedent section)

Equivalence proof (scratch, uncommitted, deleted after run): reference-identity (route re-export === domain export, same fn object) + golden-value assertions for all 9 helpers + proof canonical `change-pct.ts`/`direction-arrow.ts` return OBJECTS with `text-green-400` (confirms NOT reused) — 19/19 pass.

Commit: `e2f18a897` | tsc: 0 errors | vitest: 2047 pass / 2049 (same 2 pre-existing fail as baseline)

rebuild_required=true but SCOPE-BOUND to CODE-ONLY per task — NO rebuild performed (user-gated, one just ran). Live Playwright G12 render-gate DEFERRED to next rebuild batch; board flipped `in_progress`→`review`, `next_agent=qa`.

---

## Session: 2026-07-09 (FACTORY-FRONTEND-split-dashboard-analysis — BOUNDED-1 idle-pickup)

**FACTORY-FRONTEND-split-dashboard-analysis DONE — 1836L route split into formatters + 22 components**

Zone health: 83 test files; 2047 pass / 2 fail (pre-existing QUE-TOOLTIP, unrelated); tsc 0 errors; eslint clean (same 5 pre-existing react-hooks/exhaustive-deps errors in unrelated CorporateEventsZone/FinancialsZone/TechnicalZone, confirmed unrelated); Playwright G12 4/4 GREEN (isolated port) | HEALTHY

Task: direct sequel to FACTORY-FRONTEND-extract-computeDecision — split remaining 1836L `dashboard.analysis.tsx` per `docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md`.

Files created (20 commits, one extraction per commit):
- `domain/formatters/{signal-color,confidence-pct,confidence-label,indicator-label,signal-direction-label}.ts` — 5 pure helpers moved verbatim
- `components/analysis/{ConfidenceBar,SectionShell,StockSelector,WatchlistTile,WatchlistOverviewGrid,SectorPeersBar,MacroImpactPanel,KinhDichMarketPanel,MacroSignalPanel,StockTable,AnalysisDecision,InfoSourcePanel,buildInfoSourceRows,buildInfoSourcePriceTaRows,InfoSourceRow,StockSignalsPanel,MiniPriceTable,StockDetailPanel,StockDetailBottomGrid,AiDeepDivePanel,BriefSection,AccuracyDigestCard}.tsx` — 22 files, all <=120L (initial audit found 2 over: WatchlistTile 121L comment-trimmed to 119L; StockDetailPanel 133L split into itself 78L + new StockDetailBottomGrid 78L)

Files updated:
- `routes/dashboard.analysis.tsx` — 1836L→457L; only loader + default export + `AnalysisBriefDto`/`AnalysisBriefResult`/`StockDetail` types remain (now exported so moved components `import type` them — same pattern as FinancialsZone/NewsBuzzZone); honest size-justification header added (457L is smallest of 19 `/dashboard/*.tsx` routes in the zone, all currently unheaded — monorepo CI-size-lint-justification gate not built yet)
- `docs/architecture/microservice/frontend/domain-model.md` — formatters + component-split documented

RAW-verify: fresh isolated dev server (unused port, bypassing the stale live :3001 Docker container) — curl `/dashboard/analysis` (9/9 content checks pass) and `?stock=VNM` (8/8 pass, all StockDetailPanel sub-panels present); one anomaly found (2 deterministic null bytes mid-"định") confirmed PRE-EXISTING via git-stash A/B test against the original 1836L file — not a regression.

Commits: `a5e6294`..`41279090e` (18 extraction + 2 doc/fixup) | tsc: 0 errors | vitest: 2047/2049 | eslint clean | Playwright 4/4 GREEN

rebuild_required=true — route file touched; board flipped `in_progress`→`review`, `next_agent=ops` for Docker Close Gate.

---

## Session: 2026-07-09 (FACTORY-FRONTEND-extract-computeDecision — BOUNDED-1 idle-pickup)

**FACTORY-FRONTEND-extract-computeDecision DONE — computeDecision moved route→domain**

Zone health: 83 test files; 2047 pass / 2 fail (pre-existing QUE-TOOLTIP schema, unrelated); tsc 0 errors; eslint clean (pre-existing 5 `react-hooks/exhaustive-deps` config errors in unrelated components/analysis/* files, confirmed present before this change via git-stash diff) | HEALTHY

Task: `docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md` flagged `computeDecision` (TA/RSI/KD/price scoring, MUA MẠNH/MUA/GIỮ/BÁN/BÁN MẠNH) as business logic leaking into the interface layer (`dashboard.analysis.tsx`).

Files created:
- `app/domain/analysis/decision.ts` — `computeDecision` + `DecisionResult` moved verbatim; 13 inline magic numbers hoisted to named consts (`TA_TREND_SCORE`, `RSI_SCORE`, `KD_STRONG_SCORE`, `KD_CAUTION_SCORE`, `PRICE_TREND_SCORE`, `PRICE_TREND_LOOKBACK`, `RSI_OVERSOLD`, `RSI_RECOVERY_CEILING`, `RSI_OVERBOUGHT`, `STRONG_BUY_SCORE`, `BUY_SCORE`, `HOLD_SCORE`, `SELL_SCORE`) — if/else structure kept verbatim (no behavior change)

Files updated:
- `routes/dashboard.analysis.tsx` — local `computeDecision`/`DecisionResult` def removed; imports both from `~/domain/analysis/decision`; `decision` const explicitly typed `DecisionResult` (keeps the type import non-dead)
- `__tests__/1937-decision-logic.test.ts` — import re-pointed `~/routes/dashboard.analysis` → `~/domain/analysis/decision`
- `docs/architecture/microservice/frontend/domain-model.md` — `computeDecision` Business Rules section: source path + threshold-const note updated

RAW-verify: ran 7 representative (ta, reading, prices) tuples through the moved function directly (tsx script, not committed) — output byte-identical to the pre-move version for all 5 label branches (MUA MẠNH/MUA/GIỮ/BÁN/BÁN MẠNH) + null-TA path; matches existing 10-assertion test suite which stayed GREEN untouched.

Commit: `2819d710c` | tsc: 0 errors | vitest: 2047 pass / 2 pre-existing fail | eslint: clean (no new errors vs pre-change baseline)

rebuild_required=true — route file touched; board flipped `in_progress`→`review`, `next_agent=ops` for Docker Close Gate.

---

**Current state:** 83 test files; 2047 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate); DDD layers enforced; route-colocated DTO/parser/formatter families kept textually distinct across merged pages (do-not-homogenize); Playwright G12 gate must run with an unused `PLAYWRIGHT_PORT` override if the live frontend Docker container occupies :3001 (reuseExistingServer piggybacks on it otherwise, false-greening against stale code).
