# Handoff — P0-3-OMO-CURVE

**Task ID:** P0-3-OMO-CURVE  
**Sprint:** MARKET-INDICATOR-DEPTH-P0  
**Owner:** dev-macro-indicators  
**Zone:** `apps/macro-indicators/pkg/`  
**Size:** M (~2h)  
**Status:** READY  
**Depends:** []  
**Blocks:** []

---

## Overview

Extend the SBV OMO HTML parser to extract per-tenor winning rates and member participation ratios. Derive implied short rates by tenor (7d/14d/28d), compute net injection 5-day rolling sums, and classify liquidity stress conditions. The OMO curve is a key signal for central bank policy stance and interbank liquidity stress.

**Critical note:** The macro-indicators service is Go-based (`apps/macro-indicators/pkg/` and `apps/macro-indicators/cmd/`). The TypeScript `src/` directory is deprecated. Work in `pkg/` ONLY.

---

## Functional Requirements

### FR-1: Parse Per-Tenor Winning Rate from OMO HTML

- **Data source:** Existing SBV Liferay HTML fetch (www.sbv.gov.vn, Tier 1, already fetched by existing `FetchSBVOMOFromHTML` in pkg/infrastructure/parsers_vmt_sbv_interbank_omo.go)
- **Column to parse:** 4th column = "Lãi suất" (winning rate %) in each table row
- **Per-row capture:** Extend `OMOParseResult` struct with:
  - `Tenors []OMOTenorRow` where `OMOTenorRow = { OperationType string, TenorText string, VolumeBnVND float64, WinningRatePct float64, ParsedTenorDays int }`
  - Parse tenor text: "7 ngày" → 7, "14 ngày" → 14, "28 ngày" → 28. If parsing fails, set ParsedTenorDays = -1 (unknown).
- **Error handling:** If a row has missing or unparseable Lãi suất cell, set WinningRatePct = 0 and add a parse warning to `ParseWarnings []string` field. Do NOT fail the whole parse.
- **VN decimal handling:** Lãi suất values use Vietnamese decimal comma (e.g. "4,75%"). Normalize to float before storing.

### FR-2: Member Win Ratio per Row

- **Column:** "Số thành viên tham gia/trúng thầu" — two sub-numbers in format "X/Y"
  - X = members participating
  - Y = members winning
- **Parse:** Extract `MembersParticipating int` and `MembersWinning int` per row
- **Fallback:** If only one number present (older HTML format), set MembersWinning = MembersParticipating and note in ParseWarnings
- **Ratio:** `MemberWinRatio = MembersWinning / MembersParticipating` (0.0–1.0). Low ratio = competitive auction. High ratio ≈ 1 = loose conditions.

### FR-3: Implied Short-Rate by Tenor

- **Computation:** `ImpliedShortRatePct` = cap-weighted average of WinningRatePct across all "mua kỳ hạn" (add) rows in the same tenor bucket. Weight by volume.
- **Output fields in get_vn_liquidity_state / get_omo_curve response:**
  - `omo_rate_7d_pct`: float | null
  - `omo_rate_14d_pct`: float | null
  - `omo_rate_28d_pct`: float | null
  - `omo_weighted_avg_rate_pct`: float | null (volume-weighted across all tenors)
  - `omo_member_win_ratio`: float | null (average across rows)
  - `omo_auction_date`: string (already exists)

### FR-4: Net Injection 5-Day Rolling Sum

- **Persistence:** Store each day's `net_outstanding_bn_vnd = TotalAddBnVND - TotalAbsorbBnVND` in `sbv_omo_daily` table
- **New table (macro_indicators.db):**
  ```sql
  CREATE TABLE IF NOT EXISTS sbv_omo_daily (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_date            TEXT NOT NULL UNIQUE,
    add_bn_vnd              REAL NOT NULL,
    absorb_bn_vnd           REAL NOT NULL,
    net_outstanding_bn_vnd  REAL NOT NULL,
    weighted_avg_rate_pct   REAL,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```
