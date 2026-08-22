# BA Spec — FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD
**Task:** FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD
**Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP (active; row itself carries no sprint tag)
**BA:** ba · 2026-08-22
**Status:** SPEC COMPLETE — ZERO PO BLOCKERS — HAND OFF TO ARCHITECT
**Sibling row (dispatched together, shares regression-test shape):** FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST

---

## 1. Vision (po, root-cause triage 2026-08-22)

`/api/foreign-flow` intermittently returns `items:[]`, `tradingDate:""` — the whole Foreign Flow page
ghosts. Root cause PROVEN by live probe: `queryForeignFlow()` in
`apps/mcp-server/src/interface/mcp/routes/foreignFlowHandler.ts` resolves "latest trading day" via
`WHERE date = (SELECT MAX(date) FROM vnstock_trading_stats) AND foreign_volume IS NOT NULL` — the
subquery picks the newest date WITHOUT excluding NULL-only days, then the outer
`foreign_volume IS NOT NULL` filters every row of THAT date away, leaving zero rows. Live probe
2026-08-22: `MAX(date)` overall = 2026-08-22 (41 rows, ALL NULL); `MAX(date)` with the guard =
2026-08-18 (99 non-null rows). The file's own docstring (line 8) already states the intended
contract verbatim — "Latest trading day = MAX(date) with foreign_volume IS NOT NULL" — so this is a
one-line implementation/docstring divergence, not an open design question. Also observed on
2026-08-16 (n=4, nonnull=0) and 2026-08-15 (n=34, nonnull=0) — recurring, not a one-off.

---

## 2. Functional Requirements

### FR-1 — MAX(date) subquery must itself exclude NULL-only days
**DDD layer: interface** (`apps/mcp-server/src/interface/mcp/routes/foreignFlowHandler.ts` — per the
file's own docstring; this endpoint has no separate `infrastructure/db` store, the SQL is embedded
directly in the interface-layer route handler, unlike the sibling conviction-history fix which has a
dedicated infra store. BA flags this layering asymmetry as an observation only — NOT in scope to
refactor as part of this fix)

Move the guard into the subquery so the "latest day" resolution and the "day must have data"
requirement are the SAME predicate, matching the docstring's own stated contract:
```sql
WHERE date = (SELECT MAX(date) FROM vnstock_trading_stats WHERE foreign_volume IS NOT NULL)
  AND foreign_volume IS NOT NULL
```
Keep the OUTER `foreign_volume IS NOT NULL` guard too — do not remove it. A given date can be
PARTIALLY populated (some rows null, some not); the outer filter still does real work stripping
individual null rows even after the subquery fix (this is independent of the bug being fixed here).

---

## 3. Non-Functional Requirements

