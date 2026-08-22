---
sprint: GHOSTZONE-P0
branch: fix/ghostzone-foreignflow-maxdate-nonnull-guard
size: S
zone: apps/mcp-server/
depends_on: []
blocks: []
---

## TLDR
`queryForeignFlow()` in `foreignFlowHandler.ts` resolves "latest trading day" via `WHERE date = (SELECT MAX(date) FROM vnstock_trading_stats) AND foreign_volume IS NOT NULL` — the subquery picks the newest date WITHOUT excluding NULL-only days, so a partial-write day locks in a date the outer guard then filters to zero rows, ghosting the whole Foreign Flow page. One-line fix, ratified verbatim by architect: move the `foreign_volume IS NOT NULL` guard into the subquery. Full root-cause + design trail: `docs/handoffs/FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD-BA-spec.md`.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Acceptance Criteria:**
  - [ ] `queryForeignFlow()` subquery rewritten to the exact SQL below — outer `foreign_volume IS NOT NULL` guard KEPT (it still does real work stripping individual null rows on a partial day)
  - [ ] No docstring change needed (L8 already states the correct contract verbatim — this is a pure implementation/docstring divergence fix)
  - [ ] New regression test AC-15 added to `1986-foreign-flow-endpoint.test.ts` (adjacent to existing AC-12) per Test Strategy below
  - [ ] Existing AC-1..AC-14 in that same test file all still pass UNMODIFIED (including AC-12/AC-13)
  - [ ] Live verify post-deploy (post-rebuild): `GET /api/foreign-flow` serves the latest date with non-null `foreign_volume` rows, never an empty NULL-only day
  - [ ] Visual verify on the Foreign Flow dashboard zone (not just the API response in isolation)
  - [ ] Re-measure NFR-2 (verification only, no new code): `/api/momentum-indicators` `foreign_accum.null_reason` and `/api/money-radar` `coverage_pct` — record result on this task before opening any new backlog row for either symptom (they may self-resolve)

- **Binding SQL (architect-ratified verbatim, do not deviate):**
  ```sql
  WHERE date = (
    SELECT MAX(date) FROM vnstock_trading_stats WHERE foreign_volume IS NOT NULL
  )
    AND foreign_volume IS NOT NULL
  ```
  Single SQL string-literal edit. No new port/adapter, no new file. Layer: interface (`queryForeignFlow()`, same file) — zero domain/application/infrastructure touch.

- **Files to read first:**
  - `apps/mcp-server/src/interface/mcp/routes/foreignFlowHandler.ts:164-190` (`queryForeignFlow()`, function under change; docstring L8 already states the intended contract)
  - `apps/mcp-server/src/__tests__/1986-foreign-flow-endpoint.test.ts:344` (existing AC-12, "only latest trading date rows returned — WHERE date = MAX(date)" — closest existing coverage, new AC-15 slots in adjacent)

- **Files to modify:**
  - `apps/mcp-server/src/interface/mcp/routes/foreignFlowHandler.ts` — subquery guard fix (FR-1)
  - `apps/mcp-server/src/__tests__/1986-foreign-flow-endpoint.test.ts` — new AC-15

- **Dependencies:** none. Safe to pair with sibling task FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST (zero file overlap).

- **Knowledge needed:** `docs/policies/dev-standards.md`; full BA vision + architect brownfield findings in `docs/handoffs/FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD-BA-spec.md`

### Test Strategy (AC-15, architect-designed — implement all 5 points)
1. Seed a NULL-only newest date (all rows `foreign_volume: null`) plus a populated older date (existing `PROD_DATE`/`insertRow` helpers). Assert `queryForeignFlow(db).tradingDate` == the OLDER populated date, `items.length > 0`.
2. **Edge case — ALL dates NULL table-wide:** subquery returns SQL NULL, outer `WHERE date = NULL` evaluates UNKNOWN (never true, genuine SQLite three-valued-logic guarantee) → 0 rows → falls through to the EXISTING empty-response path (AC-6/AC-14), `tradingDate: ""`. No special-case code needed — assert this via test, not defensive code.
3. **Edge case — multiple CONSECUTIVE NULL-only days** (today + yesterday NULL-only, day-before-yesterday populated): assert the subquery walks back arbitrarily far with no date-arithmetic/fallback logic required — a durability property worth its own assertion.
4. Re-run existing AC-1..AC-14 unmodified — must all still pass, including AC-12/AC-13.
5. NFR-2 (verification only, no code): after landing, re-query `/api/momentum-indicators` `foreign_accum.null_reason` and `/api/money-radar` `coverage_pct`; record result on this task before opening any new backlog row for either symptom.

### Risk Flags (carry into implementation, do not re-derive)
- LOW — nothing functionally new. Only note is a pre-existing interface/infrastructure layering asymmetry (this endpoint's SQL lives directly in the interface-layer route file, no dedicated `infrastructure/db` store, unlike the sibling conviction-history fix) — already flagged as observation-only, explicitly OUT of scope for this fix (do not refactor into a store as part of this task).

### Explicitly Out of Scope (do not widen)
- No extraction of the SQL into a separate `infrastructure/db` store — a one-line predicate fix does not need a layering refactor.
- No change to `foreignFlowHandler.ts`'s summary/direction/stale_fields logic.
- Do NOT open new backlog rows for `/api/momentum-indicators` or `/api/money-radar` symptoms yet — re-measure first per NFR-2, only file if the symptom survives this fix.
- MARKET-PRICES / CASCADE-RULE / COVERAGE-MAP sibling ghost-zone rows are out of scope for this task.

**Chain:** pm → dev-mcp-server → qa