- **DB location:** Per ARCH-RATIFY-OMO-1, uses new env var `MACRO_DB_PATH` (default `/app/data/macro_indicators.db`) for zone-owned SQLite.
- **Persistence pattern:** Write-on-fetch side effect in `LiquidityStateUseCase.Execute()`. When ParseOK=true, call `PersistOMODaily(result)` (idempotent ON CONFLICT REPLACE keyed on auction_date).
- **5-day rolling sum:** `net_injection_5d_bn_vnd` = sum of net_outstanding_bn_vnd over last 5 auction dates (skip gaps).

### FR-5: Liquidity-Stress Label

- **Computation:** Derive `liquidity_stress` label from combination of net_injection_5d + omo_weighted_avg_rate_pct:
  - `DRAIN` — 5d net < -20,000 BnVND (heavy absorption)
  - `TIGHT` — 5d net < 0 (net drain) AND rate rising (omo_weighted_avg_rate_pct > prev session)
  - `NEUTRAL` — within ±20,000 BnVND and rate stable
  - `EASY` — 5d net > +20,000 BnVND (heavy injection)
- **Gauge-readiness:** Output `liquidity_stress_score`: float 0.0–1.0 where 0=EASY, 0.5=NEUTRAL, 1.0=DRAIN. Linear interpolation. Return null when <5 auction dates in sbv_omo_daily.
- **Thresholds:** Approximate (architect/dev can adjust); the BA constraint is that they derive from REAL net_injection figures, not invented bounds.

---

## Non-Functional Requirements

- **NFR-P03-1:** Extend existing `get_vn_liquidity_state` response payload additive-only; do NOT break existing fields.
- **NFR-P03-2:** If `Tenors` array is empty (no per-tenor data parsed), the new rate/stress fields return null. Existing net_outstanding still serves; is_estimate=true propagates correctly.
- **NFR-P03-3:** `sbv_omo_daily` table is write-once per auction_date (ON CONFLICT REPLACE) — re-fetching the same HTML for the same auction rewrites the same row (idempotent).
- **NFR-P03-4:** Routes via gateway; `toolCount` updated in `docs/data/project-stats.json` (re-derived, not baked).

---

## Edge Cases

- **SBV publishes multiple auctions on same HTML page for different dates:** Parse all; insert each separately into `sbv_omo_daily` keyed by auction_date.
- **SBV skips an auction week (rare):** No row for that date; 5d rolling sum skips the gap (honest partial sum). Annotate `days_in_window` count in response.
- **Zero-member rows (tổng cộng subtotals):** The existing parser already skips these. Ensure the new per-tenor extraction also skips them.
- **Unknown tenor format:** If tenor text does not match expected patterns, set ParsedTenorDays = -1; include in ParseWarnings.

---

## Acceptance Criteria

- [ ] OMOParseResult struct extended with Tenors array + member participation fields
- [ ] Per-tenor winning rate parsed from column 4; VN decimal comma normalized to float
- [ ] Member win ratio computed (X/Y split); fallback for single-number format
- [ ] Implied short-rate by tenor computed (7d/14d/28d weighted average)
- [ ] `sbv_omo_daily` table created in macro_indicators.db (MACRO_DB_PATH env var)
- [ ] Write-on-fetch persistence implemented in LiquidityStateUseCase.Execute()
- [ ] Net injection 5-day rolling sum computed correctly
- [ ] Liquidity stress label (DRAIN/TIGHT/NEUTRAL/EASY) derived from net_injection + rate trend
- [ ] `liquidity_stress_score` gauge-ready scalar included (0.0–1.0; null when <5 auction dates)
- [ ] `get_vn_liquidity_state` response extended additively (no breaking changes)
- [ ] Error handling: zero-rate cells → WinningRatePct=0 + ParseWarning (not crash)
- [ ] Tests: Go unit tests for tenor parsing ("7 ngày"→7, unknown→-1), VN decimal comma, X/Y member split, missing rate cell
- [ ] Existing tests still pass: Go macro-indicators module

---

## Verified Paths (from Architect)

