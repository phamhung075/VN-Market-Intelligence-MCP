# dev-macro-indicators — Notebook

Zone: `apps/macro-indicators/` | Stack: Go 1.22 | DB: reads market.db (read-only)

**Runbook:** `docs/protocols/fail-loud-protocol.md` — SBV/FRED/computed staleness gates, fixture fallback tiers.

---

## Session 2026-06-15 (FIX-NSO-TRADE-VALUE-SCALE — column/unit/total-row misparse fix)

**Task:** Fix implausible `get_vn_trade_balance` values: import 212000mn, export 74000mn, balance -138000mn.

**RECON findings (excelize.GetRows probe on cached NSO Excel 646KB 2026-06):**
- Old parser read `col2` (Lượng/quantity in nghìn tấn) as the monetary value. For "Hạt điều" row (col0 blank, col2=74 nghìn tấn cashews), excelize formatted as "74" → ParseVNNumber → 74 → ×1000 = 74000 M USD (the wrong export value).
- Actual column layout: col3=monthly Trị giá (M USD), col6=YTD Trị giá (M USD), col9=YoY% (std float)
- Total row label = "TỔNG TRỊ GIÁ" in col0 (NOT blank col0 as assumed)
- Unit = Triệu USD (already M USD) — the ×1000 multiplication was wrong
- YoY% column uses standard decimal float "118.0" (NOT VN format) — ParseVNNumber("118.0") strips period → "1180" (wrong); fix uses strconv.ParseFloat
- HS rows: label in col1 (sub-label), after "MẶT HÀNG CHỦ YẾU" section header
- "MẶT HÀNG CHỦ YẾU" header row has only 1 col in GetRows → must check BEFORE minTradeCols guard

**Files modified (2):**
- `pkg/infrastructure/parsers_vmt_trade.go` — New column constants, total row by "TỔNG TRỊ GIÁ", plausibility guard
- `pkg/infrastructure/parsers_vmt_trade_test.go` — Corrected anchors, makeTradeRow helper, 3 plausibility guard tests (14 tests total GREEN)

**Commit:** 7a3da0df | Zone health: trade parser fully operational | HEALTHY

---

## Session 2026-06-21 (DSI-MACRO-PHANTOM-STALE-GUARD — DSI-INV-1 staleness gate)

**Task:** Fix phantom stale macro values (WTI=95.5, dow_jones=23750) served as current via tracked_indicators 48h window in buildMacroSection (mcp-server domain).

**Key decisions:**
- Tightened tracked_indicators freshness from 48h to 4h in `buildMacroSection` (domain/services/marketContextBuilder.ts).
- R-2 SQLite datetime string comparison trap: ISO-8601 'T' separator sorts after SQLite space separator. Fixed via epoch-seconds: `(strftime('%s','now') - strftime('%s', extracted_at)) < 14400`.
- Added `listTrackedIndicatorsFromDb(db)` to commodityTracker.ts — DB-injectable variant with `isStale` boolean.

**Tests:** 6 new (GUARD-1..6 all GREEN) + 13426 existing suite pass / 0 regression.
**Commit:** 3280d82a | Zone health: DSI-INV-1 staleness gate operational | HEALTHY

---

## Session 2026-06-27 (VMT-3a-MACRO-INDICATORS-PMI — BLOCKED assessment)

**Task:** Ship S&P Global VN Manufacturing PMI + MA3 in POST /macro-indicators handler.

**Assessment result: BLOCKED**

**Source probe (pmi.spglobal.com via VPS 125.212.251.27:3128):**
- List page `https://www.pmi.spglobal.com/Public/Release/PressReleases?language=en` → 87725B HTML, accessible via VPS. Shows ONLY current month (June 2026) releases — 167 items, all Jun 01 2026. No historical archive via URL params (?year=2026&month=05 returns same 87725B).
- Detail pages `https://www.pmi.spglobal.com/Public/Home/PressRelease/{uuid}` → HTTP 202 + 0 bytes (async page generation requiring JavaScript). Direct + VPS both return 202. Initial probe got PDF (CDN cache hit, NOT reproducible — subsequent attempts return 202).
- No PMI time series in any market.db table. `macro_indicators.manufacturing_pmi` is UPSERT scalar (single row per country, no history). `tracked_indicators` has zero PMI rows.

**Hard blockers:**
1. Detail pages require JavaScript async execution — Go HTTP client (direct or VPS) cannot satisfy; always 202 + 0B
2. List page shows current month ONLY — prior month UUIDs not discoverable (needed for MA3 lookback)
3. MA3 needs 3 monthly prints — no in-zone historical source satisfies this
4. No free unauthenticated S&P Global PMI API exists

**Dependency needed:** Flaresolverr/headless-browser for pmi.spglobal.com detail pages OR paid S&P Global API key; PLUS ops fetch-recon for 2-month backfill of prior UUIDs.

**No code written, no files modified, no tests, no commit (BLOCKED — assessment only).**

Zone health: 6 active endpoints healthy (IIP/trade/BOP/CPI/liquidity/snapshot); VMT-3a requires external dependency before implementation | HEALTHY

---

## Session 2026-06-29 (P0-3-OMO-CURVE — OMO short-rate curve + liquidity stress)

**Task:** Extend `get_vn_liquidity_state` additively: parse SBV OMO per-tenor winning-rate + member-ratio columns, derive implied short-rate by tenor, net_injection_5d, liquidity-stress label.

**Key decisions:**
- OMO parser (`parsers_vmt_sbv_interbank_omo.go`): col[1] members X/Y + col[3] winning rate now parsed per row. Added `parseTenorDays`, `parseOMORate`, `parseMembersXY` helpers. VN decimal comma normalization ("4,75" → 4.75). Zero-rate rows excluded from implied rates.
- Domain service (`services_vmt_omo.go`): `ComputeImpliedShortRates` buckets 7/14/28d + cross-tenor avg. `DeriveStressResult` strict boundaries (`< -20000` DRAIN, `> +20000` EASY, exactly ±20000 → NEUTRAL). Score nil when daysInWindow < 5.
- Persistence: `sbv_omo_daily` in `macro_indicators.db` (MACRO_DB_PATH env). ON CONFLICT(auction_date) DO UPDATE — idempotent (NFR-P03-3). DD/MM/YYYY → YYYYMMDD `substr` trick for correct SQLite ordering.
- `OMODailyRepository` interface in application (Fence-B). `SQLiteOMODailyRepository` in infrastructure (Fence-C via main.go only).
- `LiquidityStateResponse` additive: `OMOCurve *OMOCurveDTO` (omitempty). Safe-degrade: nil repo → `computeOMOCurveNoPersist` (rate data without DB).

**New files (8):**
- `pkg/domain/models_vmt_omo.go`, `pkg/domain/services_vmt_omo.go`, `pkg/domain/services_vmt_omo_test.go`
- `pkg/application/dtos_vmt_omo.go`, `pkg/application/usecases_vmt_omo_persist.go`
- `pkg/infrastructure/repository_vmt_omo_daily.go`, `pkg/infrastructure/repository_vmt_omo_daily_test.go`
- `pkg/infrastructure/parsers_vmt_sbv_interbank_omo_p03_test.go`

**Test results:** 11 suites GREEN. G12 sandbox: primitive 18/18, module 2/2 PASS. Fences A/B/C PASS. go vet clean.
**Commits:** cd8cfcc2 (impl) + c17e9f70 (orch REVIEW)
Zone health: HEALTHY | P0-3-OMO-CURVE → REVIEW
