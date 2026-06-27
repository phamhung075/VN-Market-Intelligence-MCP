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