- **Parser extension:** `apps/macro-indicators/pkg/infrastructure/parsers_vmt_sbv_interbank_omo.go` — `OMOParseResult` struct (L56–L71) and `collectOMORow` function (L182–L221). Currently reads col[0] (type) + col[2] (volume), SKIPPING col[1] (members) and col[3] (rate) — exactly what needs to be added.
- **Response DTO:** `apps/macro-indicators/pkg/application/dtos_vmt_liquidity.go` — `LiquidityStateResponse` struct (L147–L187) already has policy_rates, sjc_gold_gap, etc. Safe to extend additively.
- **Server startup:** `apps/macro-indicators/cmd/server/main.go` — uses `DB_PATH` env (default `/app/data/market.db`). Add new env `MACRO_DB_PATH` for second SQLite.
- **DB driver:** `apps/macro-indicators/pkg/infrastructure/repositories.go` — uses `modernc.org/sqlite` Go SQLite driver. Reuse pattern for new macro_indicators.db connection.

---

## New Files to Create

- `apps/macro-indicators/pkg/application/dtos_vmt_omo.go` — OMO daily DTOs (auction_date, add_bn_vnd, net_outstanding_vnd, etc.)
- `apps/macro-indicators/pkg/domain/services_vmt_omo.go` — `ComputeImpliedShortRate()` + `DeriveStressLabel()` pure functions
- `apps/macro-indicators/pkg/application/usecases_vmt_omo_persist.go` — `PersistOMODaily()` use case

---

## Modified Files

- `apps/macro-indicators/pkg/infrastructure/parsers_vmt_sbv_interbank_omo.go` — extend OMOParseResult + collectOMORow for tenors/rates/members
- `apps/macro-indicators/pkg/application/dtos_vmt_liquidity.go` — extend LiquidityStateResponse additively
- `apps/macro-indicators/cmd/server/main.go` — add MACRO_DB_PATH env, second DB init, wire PersistOMODaily

---

## Gauge-Readiness Contract (P1 dependency)

**Gauge-ready scalar:** `liquidity_stress_score` (float 0–1)
- Null condition: fewer than 5 auction dates in sbv_omo_daily history
- Usage: P1 Fear & Greed gauge's liquidity-stress leg

---

## Risk Flags (from Architect)

- **RISK-MACRO-LANG-CONFUSION [HIGH]:** Macro-indicators is Go (pkg/ + cmd/). The TypeScript `src/` directory is deprecated. Working in wrong folder = lost work. PM specifies `apps/macro-indicators/pkg/` explicitly; developer must use Go, not TypeScript.
- **RISK-OMO-DUAL-DB-LIFECYCLE [MEDIUM]:** Go macro-indicators now opens two SQLite connections (market.db and macro_indicators.db). Ensure: (a) WAL mode enabled on macro_indicators.db at startup, (b) DB connection closed in graceful shutdown handler, (c) docker-compose `data` volume covers `/app/data/` for persistence.

---

## Done Criteria

- Code review approved (Go code, parser extension verified, idempotent persistence tested)
- Go build succeeds; `go test ./...` passes
- Tenor parsing unit tests (7/14/28 day formats, VN decimal comma)
- Integration test: fetch SBV HTML → parse → write sbv_omo_daily → read net_injection_5d
- Commit message: `feat(P0-3-OMO): parse tenors/rates/members, implied short-rate by tenor, net injection 5d, liquidity stress label`

---

## Developer Notes

**Go language:** This is a Go service. All work in `pkg/` and `cmd/`. The TypeScript `src/` directory is legacy/deprecated. Do NOT add code there.

**Dual-DB setup:** Macro-indicators owns its own SQLite (macro_indicators.db) for zone-owned data (sbv_omo_daily). This keeps the single-writer principle clean: mcp-server owns market.db, macro-indicators owns macro_indicators.db.

**Persistence strategy:** Write-on-fetch (side effect in LiquidityStateUseCase) keeps the logic tight. ON CONFLICT REPLACE ensures idempotency.

**Tenor parsing:** Handle "7 ngày", "14 ngày", "28 ngày" formats. If unknown, set to -1 and log warning (do not crash).

**VN decimal:** Numbers use comma separator (4,75 not 4.75). Parse library or custom regex to normalize.
