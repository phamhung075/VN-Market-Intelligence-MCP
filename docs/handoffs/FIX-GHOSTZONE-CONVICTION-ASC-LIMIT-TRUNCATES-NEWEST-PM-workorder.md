---
sprint: GHOSTZONE-P0
branch: fix/ghostzone-conviction-asc-limit
size: S
zone: apps/mcp-server/
depends_on: []
blocks: []
---

## TLDR
`getConvictionHistoryRows()` in `convictionHistoryStore.ts` selects rows `ORDER BY date ASC LIMIT 2000` — as the table grew past 2000 rows, this keeps the OLDEST rows and silently drops the newest 1907 (48% of table), freezing `/api/conviction-history` at a 64-day-stale date for every ticker. Architect ratified a two-stage SQL wrap (inner DESC+LIMIT to select newest, outer ASC to restore the documented return contract) as a one-file, zero-caller-change fix. Full root-cause + design trail: `docs/handoffs/FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST-BA-spec.md`.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Acceptance Criteria:**
  - [ ] `getConvictionHistoryRows()` rewritten to the exact two-stage SQL below (inner DESC-select-newest, outer ASC-restore) — NO other shape (a naive `ORDER BY date DESC` flip alone is a known trap, see Risk below)
  - [ ] Docstring (current L16-19, stale 2026-06-11 row-count snapshot) replaced with the real invariant: newest-N-by-date selection, ASC-return contract, table growth does NOT require raising `LIMIT`
  - [ ] New regression test AC-16 added to `TASK17-CONVICTION-conviction-history-endpoint.test.ts` (next slot after AC-15) per Test Strategy below
  - [ ] Existing AC-1..AC-15 in that same test file all still pass UNMODIFIED
  - [ ] Live verify post-deploy (post-rebuild): `GET /api/conviction-history` `tradingDate` within 1-2 trading days of today, `stale=false`
  - [ ] Visual verify on `/dashboard/analysis` (ConvictionHistoryZone) and `/dashboard/conviction-history` — both reflect the newest window

- **Binding SQL (architect-ratified verbatim, do not deviate):**
  ```sql
  SELECT symbol, date, peak_score, dominant_signal, created_at
  FROM (
    SELECT symbol, date, peak_score, dominant_signal, created_at
    FROM conviction_history
    ORDER BY date DESC, symbol ASC
    LIMIT ?
  )
  ORDER BY date ASC, symbol ASC
  ```
  Inner query selects the newest `limit` rows; outer wrap restores the documented ASC-by-(date,symbol) contract before rows reach the handler. `getConvictionHistoryRows(db, limit)` signature and `ConvictionRow[]` return type stay IDENTICAL — pure adapter (SQL) swap, zero caller-side change.

- **Files to read first:**
  - `apps/mcp-server/src/infrastructure/db/convictionHistoryStore.ts:58-71` (function under change)
  - `apps/mcp-server/src/interface/mcp/routes/convictionHistoryHandler.ts:155-170` (`buildSnapshot` — last-write-wins per symbol, depends on ASC input, DO NOT TOUCH)
  - `apps/mcp-server/src/interface/mcp/routes/convictionHistoryHandler.ts:180-200` (`buildSeries` — appends in received order, documented "full ASC history", DO NOT TOUCH)
  - `apps/mcp-server/src/interface/mcp/routes/convictionHistoryHandler.ts:284-289` (`tradingDate` = max over the returned window — confirms why ASC-contract preservation matters)

- **Files to modify:**
  - `apps/mcp-server/src/infrastructure/db/convictionHistoryStore.ts` — SQL rewrite (FR-1) + docstring correction (FR-2)
  - `apps/mcp-server/src/__tests__/TASK17-CONVICTION-conviction-history-endpoint.test.ts` — new AC-16

- **Dependencies:** none. Safe to pair with sibling task FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD (zero file overlap).

- **Knowledge needed:** `docs/policies/dev-standards.md`; full BA vision + architect brownfield findings + risk flags in `docs/handoffs/FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST-BA-spec.md`

### Test Strategy (AC-16, architect-designed — implement all 5 points)
1. Seed >=3 symbols across dates spanning MORE rows than a small test `limit`; assert HTTP `tradingDate` == true `MAX(date)` over the FULL seeded set (not just the queried window).
2. **Anti-regression for the naive-DESC-flip trap:** pick a symbol whose `peak_score` differs between its oldest and newest seeded row; assert `snapshot` reports the NEWEST row's peakScore/signal. A raw `ORDER BY date DESC` flip (no outer ASC wrap) passes point 1 but SILENTLY FAILS this point — this is the check that catches it.
3. Assert `series[symbol]` for that symbol stays ASC (first date < last date) — catches an omitted outer-wrap.
4. Re-run existing AC-1..AC-15 unmodified — must all still pass.
5. Edge cases (both must hold, no regression): empty table (AC-11 path, `[]`/`tradingDate:""`); table smaller than limit (AC-15 "production shape" — no-op ASC path, all rows returned).

### Risk Flags (carry into implementation, do not re-derive)
- **HIGH:** a raw `ORDER BY date DESC` flip fixes staleness while silently corrupting every symbol's snapshot to its OLDEST score — no existing test catches this without AC-16 point 2 above. The inner-DESC/outer-ASC wrap is non-negotiable.
- **MEDIUM (accepted trade-off, not a new bug):** a symbol whose most recent print falls outside the newest-N window disappears from snapshot+series until its next write. Expected post-fix behavior — QA must NOT re-file this as a regression.

### Explicitly Out of Scope (do not widen)
- No change to `convictionHistoryHandler.ts` (buildSnapshot/buildSeries/buildSummary/mapSignal) — zero code change expected there.
- No change to the `?limit=` query-param clamp `[1, 2000]` — only the store's internal row-selection SQL changes.
- No calendar-day-window rework (architect explicitly rejected this alternative — see BA-spec NFR-2; the client-facing `?limit=` contract locks the row-count-bound design). A separate follow-up row (coverage-floor monitoring predicate) has been minted independently — see `FOLLOWUP-CONVICTION-HISTORY-COVERAGE-FLOOR-CHECK` in backlog — do not fold that scope into this task.
- MARKET-PRICES / CASCADE-RULE / COVERAGE-MAP sibling ghost-zone rows are out of scope for this task.

**Chain:** pm → dev-mcp-server → qa
