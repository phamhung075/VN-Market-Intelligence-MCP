# Architect Session — 2026-04-29

## Task: Trần Ngọc Báu Methodology — Brownfield Design

**Status:** Design complete. Handoff appended to `docs/handoffs/TASK_methodology_bau.md`.

### Files read this session

- `docs/methodology-tran-ngoc-bau.md`
- `docs/ARCHITECTURE.md`
- `.claude/knowledge/mcp-tools.md`
- `.claude/knowledge/agent-roster.md`
- `.claude/knowledge/dev-standards.md`
- `apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts`
- `apps/mcp-server/src/infrastructure/db/schema-macro.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts`
- `apps/mcp-server/src/interface/mcp/tools/macro/policyTools.ts`
- `apps/mcp-server/src/domain/services/macro/macroIndicatorFetcher.ts`
- `vps-scripts/fetch-sbv.sh`

### Key architectural decisions

1. **DXY already fetched** — `DX-Y.NYB` in `SYMBOLS` since a prior sprint. Task 1423d is purely a text-format change to `formatMacroSnapshot`, not a data gap.

2. **US 10Y (`^TNX`) — 1-line addition** to `SYMBOLS`, idempotent ALTER TABLE migration for `commodity_prices` + history table.

3. **FRED Fed Funds Rate — piggyback on `macroIndicatorRefreshJob`** (not a new cron). Stored in `tracked_indicators` (no new table; hour_bucket dedup handles it).

4. **`carryTradeSignal.ts` — pure domain function**, receives two plain numbers. Tool layer does the DB reads. Zero infrastructure imports in domain.

5. **`macroCalendar.ts` — inline static constants** (not `shared-config/`). FOMC dates + GSO months 3/6/9/12 are domain rules, not operator config.

6. **Cowork agents (`macro-economist`, `policy-tracker`) deferred to Phase 3** — they need OMO and G-Bond data (Phase 2) before they can deliver value. Creating them in Sprint 1423 would be premature.

7. **`MacroSnapshotResponse` type unchanged** — carry signal computed inline in `formatMacroSnapshot` from existing struct fields + one DB query for `fed_funds_rate`. No test fixture changes required.

### Phase mapping (confirmed)

- Phase 1 (Sprint 1423): Yahoo `^TNX` + FRED + carry signal + macro calendar + surface in `get_macro_snapshot`. Zero VPS changes.
- Phase 2 (Sprint 1424): G-Bond HNX + OMO SBV + valuation scorer + hot money classifier. 2 new VPS scripts + 2 new tables.
- Phase 3 (Sprint 1425+): Policy regime state machine + Vietstock interbank Playwright + Cowork agents.

### Risk flags to PM

- `macroTools.ts` snapshot tests: verify they use `toContain` not full-text equality before 1423d starts.
- Phase 2 BCTC coverage check needed before earning yield sprint.
- DXY `DX-Y.NYB` intermittent 0 — `formatMacroSnapshot` must show "unavailable" not "0%".

---

## Sprint 1426 — Báu Phase 2: Dinh Gia (Asset Valuation) — 2026-04-29

### Brownfield findings
- EPS lives in `vnstock_financials.eps` (INTEGER, VND per share). Pre-computed `pe` column also available.
- Current price: `currentPriceQuery()` in `priceQueries.ts` — COALESCE(market_prices, daily_ohlcv). Reuse directly.
- `tracked_indicators` already supports new key strings — no schema migration needed.
- `sbv_rates.max_deposit_rate_pct` already in DB — no new fetch required for 1426b.
- Domain pattern: `carryTradeSignal.ts` — pure fn, zero infra imports, zero-guard, typed result.
- Tool pattern: `carryTools.ts` — private readXxx() helpers, _testXxx injection, sync handler.
- Snapshot pattern: `formatThienThoi()` optional block — same approach for `formatDinhGia()`.

### Critical collision
Test file `1426-evening-vnindex.test.ts` already occupies slot 1426 (different sprint).
Highest used test number: 1567. Design uses test slots **1570a/b/c**.

### Design decisions
- earning_yield stored as `indicator='market_earning_yield', source='bau_phase2'`
- median_pe stored as `indicator='market_median_pe', source='bau_phase2'`
- Thresholds: earning_yield > deposit + 2pp = CHEAP; > deposit = FAIRLY_VALUED; <= deposit = EXPENSIVE
- [Dinh Gia] section inserted after [Thien Thoi], before [Commodity Prices] in formatMacroSnapshot()
- EPS unit risk flagged: vnstock EPS is VND, price is k-VND — prefer stored pe column

### Output
- docs/handoffs/TASK_1426.md written
