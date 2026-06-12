# dev-frontend notebook

**Last updated:** 2026-06-12 | **Sprint:** QUE-TOOLTIP-DRY — QUE-TOOLTIP-DRY-1a codegen pipeline rewrite

> Archive: `docs/archive/notebooks/dev-frontend-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Status

2026-06-12 — QUE-TOOLTIP-DRY-1a codegen pipeline rewrite DONE. Commit 8f1fcdb0. scripts/gen-que-descriptions.ts rewritten: readFileSync que-reference.js → strip window.__QUE_REFERENCE__ wrapper + trailing semicolon → JSON.parse → emit 2-field interface (coreMeaning + marketTrendLabel). QueDescription 4→2 fields (dropped judgment_interpretation/image_action/state_trend). apps/frontend/app/lib/que-descriptions.generated.ts regenerated: 64 entries, header "Source: apps/kinh-dich-service/dashboard/que-reference.js". QueName.tsx: desc.state_trend→desc.marketTrendLabel, italic class removed from secondary tooltip line. 14 new vitest GREEN (entry count / interface shape / field rename / quẻ 1 spot-check / NFR-3 no-op). tsc 0 errors. Playwright 4/4 GREEN. Blocks QUE-TOOLTIP-DRY-1b.

Zone health: QUE-TOOLTIP-DRY-1a REVIEW, tsc clean, 14 new tests GREEN, Playwright 4/4, codegen SSOT aligned to kinh-dich-service | HEALTHY

2026-06-12 — REAUDIT-FE-003 NFR-C-4 stockPerformance direction arrow DONE. Commit 9bda7325. Live probe before coding: direction field confirmed LIVE on payload (DEV-REAUDIT-4 satisfied). StockPerf.direction? added as optional "up"|"down"|"flat". Exported directionArrow() → Unicode glyph (↑/↓/—/"") and directionArrowColorClass() → Tailwind class (mirrors changePctColorClass color family). Arrow rendered inline before changePct in table cell with aria-label (Tăng/Giảm/Đi ngang). undefined → "" backward compat (no crash). 21 new vitest GREEN (5 suites: glyph/colorClass/StockPerf-type/alignment/backward-compat). tsc 0 errors. Playwright 4/4 GREEN. Rebuild batched with FE-002 (ops to rebuild frontend after both FE-002+FE-003 are REVIEW).

Zone health: direction arrow live in market-summaries stock table, tsc clean, 21 new tests GREEN, Playwright 4/4 | HEALTHY

2026-06-12 — REAUDIT-FE-002 NFR-C-5 foreign-flow stale_fields column badge DONE. Commit 11308f1c. Contract probed live before coding: stale_fields=["currentHoldingRatio","maxHoldingRatio","marketCapBn"] confirmed on 2026-06-12. Pattern: ForeignFlowDto.stale_fields?:string[] + LoaderData.stale_fields:string[]; fetchForeignFlowData parses array or defaults to [] (backward compat). Exported isFieldStale(field, staleFields?) and staleColumnLabel(field, staleFields?) helpers. Column headers "Tỷ lệ sở hữu" + "Vốn hóa" render inline "Không có dữ liệu" badge (slate-700 bg, 10px) when field is in stale_fields. 15 new vitest GREEN (stale_fields parse/absent/empty/5xx/network/3-fields, isFieldStale 4 cases, staleColumnLabel 5 cases). tsc 0 errors. 4/4 Playwright GREEN. Rebuild batched with FE-003.

Zone health: foreign-flow page stale_fields badge live, tsc clean, 15 new tests GREEN, Playwright 4/4 | HEALTHY

2026-06-11 — REAUDIT-FE-001 NFR-C-1 stale banners DONE. Commit e787187f. 5 pages updated: conviction-history, corporate-events, shareholders, financials, reputation. Contract probed from LIVE before writing code (shareholders stale=true/staleByDays=3, financials stale=true/staleByDays=43, others false/0). Pattern: stale/staleByDays added to DTO+LoaderData+fetch helper+page component; amber banner with role=status renders when stale===true (hidden otherwise). conviction-history variable renamed stale→staleRows to avoid conflict with new loader field. 21 new vitest GREEN (reaudit-fe-001-stale-banners.test.ts: 16 suites covering stale=false/true/missing/502 for all 5 endpoints). tsc 0 errors. Pre-existing 21 nav count failures unrelated (confirmed via stash).

Zone health: Tier 4 stale banners live on 5 pages, contract from live payload, tsc clean, 21 new tests GREEN | HEALTHY

2026-06-11 — TASK-17-PAGE-13 Sự kiện doanh nghiệp gần đây DONE. Commit 0a6fbf42. api.corporate-events.tsx transparent proxy (?days=+?type= forwarded, arrayBuffer pipe, 502 on netfail, MCP_SERVER_BASE_URL SSOT; verbatim mirror of api.sector-cascade.tsx — diff: comments+path+additional ?type= param only). dashboard.corporate-events.tsx SSR loader fetchCorporateEventsData(origin, days?) exported named helper (non-fatal: 502/upstream-error/network-throw/bad-shape all return error+[]). HONEST FRAMING (load-bearing): backward-looking monitor — 0 future rows in source table; NO "sắp tới"/"upcoming"/"calendar" in any label. Lookback window selector: anchor links for [30,90,180,365] ngày (server round-trip, clampDays whitelist). Client-side category filter: tabs Tất cả/Cổ tức/Phát hành/Nội bộ/ĐHĐCĐ/Khác → filterEvents() on events[].category; counts from summary.{dividend/issuance/insider/meeting/other}. byType breakdown table (eventType+categoryLabel+count, desc). topActiveCodes chips {code:count}. Event list: code badge + categoryColorClass badge (emerald/blue/amber/purple/slate per category) + detail/title + eventDate right-aligned. Empty state: "Không có sự kiện trong khoảng thời gian này". PageHeader reused. TopNav ANALYST_NAV 18→19 (+Sự kiện doanh nghiệp /dashboard/corporate-events ENABLED), NAV_ITEMS 25→26. FE-HEADER-SSOT-top-nav.test.tsx updated (counts 18→19/25→26, +1 ENABLED assertion, 26 tests GREEN). 67 new vitest GREEN (task17-corporate-events-loader.test.ts, 16 suites: clampDays/ALLOWED_DAYS/categoryColorClass/filterEvents/FILTER_OPTIONS/fixture-A/fixture-B/category-filter-logic/byType/topActiveCodes/honest-framing/fetchData×5). tsc 0 errors. NOT pushed.

Zone health: Tier 4 routes +1 (corporate-events page), tsc clean, 67+26=93 scoped tests GREEN, ANALYST_NAV 19 items, NAV_ITEMS 26 | HEALTHY

2026-06-11 — TASK-17-PAGE-10 Tín hiệu dây chuyền theo ngành DONE. api.sector-cascade.tsx transparent proxy (?days= query string forwarded, arrayBuffer pipe, 502 on netfail, MCP_SERVER_BASE_URL SSOT). dashboard.sector-cascade.tsx SSR loader fetchSectorCascadeData(origin, days?) exported named helper (non-fatal: 502/upstream-error/network-throw/bad-shape all return error+[]). DISTINCT lens from PAGE-9: news/event CASCADE pressure (not price). netBias = up-down; netBiasLabel→TÍCH CỰC/TIÊU CỰC/TRUNG TÍNH; netBiasBadgeClass emerald/red/slate. Summary stat cards (bullishSectors/bearishSectors/neutralSectors). Top tích cực/tiêu cực cards. Sector ranking table (rank/ngành/Tăng/Giảm/Trung tính/Tổng/Xu hướng badge). "Tin tức kích hoạt gần đây" recentHits section: sector label + direction badge (Tăng/Giảm/Trung tính) + matchedText headline + hitAt + affectedStocks chips when non-empty; graceful when []. confidence shown inline only when non-null. sectorNameViMap: all 17 live sector keys mapped (gold_mining/machinery/chemicals/automotive/oil_gas/pharma new additions); getSectorNameVi fallback = raw key (never crash). Empty state (count=0 → honest "chưa có dữ liệu"). Exported helpers: fetchSectorCascadeData, netBiasLabel, netBiasBadgeClass, directionLabel, directionBadgeClass, formatHitAt, sectorNameViMap, getSectorNameVi. TopNav: ANALYST_NAV += "Dây chuyền ngành" (/dashboard/sector-cascade) — count 15→16, NAV_ITEMS 22→23. FE-HEADER-SSOT-top-nav.test.tsx updated (counts 15→16/22→23, +1 ENABLED assertion, 23 tests GREEN). 65 new vitest GREEN (task17-sector-cascade-loader.test.ts, 18 suites). tsc 0 errors.

Zone health: Tier 4 routes +1 (sector-cascade page), tsc clean, 65+23=88 scoped tests GREEN, ANALYST_NAV 16 items | HEALTHY

2026-06-11 — TASK-17-PAGE-9 Dòng tiền theo ngành DONE. api.sector-rotation.tsx transparent proxy (arrayBuffer pipe, 502 on netfail, MCP_SERVER_BASE_URL SSOT, no query params). dashboard.sector-rotation.tsx SSR loader fetchSectorRotationData(origin) exported named helper (non-fatal: 502/upstream-error/network-throw/bad-shape all return error+[]). Honest 5d-accumulating banner: when only1dAvailable===true shows blue info banner in Vietnamese — explains 5d classification NOT yet available, page ranks by 1d move, will auto-upgrade; never fakes DONG_TIEN_VAO/RA verdict. Summary stat cards (VÀO/RA/TRUNG LẬP counts). Top inflow/outflow highlight cards. Main sector ranking table (rank/sectorNameVi/avg1d/avg5d/badge/stockCount/stocks). watchlistWarning → amber ⚠ marker on row. Empty state (count=0 → honest "chưa có dữ liệu" card). Exported helpers: fetchSectorRotationData, formatReturn, returnColorClass, classificationLabel, classificationBadgeClass, format5dReturn, formatTradingDate. DJ-GATE-1: chose named-export fetchSectorRotationData (Remix strips loader in jsdom context; same pattern as all prior pages); only1dAvailable banner is the anti-demo invariant. TopNav: ANALYST_NAV += "Dòng tiền ngành" (/dashboard/sector-rotation) — count 14→15, NAV_ITEMS 21→22. FE-HEADER-SSOT-top-nav.test.tsx updated (counts 14→15/21→22, +1 ENABLED assertion, 22 tests GREEN). 54 new vitest GREEN (task17-sector-rotation-loader.test.ts, 21 suites). tsc 0 errors.

Zone health: Tier 4 routes +1 (sector-rotation page), tsc clean, 54 new tests GREEN, ANALYST_NAV 15 items | HEALTHY

2026-06-11 — TASK-17-PAGE-8 market-summaries archive DONE. api.market-summaries.tsx transparent proxy (period+limit+id forwarded, arrayBuffer pipe, MCP_SERVER_BASE_URL SSOT). dashboard.market-summaries.tsx dual-mode SSR loader: ?id=<id>→DETAIL (full narrative+keyEvents timeline+per-ticker performance table with client-side search box+recommendations table; item:null→honest empty-state "Không tìm thấy báo cáo"); no ?id→LIST (period picker with live counts from periods block, report cards with summaryPreview+chips). Live payload STEP 0 verified before typing: keyEvents={date,title,impact,direction}, stockPerformance={symbol,firstPrice,lastPrice,changePct,alertCount}, recommendations={symbol,outlook,confidence,reasoning}. Exported helpers: fetchSummaries, PERIOD_LABELS, formatDateRange, formatChangePct, changePctColorClass, outlookLabel, outlookColorClass, filterTickers. TopNav: ANALYST_NAV += "Lưu trữ Thị trường" (/dashboard/market-summaries) — count 13→14, NAV_ITEMS 20→21. FE-HEADER-SSOT-top-nav.test.tsx updated (counts+new-tab assertion, 21 tests GREEN). 62 new vitest GREEN (task17-market-summaries-loader.test.ts). tsc 0 errors. DJ-GATE-1 decision journal in sprint-CI-RED-RECONCILE-dev-frontend.md.

Zone health: Tier 4 routes +1 (market-summaries archive page), tsc clean, 62 new tests GREEN, ANALYST_NAV 14 items | HEALTHY

2026-06-11 — TASK17-AGM page DONE. api.agm-plan-actual.tsx transparent proxy (year+limit forwarded, arrayBuffer pipe, MCP_SERVER_BASE_URL SSOT). dashboard.agm-plan-actual.tsx SSR loader fetchAgmPlanActualData(origin, params?) exported named helper (non-fatal: 502/503/network-throw/bad-shape return degraded). Year selector via SSR GET param (Form+hidden input). SummaryBanner 4 chips: Vượt KH/Đạt/Chưa đạt/Đang thực hiện. Per-stock cards with 3 metrics (Doanh thu/LN trước thuế/LN sau thuế), progress bar, status badge. CRITICAL IN_PROGRESS guard: completion_pct null → "Đang thực hiện" not "0%", actual_ty null → "—" not "0 tỷ", grey bar not red BEHIND bar. ytd_ty context shown if non-null. TopNav: ANALYST_NAV + "Kế hoạch vs TH" (/dashboard/agm-plan-actual). Exported helpers: formatTy, formatPct, formatCompletion, statusLabel, statusColorClass. 44/44 tests GREEN. tsc 0 errors.

Zone health: Tier 4 routes +1 (AGM plan-actual page), tsc clean, 44 new tests GREEN, IN_PROGRESS regression guard shipped | HEALTHY

2026-06-11 — TASK-17 alerts RENDER FIX — signals[] string[]→Signal objects. Commit 4469dcd2. dashboard.alerts.tsx: Signal interface {type,severity,message,confidence}; signalTypeLabel() VN map (price_surge→"Giá tăng mạnh", volume_spike→"Khối lượng đột biến", news_mention→"Tin tức", unknown fallback=raw); SignalChip colours by signal.severity (high/critical=red, medium=yellow, low=grey), shows type label + confidence% + message as title tooltip; guards empty/missing fields (type:""→null render, confidence missing→omit%). AlertItem.signals typed Signal[]. task17-alerts-loader.test.ts fixtures re-seeded with object-shaped signals; Suite 8 (2-signal shape, 1-signal news_mention, empty-signals no-crash, multi-item 2-chip assertion); Suite 9 (signalTypeLabel VN mapping). 30/30 tests GREEN (+9 new). tsc exit 0. NOT pushed.

Zone health: Tier 4 alerts page + RENDER FIX complete, tsc clean, 30/30 tests GREEN | HEALTHY

2026-06-11 — TASK-17 alerts Alerts page DONE. api.alerts.tsx proxy (querystring limit+severity passthrough, arrayBuffer pipe, 502 on network fail, pass-through 4xx/5xx, MCP_SERVER_BASE_URL SSOT). dashboard.alerts.tsx SSR loader self-fetch fetchAlertsData(origin, params?) exported named helper (non-fatal: 502/503/network-throw/bad-shape all return degraded, count:0 → empty VN honest state). Summary header with per-severity chips (critical/high/medium/low), severity filter control (client-side), table newest-first (time-ago+timestamp, severity badge, signal tags, ticker+impact pills, message, confidenceScore%, outcome). TopNav: /dashboard/alerts comingSoon stub → ENABLED "Cảnh Báo". SSOT test updated (20/20 GREEN +1 Cảnh Báo ENABLED assertion). 21 new vitest GREEN. tsc 0 errors. NOT pushed.

Zone health: Tier 4 routes +1 (alerts page), tsc clean, 21 new tests GREEN | HEALTHY

2026-06-11 — TASK-17 intel AI Intel / CHEF Bulletin Hub DONE. Commit 7dea1291. dashboard.intel.tsx SSR page with fetchIntelData(origin) exported named helper (non-fatal: 502/503/network-throw/bad-shape all return degraded, count:0 → empty state). Latest CHEF dish prominent at top (whitespace-pre-wrap, emoji preserved), older dishes below. Vietnamese copy. PageHeader + ClientTimestamp reused. TopNav: /dashboard/ai-intel comingSoon stub → /dashboard/intel "Bản Tin AI" ENABLED. SSOT test updated (19/19 GREEN +1 new Bản Tin AI assertion). 16 new vitest GREEN (fetchIntelData: happy/empty/502/503/network-throw/shape-guard/text-preservation). api.market-digest.tsx proxy already live — NOT touched. tsc 0 errors.

Zone health: Tier 4 routes +1 (AI Intel page), tsc clean, 16+19 vitest GREEN | HEALTHY

2026-06-11 — TASK-17 P2-1b Price & Technical page DONE. Commit c38a5820. api.price-history.$ticker.tsx proxy (arrayBuffer pipe, days param forwarded, 502 on network fail, pass-through 4xx/5xx, MCP_SERVER_BASE_URL SSOT). dashboard.technical.tsx SSR loader self-fetch fetchPriceHistory extracted (non-fatal: 502/503/network-throw/bad-shape all return degraded, count:0 → empty state). LatestPriceStat colour-coded green(up)/red(down) direction+delta. StockChart REUSED (lightweight-charts, no new dep). StatsRow: period high/low, latest volume, trading days. TickerSwitcher: all active tickers from WATCHLIST_STOCKS SSOT. TopNav: "Kỹ Thuật" (/dashboard/technical) enabled. SSOT test updated 8→9 analyst items, 15→16 NAV_ITEMS, new Kỹ Thuật assertion. 23 new vitest GREEN. tsc 0 errors. 34/34 test files 459/459 GREEN.

Zone health: Tier 3 api layer complete, Tier 4 routes +1 (price/technical page), SSOT 18/18, tsc clean | HEALTHY

2026-06-11 — TASK-17 P1-3b Financial Reports hub DONE. Commits f1e7ec50 (feat) + 9f91194a (corrective: drop concurrent mcp-server contamination). api.analysis-briefs.tsx proxy (arrayBuffer pipe, 502 on network fail, pass-through 4xx/5xx, MCP_SERVER_BASE_URL SSOT). dashboard.bctc.tsx SSR loader self-fetch fetchAnalysisBriefs extracted (non-fatal: 502/503/network-throw/bad-shape all return error+[] items). Responsive grid of BriefCards — ticker, ExchangeChip, period+released, VerdictPill (Bullish/Positive/In-line=green, Bearish/Negative/Caution=red, neutral/unknown=grey), verdict_summary clamped 2 lines, ConfidenceBar. Client-side ticker search + HOSE/HNX/UPCOM exchange filter. Card whole-links to /dashboard/analysis?stock={ticker}. TopNav: Tài Chính (/dashboard/bctc) un-stubbed (comingSoon removed). SSOT test updated (17/17). New vitest 17/17 GREEN. tsc 0 errors.

Zone health: Tier 3 api layer complete, Tier 4 routes +1 (financial reports hub), SSOT 17/17, tsc clean | HEALTHY

2026-06-11 — TASK-17 P1-2b macro-regime page DONE. Commit d303d7d4. api.macro-regime.tsx proxy (arrayBuffer pipe, 502 on network fail, pass-through 4xx/5xx). dashboard.macro.tsx SSR self-fetch fetchMacroData extracted (non-fatal: 502/503/network-throw/bad-shape all return error string + null signals). InvestmentClockCard prominent phase + plain-VN explanation. 3 SignalCards (oil/gold/usdvnd) with DirectionPill BULLISH=green/BEARISH=red/NEUTRAL=grey. 4 IndicatorTiles (VNINDEX/Oil/Gold/USD-VND). Honest degrade: unavailable banner, stale banner, calendar.available:false shows note. TopNav Vĩ Mô comingSoon removed. SSOT test updated (17/17). New vitest 7/7. tsc 0 errors.

2026-06-11 — TASK-17 P1-1b news-sentiment page DONE. Commit 769a8131. api.news-sentiment.tsx proxy (arrayBuffer pipe, 502 on network fail, pass-through 4xx/5xx). dashboard.news.tsx SSR self-fetch non-fatal (empty-state on 5xx/network/shape-mismatch, never crash). SentimentPill green/red/grey. tickers+sectors chips when present. stale banner when stale_served=true. TopNav Tin Tức enabled (comingSoon removed). SSOT test updated. 23 new tests. 31/31 test files 411/411 GREEN. tsc 0 errors.

Zone health: Tier 3 api layer complete, Tier 4 routes +1 (news page), 411/411 Vitest GREEN, tsc clean | HEALTHY

2026-06-11 — TASK-17 watchlist Kinh Dịch tile enrichment DONE. Commit d1f831e0. Proxy route api.kinh-dich.reading.$code.tsx (API_GATEWAY_URL SSOT). fetchKinhDichReadingNonFatal non-fatal (null on 503/network). WatchlistTileData.kd optional. Loader enriches all tiles in parallel when overview visible. KdTilePill: QueName+signal pill+confidence bar; renders nothing on degrade. 30/30 test files 388/388 GREEN (+7). tsc 0 errors.

Zone health: test coverage stable, Tier 3 api layer complete, Tier 4 watchlist + analysis routes complete, KD enrichment non-fatal per spec | HEALTHY

2026-06-11 — GO-FLEET-DEPLOY correctness fix DONE. Removed "not deployed on this host by design" scaffolding from dashboard (banner, not_deployed_count/live_count, CapabilityBadge fallback, not_deployed_* display states, not_deployed as ServiceStatus). All services now genuinely deployed; unreachable service = DOWN (RED). VPS discrimination (503 no-such-host) remapped to down. 61/61 tests GREEN (3 test files updated). tsc 0 errors.

2026-06-06 — F-3 FETCH-OPS-PAGE-TRUTH REVIEW commit f02bbc66. Replaced Reuters/Bloomberg panels with real fetch-status data: 13 VN sources freshness table (ageMs humanized, green/amber/red dots), VPS proxy panel (5 legs), BCTC pipeline (pending/done/failed). New types: FetchSourceStatus, VpsProxyStatus, BctcPipelineStatus, FetchStatus + helpers formatSourceAge/sourceStatusColor. 380/380 Vitest GREEN (+17). tsc 0 errors. Container rebuilt 8626cacc51c0. Live 200 verified.
2026-06-06 — FIX-ORCH-DONE-GRID-COLS REVIEW commit f802b378. Extracted DONE_GRID const (120px|1fr|110px|90px|130px|24px) shared by header + all data rows; status_note moved to DecisionAccordion banner; Title cell min-w-0 + break-words + line-clamp-2. 363/363 Vitest GREEN. tsc 0 errors. Container rebuilt + live 200.
2026-06-05 — ARCH-ORCH-F3 REVIEW commit 1b71198a. Decision accordion on /dashboard/orchestration. StepDto+DecisionsDto types; DoneTaskGroup multi-open Set<string>; DecisionAccordion + StepCard inline; sprintId threaded from sprint_goal.sprint_id. 26 new tests. 353/353 GREEN. tsc 0 errors. Container rebuilt.
2026-06-05 — FE-HEADER-SSOT DONE commit 619093e1. PageHeader SSOT component; 8 pages migrated (0 raw h1 in routes); dashboard layout w-full centering. 320/320 Vitest GREEN (+7). tsc clean. NEEDS REBUILD: frontend.
2026-06-04 — DSI-S1-FE-TYPE DONE commit b16d6a89. StockQuote.change→number|null; added changePercent:number|null, staleness/isEstimate/fetchedAt. MacroSnapshot+MacroSignalEntry provenance fields. 303/303 Vitest GREEN (+8 new). tsc exit 0. NEEDS REBUILD: frontend.
2026-06-02 — FOU-3-FE DONE commit b5e92ee8. 2-axis Service Health (container × capability). 295/295 GREEN (+31). NEEDS REBUILD.
2026-06-02 — ORCH-DASH-LIVE DONE commit 8c30334a. Live auto-refresh /dashboard/orchestration. tsc clean. NEEDS REBUILD.
2026-06-02 — FE-AUDIT DONE commit 9372d7c0. VPS not-deployed discrimination + fetch empty label. 264/264 GREEN (+15). NEEDS REBUILD.
2026-06-01 — FBT-DEV DONE commit 80f2911b. BCTC-inspect + bctc-eval splat proxies. tsc clean.
2026-05-28 — BCTC-EVAL-FE COMPLETE. 204/204 Vitest GREEN (+21). tsc clean. Build ✓.
2026-05-26 — P2-F G10 blind-fix COMPLETE. direction-arrow.ts "↑↑" → "↑" fix (G10-injected bug). 179/179 Vitest GREEN. tsc clean. lint:fence 0. 1 cycle used.
2026-05-26 — Phase 2 P2-A + P2-B + P2-C COMPLETE. ESLint fence (G4) installed and proven. 179/179 Vitest GREEN. tsc clean. Stopping before P2-D (QA gate).
2026-05-25 — Phase 1 MVR COMPLETE. P1-A + P1-B1..B4 + P1-C + P1-E all DONE. 179/179 Vitest GREEN. 4/4 Playwright GREEN. G12 streak 3/3 COMPLETE. tsc clean.
2026-05-19 — Task 1956 emergency route rename complete. 2026-05-18 — Task 1945b-frontend complete. 20/20 tests GREEN. 144/144 full suite GREEN. 0 tsc errors.

## Tech stack (confirmed)

- Framework: Remix 2 (Vite plugin)
- Language: TypeScript 5 strict
- Styling: Tailwind CSS 3 + CSS variable tokens
- UI lib: shadcn/ui (Radix primitives)
- Test: Vitest (unit) + Playwright (e2e)
- Port: 3001 (dev server)

## Zone health

2026-06-11: 61/61 changed-file tests GREEN, tsc clean, GO-FLEET-DEPLOY not_deployed removal complete — full fleet 9 services all deploy_up paths | HEALTHY
2026-06-06: 380/380 Vitest GREEN (+17 F-3 tests), tsc clean, F-3 fetch-status page live (13 VN sources, VPS proxy, BCTC pipeline, zero hardcoded names) | HEALTHY

<!-- Pruned 2026-06-05 (cap-compliance 205→192): oldest cycle P1-FE (2026-05-25, formatter extraction, commits 3ef797d0/eeb4d2f8/9b55a086) — superseded by Status summary; full detail in git history. Carried insight: Docker holds port 3001 (TCP LISTEN) even when container stopped → use PORT=3099 env for host-side Playwright runs. -->

## Key patterns

- ClientTimestamp component: SSR="...", after mount=toLocaleString("vi-VN") — eliminates root-level hydration cascade
- React hydration suppression is per-element (not inherited). Every ancestor containing locale-formatted text needs suppressHydrationWarning.
- process.env guard: `typeof process !== "undefined"` before bare process.env — browser bundle safe
- Promise.allSettled() for parallel fetch with per-source error isolation
- unknown + type guards (no `any`) in all API response parsers
- Remix .server suffix in route files with default export = Remix v7+ code-split violation

## Cycle P2-H — 2026-05-26 (macro snapshot signals keyed-object contract fix)

- Trigger: P2-H blocked on `snapshot.signals.map is not a function` (Go SignalResult = keyed object, not array).
- Architect ruling: 1d277bc7. Brief: `docs/architecture-briefs/2026-05-26-macro-snapshot-signals-contract-ruling.md`.
- File 1: `app/domain/market.ts` — replaced `MacroSignal` + `MacroSnapshot.signals: MacroSignal[]` with `MacroSignalEntry` (heterogeneous optional fields) + `MacroSignals = Record<string, MacroSignalEntry>`. `MacroSnapshot.signals` now typed `MacroSignals`.
- File 2: `app/routes/dashboard.analysis.tsx` — `MacroSignalPanel`: `signals.map()` → `Object.entries(signals).map([key, entry])`. `InfoSourcePanel`: `.length > 0` → `Object.values().length > 0`; spread+sort → `Object.entries().sort()`. `indicatorLabel()`: added 6 new canonical key mappings. Import: `MacroSignal` → `MacroSignalEntry`.
- File 3: `app/__tests__/1934-macro-panel.test.ts` — appended `describe("MacroSnapshot signals — keyed-object contract")` with 4 assertions (not array, 6 entries, per-key field access, Object.values length).
- Verify: 183/183 Vitest GREEN (+4 new). tsc --noEmit exit 0. lint:fence exit 0. Remix build ✓ (114 + 21 modules).
- Macro service NOT touched. Frontend only.

## Cycle BCTC-EVAL-FE — 2026-05-28 (BCTC-EVAL-SUBSTRATE sprint)

- Task: BCTC-EVAL-FE — per-PDF eval scorecard Remix dashboard surface.
- Brief: docs/architecture-briefs/2026-05-28-bctc-eval-shared-substrate.md (§4 JSON contract, §8 FE design, §13 DDD table).
- shadcn install: `npx shadcn@latest add table badge collapsible` → 3 new components in app/components/ui/. Card/Button already existed.
- Domain types: app/domain/bctc-eval.ts (EvalStatus, GateFailure, EvalStage, EvalReportSummary, EvalListResponse, EvalDetailResponse, ThresholdsResponse).
- API client: app/lib/api/bctc-eval-client.ts (fetchBctcEvalList, fetchBctcEvalDetail, recomputeBctcEval, fetchBctcEvalThresholds). Base URL from MCP_SERVER_BASE_URL env var (NOT api-gateway). fetchBctcEvalDetail returns {data, status} to let loader discriminate 404 vs 409.
- Helper components: app/components/bctc-eval/StatusBadge.tsx, StageCard.tsx.
- Routes: dashboard.bctc-eval._index.tsx (list), dashboard.bctc-eval.$reportId.tsx (detail).
- Nav: dashboard.tsx NAV_ITEMS += { to: "/dashboard/bctc-eval", label: "BCTC Eval" }.
- Tests: bctc-eval-list.test.tsx (9 tests), bctc-eval-detail.test.ts (12 tests) — 21 new tests, all GREEN.
- Total: 204/204 Vitest GREEN. tsc --noEmit exit 0. bun run build ✓ (1615 + 32 modules).
- Key learnings:
  - lucide-react icons must be typed as `LucideIcon` (not inline ComponentType with `size: number`) — LucideProps.size accepts `string | number`.
  - fetchBctcEvalDetail wraps BctcEvalApiError internally to return {status, data} — loader can discriminate without throwing.
  - MCP_SERVER_BASE_URL is separate from API_GATEWAY_URL; BCTC eval routes go direct to mcp-server:3000.
  - `satisfies` operator in STATUS_CONFIG causes assignability friction with LucideIcon — use explicit `Record<EvalStatus, StatusConfig>` instead.

Zone health: 20/20 test files GREEN (204 assertions), tsc clean, build ✓, new BCTC eval surface complete | HEALTHY

## Cycle FBT-DEV — 2026-06-01 (FRONTEND-BCTC-TAB sprint)

- Task: surface mcp-server BCTC Inspect viewer at /dashboard/bctc-inspect via A2 server-side proxy.
- Files created/modified (apps/frontend/ ONLY, tsc --noEmit clean):
  - dashboard.bctc-inspect.tsx: resource route, raw Response, fetches upstream /api/bctc-inspect (WITH /api).
  - api.bctc-inspect.$.tsx: splat proxy for /api/bctc-inspect/* (GET+POST, binary-safe arrayBuffer, status relay).
  - api.bctc-eval.$.tsx: second splat proxy for /api/bctc-eval/* (correction 2 — eval tab fetches this prefix).
  - dashboard.tsx: NAV_ITEMS += { to: "/dashboard/bctc-inspect", label: "BCTC Inspect" } after "BCTC Eval".
- Router corrections applied: (1) upstream = /api/bctc-inspect not /bctc-inspect; (2) /api/bctc-eval/* separate splat.
- No collision: dashboard.bctc-eval.* = /dashboard prefix; api.bctc-eval.$ = /api prefix. Confirmed distinct.
- tsc --noEmit: exit 0 (zero errors). Commit: 80f2911b.
- Key patterns: arrayBuffer pipe (never .text()/.json() on binary); relay upstream Content-Type + status; 4xx→4xx.
- Zone health: tsc clean, 4 files changed (205 insertions), FRONTEND-BCTC-TAB SHIPPED | ops rebuild pending.

## Cycle FE-AUDIT — 2026-06-02 (Full frontend audit + fix)

Zone health: 264/264 Vitest GREEN (+15 new), tsc clean, 3 files changed | HEALTHY

- Task: Reveal ALL frontend problems and fix all (operator directive).
- Audit scope: all 9 routes (/, /dashboard, /dashboard/{analysis,bctc-eval,bctc-inspect,db,fetch,orchestration,services,vps}).
- All routes SSR HTTP 200. No ErrorBoundary throws live (orchestration was transient at 14:44Z rebuild).

**Fix 1: /dashboard/vps — VPS not_deployed discrimination (dashboard.vps.tsx)**
- Problem: news/stock/pdf showed UNKNOWN + red error "GET /health/news failed: 503 Service Unavailable".
- Root cause: api-gateway returns 503 with body {"error":"dial tcp: lookup news-fetch ... no such host"} for not-deployed containers; fetchServiceHealth throws ApiError on 503 → row.error set → "unknown" rendered.
- Fix: fetchVpsServiceHealth (new loader-local fn) reads 503 body; "no such host" DNS error → status "not_deployed" → grey "NOT DEPLOYED" pill. VpsNote updated with NOT DEPLOYED vs DOWN explanation.
- Test: vps-not-deployed-discrimination.test.ts (+15 assertions).

**Fix 2: /dashboard/fetch — honest empty label (dashboard.fetch.tsx)**
- Problem: Reuters (0) showed bare "No data available for Reuters." — reads as broken.
- Fix: HeadlineList empty state → two-line label: "No headlines available / Source not deployed on this host (FU-FE-NEWS-SOURCE)".
- No new tests needed (component logic, covered by audit).

- Commit: 9372d7c0
- tsc: exit 0. Vitest: 264/264. Mutex: acquired+released.
- NEEDS REBUILD: frontend (ops to dispatch)

## Cycle ORCH-DASH-LIVE — 2026-06-02 (live auto-refresh on orchestration dashboard)

Zone health: tsc clean, build green (1626 modules), single file changed | HEALTHY

- Task: ORCH-DASH-LIVE — add client-side polling to /dashboard/orchestration (no SSE/WebSocket).
- Approach: Remix useRevalidator + useEffect interval at POLL_MS=5000ms.
- Guards: skip tick if revalidator.state !== "idle" (no pile-up); pause when tab hidden; immediate refresh on visibilitychange back to visible.
- UI: LIVE indicator added to header (pulsing green dot + "LIVE" label; dims to "· refreshing…" on in-flight revalidation). StaleBadge + ClientTimestamp untouched.
- SSR safe: useEffect is client-only; typeof document check before reading visibilityState.
- Files changed: apps/frontend/app/routes/dashboard.orchestration.tsx only (52 insertions, 1 deletion).
- typecheck: tsc --noEmit → exit 0 (zero errors).
- build: remix vite:build → ✓ 1626 modules (client) + 38 modules (SSR), exit 0.
- Commit: 8c30334a feat(frontend): live auto-refresh on orchestration dashboard via useRevalidator polling (ORCH-DASH-LIVE)
- Key pattern: revalidator reference is stable between renders but the closure in useEffect captures the object ref; [revalidator] as dep is correct and does not thrash.
- NEEDS REBUILD: frontend (ops to dispatch)

## Cycle FOU-3-FE — 2026-06-02 (FRONTEND-OPERATOR-UX sprint — 2-axis Service Health)

Zone health: 295/295 Vitest GREEN (+31 new), tsc clean | HEALTHY

- Task: FOU-3-FE — 2-axis Service Health rendering (container × capability-via-mcp).
- Contract: docs/handoffs/FOU-3-FE.md. Brief: docs/architecture-briefs/2026-06-02-frontend-operator-ux.md §2.
- Files modified (apps/frontend/ ONLY):
  - app/domain/health.ts: added `CapabilityStatus` type; extended `ServiceRow` with `capability` + optional `capabilityNote`; added `capabilities` optional field to `GatewayHealthResponse`.
  - app/domain/health-compose.ts (NEW): pure compose logic — `composeRowDisplayState`, `composeOverallStatus`, `parseCapability`. Framework-free (no Remix/React imports) — importable by tests without runtime.
  - app/lib/api/client.ts: `GatewayHealth` interface gains optional `capabilities` map.
  - app/routes/dashboard.services.tsx: imports compose fns from health-compose.ts; loader merges capability from /health payload (graceful when absent → "n/a"); `StatusBadge` upgraded with optional `capability` prop; `CapabilityBadge` sub-component (private to route) renders blue/amber/grey; top-badge uses `composeOverallStatus` (ignores not_deployed); re-exports compose fns for test consumers.
  - app/__tests__/fou-3-fe-2axis-health.test.ts (NEW): 31 tests — all 5 display states, 4× anti-false-green (deployed+down × all 4 capability values → deployed_down), graceful degradation (absent/unknown cap → n/a), top-badge-ignores-not_deployed, PROVEN-RED scenario.
- Anti-false-green invariant: `composeRowDisplayState("down", any) === "deployed_down"` — verified by 4 explicit tests.
- Verify: 295/295 Vitest GREEN. tsc --noEmit exit 0. Commit: b5e92ee8.
- NEEDS REBUILD: frontend (ops) + api-gateway (ops, FOU-3-GW already done). Both rebuilds required before operator can see live capability badges.

## Cycle FE-HEADER-SSOT — 2026-06-05 (shared PageHeader + centering)

Zone health: 320/320 Vitest GREEN (+7 new), tsc clean, 12 files changed | HEALTHY

- Task: FE-HEADER-SSOT — create PageHeader SSOT component; eliminate per-page raw h1; full-viewport centering.
- Component created: app/components/PageHeader.tsx — props: title(required), subtitle?(optional), actions?(ReactNode, right-aligned).
- Routes migrated (8 pages): analysis, vps, services, fetch, db, orchestration, bctc-eval._index, bctc-eval.$reportId, _index.
- Dashboard layout: `<main>` changed from `p-6` to `min-h-[calc(100vh-3.5rem)] w-full p-6` + inner `mx-auto w-full max-w-screen-xl` centering container.
- _index.tsx: `main` changed to `flex min-h-[calc(100vh-3.5rem)] w-full flex-col items-center justify-center`.
- All route containers changed from `max-w-*` constraining wrappers to `w-full` (centering now owned by dashboard.tsx layout).
- Per-page actions slots: orchestration gets stale+LIVE+timestamp; services gets StatusBadge+deployed-count; bctc-eval-detail gets StatusBadge+PEK badge+RecomputeHeader; others get timestamp only.
- Test: FE-HEADER-SSOT-page-header.test.tsx — 7 assertions (h1 role, CSS classes, subtitle present/absent, actions present/absent, subtitle+actions together).
- Key decision: centering via `max-w-screen-xl mx-auto` in layout container — consistent across all pages, avoids per-page max-w inconsistency (analysis was max-w-6xl, vps/services max-w-4xl, db/fetch max-w-5xl — all now unified).
- Commit: 619093e1.
- NEEDS REBUILD: frontend (ops to dispatch).

## Carry-over (next session)

- P2-D/E/G/H: QA gates (pending P2-H ops rebuild + Playwright).
- Dev note: always use PORT=3099 for host-side Playwright; Docker holds 3001 even when stopped.
- Dev note: `lint:fence` requires ESLINT_USE_FLAT_CONFIG=true (baked into script).

## Cycle DSI-S1-FE-TYPE — 2026-06-04 (DATA-SERVE-INTEGRITY sprint)

- Task: extend domain types with DSI provenance fields — additive only, tsc gate.
- Files changed (apps/frontend/ only):
  - app/domain/market.ts: StockQuote.change→number|null; added changePercent:number|null, staleness/isEstimate/fetchedAt optional. MacroSnapshot: added dataSource/is_estimate/source_tier/fedFundsRateIsEstimate/carrySpread(null)/carryRegime(null). MacroSignalEntry: added is_estimate/source_tier/fetched_at; regime+carrySpread nullable.
  - app/__tests__/dsi-s1-fe-type.test.ts (NEW): 8 tests covering AC-FE-2/4, backward-compat, null vs 0 semantics.
- Verify: 303/303 Vitest GREEN (+8). tsc --noEmit exit 0. Commit b16d6a89.
- Key pattern: change:null = unavailable (Tier-3 cache); change:0 = genuine flat day. changePercent is new nullable alias of Go *float64; changePct (existing WatchlistTileData field) is unaffected.
- NEEDS REBUILD: frontend container (ops to dispatch).

## Cycle TASK-14-TOOLTIP-FIX — 2026-06-11

- Task: Kinh Dịch quẻ hover tooltip content never appeared — `cursor-help` visible, no content paint.
- Root cause: `TooltipContent` className uses `tailwindcss-animate` utility classes (`animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*`, `data-[state=*]:*`). Plugin was not registered → classes generated no CSS → tooltip mounted at `opacity:0`, never transitioned.
- Fix path chosen: PLUGIN (kept shadcn animation contract intact).
- Files changed: `apps/frontend/package.json` (added `tailwindcss-animate ^1.0.7` devDep), `apps/frontend/tailwind.config.ts` (import + register plugin), `apps/frontend/package-lock.json` (updated by npm install).
- Verify: tsc --noEmit exit 0. Build succeeded 30.43 kB CSS. grep build/client/assets/theme-*.css confirms `animate-in`, `fade-in`, `zoom-in`, `slide-in-from` all present.
- Commit: 48eb49a0. Not pushed, not rebuilt — router owns both.
