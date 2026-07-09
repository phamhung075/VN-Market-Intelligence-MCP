# dev-frontend notebook

**Last updated:** 2026-07-09 | **Sprint:** SYSTEMIC-REMAKE-P1

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

## Session: 2026-07-02 (TASK-DASH-CRON-2 — Cron Recheck Table UI, Zone 2)

**TASK-DASH-CRON-2 DONE (implementation) — CronRecheckTable added to /dashboard/orchestration**

Zone health: 83 test files; 2047 pass / 2 fail (pre-existing QUE-TOOLTIP); tsc 0 errors; Playwright 4/4 GREEN (verified against a fresh isolated local dev server — see GOTCHA below) | HEALTHY

Task: build `GET /api/cron-status` proxy + `CronRecheckTable` UI section per `docs/handoffs/TASK-DASH-CRON-2.md` — Zone 2 of DASH-CRON-RECHECK-TABLE sprint, depends on TASK-DASH-CRON-1 (dev-mcp-server, APPROVED r3 commit `82907e5d`).

Files created:
- `routes/api.cron-status.tsx` — proxy, byte-for-byte mirror of `api.orchestration.tsx` (FR-4.1)
- `__tests__/TASK-DASH-CRON-2-cron-recheck-table.test.ts` — 41 assertions: `parseCronStatusDto`, `normalizeCronStatusA/B`, `normalizeCronRowA/B`, `cronStatusBadgeClasses`, `CRON_STATUS_LABELS`, `cronLayerLabel`

Files updated:
- `routes/dashboard.orchestration.tsx` — CronStatusDto types + `parseCronStatusDto` (mirrors `parseOrchStateDto`); loader `Promise.all`'s `/api/cron-status` alongside `/api/orchestration` (CN-4, parallel, no added latency); `CronRecheckTable`/`CronLayerTable`/`CronStatusBadge` components, rendered OUTSIDE the `state ? (...) : (...)` conditional (independent surface, AC-16/AC-25); RECHECK reuses existing `revalidator`; 2nd `FreshnessBadge` (slaTierKey=realtime); Layer-A/B visually distinct sub-sections; Layer-B `status` unconditionally forced `SESSION_SCOPED` (stronger than spec minimum — defends AC-14/NFR-7 even under malformed upstream); "Chưa từng chạy" for null `last_fire` (AC-20); all VN copy (AC-28)
- `docs/data/frontend-data-coverage-map.json` — +1 row incl. `route` field (BA's own FR-6 example omitted it; architect-flagged), rows 49→50, LIVE 39→40

GOTCHA (load-bearing for future Playwright runs): port 3001 is bound by the LIVE `frontend` Docker container (stale image, un-rebuilt) — Playwright's `webServer.reuseExistingServer: !CI` silently piggybacks on it instead of spawning a fresh dev server, which would false-green the G12 gate against OLD code with zero signal on the actual diff. Fix: `PLAYWRIGHT_PORT=<unused> npm run test:e2e` forces a genuinely fresh local Vite server on an unused port. No Docker container touched/rebuilt/restarted.

Container note: mcp-server rebuild for Zone 1 still user-gated — `GET /api/cron-status` 404s live today; proxy relays as-is, loader degrades to empty-shape DTO, table shows "Không có dữ liệu." until the rebuild ships (expected, not a defect).

Commit: `b563c0d2` (code+tests+docs), `3a29d352` (orch-state board) | tsc: 0 errors | vitest: 2047 pass / 2 pre-existing fail | Playwright: 4/4 GREEN (isolated port)

---

**Current state:** 83 test files; 2047 pass / 2 fail (pre-existing QUE-TOOLTIP schema); tsc 0 errors.
**Tech stack:** Remix 2 + TypeScript 5 strict + Tailwind 3 + shadcn/ui + Vitest + Playwright
**Key patterns:** useFetcher self-fetching zones; FreshnessBadge(intraday/daily/weekly SLA); safeFetch bounded; honest-NULL (null_reason + gray badge, never fabricate); DDD layers enforced; route-colocated DTO/parser/formatter families kept textually distinct across merged pages (do-not-homogenize); Playwright G12 gate must run with an unused `PLAYWRIGHT_PORT` override if the live frontend Docker container occupies :3001 (reuseExistingServer piggybacks on it otherwise, false-greening against stale code).