### NFR-1 — Regression test (mandatory, per po's ticket text)
New AC in `apps/mcp-server/src/__tests__/1986-foreign-flow-endpoint.test.ts` (existing file has
AC-1..AC-14; add AC-15, adjacent to existing AC-12 "only latest trading date rows returned — WHERE
date = MAX(date)", which this fix specializes/corrects): seed a NULL-only newest date PLUS a
populated older date; assert the handler serves the OLDER, populated date as `tradingDate` — not
empty. Same regression shape as the sibling row (FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST):
what the API serves must match MAX(date) [subject to the documented completeness guard] in the
underlying table.

### NFR-2 — Cascade re-measurement (per ticket's own note, verification step not new scope)
After landing, re-measure — BEFORE opening any new backlog rows for either symptom, they may
self-resolve:
- `/api/momentum-indicators` `foreign_accum` (currently `null_reason`: "Insufficient tickers with
  >=5 days of flow data")
- `/api/money-radar` `coverage_pct` (currently 0.83, foreign components degraded)

---

## 4. Edge Cases

| Case | Handling |
|---|---|
| ALL dates NULL (table-wide, never seen live — distinct from table-empty) | Subquery `MAX(date) WHERE foreign_volume IS NOT NULL` returns NULL itself → outer `WHERE date = NULL` matches nothing → correctly falls through to existing AC-6/AC-14 empty-response path (200 + `items:[]` + `tradingDate:""`). No special-case code needed — confirm via test. |
| Table genuinely empty (0 rows) | Same empty-response path, pre-existing AC-6, unaffected by this fix |
| Multiple CONSECUTIVE NULL-only days (writer degraded >1 day, not just a single-day blip) | Subquery approach naturally walks back to the most recent NON-null day regardless of how many NULL-only days precede it — no date-arithmetic or "yesterday" fallback needed; this is a durability property worth an explicit regression assertion, not just a single-day patch |
| Partial-day (most rows non-null, a few null) | Outer `foreign_volume IS NOT NULL` already strips those individual null rows; confirm this still holds after the subquery change (independent of the fix but interacts with it) |

---

## 5. DDD Layer Map

| Requirement | DDD Layer | Zone |
|---|---|---|
| FR-1 Subquery non-null guard | Interface | `apps/mcp-server/src/interface/mcp/routes/foreignFlowHandler.ts` |
| NFR-1 Regression test | Interface (test) | `apps/mcp-server/src/__tests__/1986-foreign-flow-endpoint.test.ts` |
| NFR-2 Cascade re-measurement | Interface (verification, no code) | `foreign_accum` (momentum-indicators), `money-radar` coverage |

No domain, application, or infrastructure layer touch — this endpoint's persistence query lives
entirely inside the interface-layer route file today (documented in the file's own header).

---

## 6. Scope Out (confirmed sound, do not widen)

- No extraction of the SQL into a separate `infrastructure/db` store as part of this fix — flagged
  as an observation (§FR-1) only; a pure one-line predicate fix does not need a layering refactor.
- No change to `foreignFlowHandler.ts`'s summary/direction/stale_fields logic — untouched by this fix.
- `/api/momentum-indicators` and `/api/money-radar` — NOT opened as new rows now (NFR-2); re-measure
  first, only file if the symptom survives this fix.
- MARKET-PRICES / CASCADE-RULE / COVERAGE-MAP sibling ghost-zone rows are explicitly out of scope
  for this dispatch (router instruction) — do not fold their scope in here.

---

## 7. Files to Change (developer/architect checklist)

| File | Change |
|---|---|
| `apps/mcp-server/src/interface/mcp/routes/foreignFlowHandler.ts` | Move `foreign_volume IS NOT NULL` into the `MAX(date)` subquery per FR-1; keep outer guard |
| `apps/mcp-server/src/__tests__/1986-foreign-flow-endpoint.test.ts` | Add regression AC-15 per NFR-1 |

---

## 8. Acceptance Criteria (QA gate)

1. `GET /api/foreign-flow` serves the latest date that HAS non-null `foreign_volume` rows, never an
   empty NULL-only day, verified against the live DB (post-fix, post-rebuild).
2. Regression test (NFR-1) passes: seeded NULL-only newest date is skipped in favor of the older
   populated date.
3. Existing AC-1..AC-14 in `1986-foreign-flow-endpoint.test.ts` all still pass unmodified.
4. Re-measure (NFR-2) `foreign_accum` null_reason and `money-radar` coverage_pct post-fix; record
   result on this row before deciding whether either needs its own follow-up row.
5. Verified on the served page (Foreign Flow dashboard zone), not just the API response in isolation.

---

## 9. Blockers

NONE — zero PO questions needed. The handler's own docstring already states the intended contract
verbatim; this is a one-line implementation correction, not an open design question.

**Recommended chain:** agents-architect → developer (dev-mcp-server) → qa

---

## 10. Decision Journal

**task_id:** FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD
- what-considered: "only path: move the existing outer NOT NULL guard into the MAX(date) subquery; no alternative design — the file's own docstring already names the exact intended contract"
- why-decision: "confirmed live probe pattern is recurring (2026-08-15/16/22) not a one-off, and the outer guard alone cannot fix it since it fires AFTER the wrong date is already locked in by the subquery"
- why-change: "no change from plan; added NFR-2 cascade re-measurement per the ticket's own note so momentum-indicators/money-radar are not double-ticketed for a symptom this fix may already resolve"

---

## [Architect] Brownfield Findings

- **Zone:** apps/mcp-server/
- **Verified paths:**
  - `apps/mcp-server/src/interface/mcp/routes/foreignFlowHandler.ts:164-190` — `queryForeignFlow()`, confirmed live SQL (L172-181): `WHERE date = (SELECT MAX(date) FROM vnstock_trading_stats) AND foreign_volume IS NOT NULL` — subquery has no guard; outer guard present but fires only after the wrong date is already locked in.
  - Docstring L8 ("Latest trading day = MAX(date) with foreign_volume IS NOT NULL") already states the correct contract — confirms this is a pure implementation/docstring divergence; no docstring edit needed here (unlike the sibling conviction-history fix).
  - `apps/mcp-server/src/__tests__/1986-foreign-flow-endpoint.test.ts` — 668L, AC-1..AC-14; AC-12 (L344, "only latest trading date rows returned — WHERE date = MAX(date)") is the closest existing coverage and does NOT seed a NULL-only newest date, confirming the gap. New regression slots in as AC-15.
- **Reuse patterns:** none needed — single SQL string-literal edit, no new port/adapter, no new file. Concur with BA's §6 Scope Out declining to extract this into an `infrastructure/db` store as part of this fix — a one-line predicate fix does not justify a layering refactor mid-fix; the interface/infrastructure layering asymmetry vs the sibling conviction-history store is pre-existing, not introduced or worsened here.
- **Design decisions (FR-1 exact SQL, per BA spec verbatim — no deviation):**
  ```sql
  WHERE date = (
    SELECT MAX(date) FROM vnstock_trading_stats WHERE foreign_volume IS NOT NULL
  )
    AND foreign_volume IS NOT NULL
  ```
  Keep the outer guard (does independent real work stripping individual null rows on a partial day). Layer: interface (`queryForeignFlow()`, same file) — zero domain/application/infrastructure touch. Same regression-test shape as the sibling conviction-history fix: served date must match a (guarded) `MAX(date)` in the underlying table.
- **Test strategy (NFR-1, new AC-15, adjacent to AC-12):**
  1. Seed a NULL-only newest date (all rows `foreign_volume: null`) plus a populated older date (existing `PROD_DATE`/`insertRow` helpers). Assert `queryForeignFlow(db).tradingDate` == the OLDER populated date, `items.length > 0`.
  2. Edge case (BA §4, "confirm via test," no special-case code needed): ALL dates NULL table-wide — subquery returns SQL NULL, outer `WHERE date = NULL` evaluates UNKNOWN (never true) → 0 rows → falls through to the EXISTING empty-response path (AC-6/AC-14), `tradingDate: ""`. This is a genuine SQLite three-valued-logic guarantee worth an explicit assertion, not defensive code.
  3. Edge case: multiple CONSECUTIVE NULL-only days (today + yesterday NULL-only, day-before-yesterday populated) — assert the subquery walks back arbitrarily far with no date-arithmetic/fallback logic required.
  4. Re-run existing AC-1..AC-14 unmodified — must all still pass, including AC-12/AC-13.
  5. NFR-2 (verification only, no code): after landing, re-query `/api/momentum-indicators` `foreign_accum.null_reason` and `/api/money-radar` `coverage_pct`; record result on this row before opening any new backlog row for either symptom.
- **Risk flags:**
  - LOW — nothing functionally new. Only note is the pre-existing interface/infrastructure layering asymmetry (SQL embedded in the interface-layer route file, no dedicated store), already flagged by BA as observation-only, out of scope. Worth a name-check only if a future foreign-flow change needs more than a 1-line patch — not actionable now.
- **Scan clean:** true ✓ (no DDD violations — layering asymmetry is pre-existing and explicitly scoped out, not introduced here)
- **BUILD-STANDARD:** not-applicable (BUG-FIX, in-zone, no new primitives)

## RETURN (architect)
DONE: Technical design complete — subquery non-null guard ratified verbatim per BA's FR-1, AC-15 regression test designed (NULL-only-newest-date + all-NULL-table-wide + consecutive-NULL-days edge cases), NFR-2 cascade re-measurement confirmed as verification-only (no new code).
ZONE: apps/mcp-server/
NEXT: pm — create developer task (single-file, single-test-file change; safe to pair with sibling FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST, zero file overlap).
HANDOFF: docs/handoffs/FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD-BA-spec.md
PIPELINE: continue
