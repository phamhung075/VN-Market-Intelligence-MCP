# BA Spec — FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST
**Task:** FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST
**Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP (active; row itself carries no sprint tag)
**BA:** ba · 2026-08-22
**Status:** SPEC COMPLETE — ZERO PO BLOCKERS — HAND OFF TO ARCHITECT
**Sibling row (dispatched together, shares regression-test shape):** FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD

---

## 1. Vision (po, root-cause triage 2026-08-22)

`/api/conviction-history` reports `tradingDate=2026-06-17`, `stale=true`, `staleByDays=64`, for
every ticker, even though the underlying `conviction_history` table has continuous writes through
2026-08-21 (33-34 rows/day, healthy writer). Root cause PROVEN by live probe: `getConvictionHistoryRows()`
in `apps/mcp-server/src/infrastructure/db/convictionHistoryStore.ts` runs
`ORDER BY date ASC, symbol ASC LIMIT 2000` against a table that has grown from 766 rows (when the
cap was set, 2026-06-11) to 3942 rows today — the LIMIT now keeps the OLDEST 2000 rows and silently
drops the newest 1907 (48% of the table, all recent data). PO's own ticket text already names the
fix direction ("order DESC and/or select the newest N trading dates rather than the first N rows")
and mandates a regression test asserting served MAX(date) == table MAX(date) — BA ratifies this
direction below with one structural correction (§2, FR-1) the ticket text did not fully specify.

---

## 2. Functional Requirements

### FR-1 — Row-selection window must keep the NEWEST rows, contract-compatibly
**DDD layer: infrastructure** (`apps/mcp-server/src/infrastructure/db/convictionHistoryStore.ts`)

`getConvictionHistoryRows()` must select the newest `limit` rows by `date` — but MUST continue to
**return them ASC by `(date, symbol)`**, exactly as documented today. This is not cosmetic: the
caller, `convictionHistoryHandler.ts`, has two pieces of logic that silently depend on ASC input
order and are NOT touched by this fix:
- `buildSnapshot()` — "since rows are ASC by date, the last row written per symbol wins" (= MAX(date)
  per symbol). Feeding it DESC-ordered rows would flip this to MIN(date) per symbol with zero query
  error — every symbol's snapshot would silently show its OLDEST conviction score.
- `buildSeries()` — builds each symbol's sparkline by appending rows in the order received; the
  response contract documents `series[symbol]` as "full ASC history" (handler docstring + AC-5 in
  `TASK17-CONVICTION-conviction-history-endpoint.test.ts`).

A naive `ORDER BY date DESC` flip (the literal first half of the ticket's own "order DESC and/or..."
phrasing) would fix `tradingDate` staleness while breaking both of the above. The correct shape is a
two-stage query: inner `ORDER BY date DESC, symbol ASC LIMIT ?` to select the newest rows, outer
wrapper `ORDER BY date ASC, symbol ASC` to restore the documented return contract before the rows
leave the store. Architect to finalize exact SQL; this ordering constraint is non-negotiable — it is
what keeps the fix a one-file, zero-caller-change fix rather than a 2-file coordinated change.

### FR-2 — Docstring correction
**DDD layer: infrastructure**
Update the function docstring: the current text ("Live stats (probed 2026-06-11): 766 rows ... well
within the default cap") is what let this regress silently as the table grew 5.1x. Replace with the
real invariant (newest-N selection, ASC return contract) so the next growth cycle does not
reintroduce the same silent truncation by editing in the wrong direction.

---

## 3. Non-Functional Requirements

### NFR-1 — Freshness regression test (mandatory, per po's ticket text)
New test (extend `apps/mcp-server/src/__tests__/TASK17-CONVICTION-conviction-history-endpoint.test.ts`,
next AC slot after existing AC-15 — do not create a new file, matches this repo's test-per-feature
convention) asserting: seed rows spanning more dates than `limit`, then assert the served `tradingDate`
equals the true `MAX(date)` over the FULL seeded set, not just the queried window. This is the same
regression shape as the sibling row (FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD): what
the API serves must match MAX(date) in the underlying table.

### NFR-2 — Durable freshness guarantee, not a one-time reset (flag for architect, non-blocking)
`LIMIT 2000` is an absolute row count on a table growing ~34 rows/day; fixing direction today still
means the SAME defect recurs once accumulated rows re-exceed 2000 post-fix (roughly 59 more days at
current cadence) — just a later, quieter recurrence, since freshness would degrade one day at a time
with no error. Two options for architect to choose between (BA does not mandate either — this is an
engineering trade-off, not a business-priority question, so it is NOT a PO blocker):
  (a) bound by newest N **calendar days** instead of newest N **rows**, so freshness never regresses
      as symbol-count or write-cadence grows;
  (b) keep the absolute row LIMIT, but add a monitoring predicate that fails loud once the
      LIMIT-derived coverage window drops under a floor (e.g. <30 days), so the next recurrence is
      caught before a user reports it again.

---

## 4. Edge Cases

| Case | Handling |
|---|---|
| Empty table (0 rows) | Existing AC-11 path (`[]`/`tradingDate:""`) must still hold — fix must not assume `rows[0]` exists |
| Table smaller than `limit` (current low-volume case, 766 rows historically) | No-op / graceful degrade — ASC order, ALL rows returned, current correct behavior at low volume must not regress |
| A symbol's most recent print falls outside the newly-selected newest-N window | That symbol silently disappears from BOTH `snapshot` and `series` until its next write brings it back inside the window — an accepted, visible trade-off of any bounded window (distinct from the ghosting this fix removes); call out to QA so it is not re-reported as a new bug |
| `dominant_signal` NULL on a kept row | Unaffected by this fix — `mapSignal()`'s NULL→"unknown" mapping (AC-3) is untouched |

---

## 5. DDD Layer Map

| Requirement | DDD Layer | Zone |
|---|---|---|
| FR-1 Newest-N selection, ASC-contract preserved | Infrastructure | `apps/mcp-server/src/infrastructure/db/convictionHistoryStore.ts` |
| FR-2 Docstring correction | Infrastructure | same file |
| NFR-1 Regression test | Infrastructure (test) | `apps/mcp-server/src/__tests__/TASK17-CONVICTION-conviction-history-endpoint.test.ts` |
| NFR-2 Durable-freshness design choice | Infrastructure (architect-owned) | same store file |

Interface layer (`convictionHistoryHandler.ts`) is a compatibility CONSTRAINT on this fix (§FR-1), not
a new requirement — zero code change expected there if FR-1's ASC-contract is honored. Zero domain or
application layer touch.

---

## 6. Scope Out (confirmed sound, do not widen)

- No change to `convictionHistoryHandler.ts` (buildSnapshot/buildSeries/buildSummary/mapSignal) —
  the ASC-contract constraint in FR-1 exists precisely so this file stays untouched.
- No change to the `?limit=` query-param clamp behavior in the handler (`[1, 2000]`) — only the
  STORE's internal row-selection changes.
- MARKET-PRICES / CASCADE-RULE / COVERAGE-MAP sibling ghost-zone rows are explicitly out of scope
  for this dispatch (router instruction) — do not fold their scope in here.

---

## 7. Files to Change (developer/architect checklist)

| File | Change |
|---|---|
| `apps/mcp-server/src/infrastructure/db/convictionHistoryStore.ts` | Rewrite `getConvictionHistoryRows()` SQL per FR-1 (newest-N inner select, ASC outer wrap); update docstring per FR-2 |
| `apps/mcp-server/src/__tests__/TASK17-CONVICTION-conviction-history-endpoint.test.ts` | Add regression AC per NFR-1 |

---

## 8. Acceptance Criteria (QA gate)

1. `GET /api/conviction-history` `tradingDate` is within 1-2 trading days of "today" and `stale=false`
   against the live DB (post-fix, post-rebuild).
2. Regression test (NFR-1) passes: seeded MAX(date) beyond the LIMIT window is still served.
3. Existing AC-1..AC-15 in `TASK17-CONVICTION-conviction-history-endpoint.test.ts` all still pass
   unmodified (confirms ASC-contract preserved, buildSnapshot/buildSeries untouched).
4. `snapshot` and `series` both reflect the newest window — visually verified on
   `/dashboard/analysis` and `/dashboard/conviction-history`, served plane (not source constant).

---

## 9. Blockers

NONE — zero PO questions needed. PO's ticket already ratifies the fix direction; the only open
question (NFR-2, calendar-window vs absolute-row-count) is an engineering trade-off for architect,
not a feature-priority or business call.

**Recommended chain:** agents-architect → developer (dev-mcp-server) → qa

---

## 10. Decision Journal

**task_id:** FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST
- what-considered: "naive ORDER BY date DESC flip (ticket's literal first phrasing) vs newest-N-select + ASC-rewrap (preserves handler's undocumented-but-load-bearing ASC dependency)"
- why-decision: "verified live in convictionHistoryHandler.ts: buildSnapshot's per-symbol last-write-wins AND buildSeries' sparkline order both silently assume ASC input; a DESC flip passes no test today but corrupts every symbol's displayed conviction to its OLDEST score, worse than the current staleness bug"
- why-change: "no change from PO's ticket direction; this spec adds the ASC-preservation constraint the ticket text did not fully specify"

---

## [Architect] Brownfield Findings

- **Zone:** apps/mcp-server/
- **Verified paths:**
  - `apps/mcp-server/src/infrastructure/db/convictionHistoryStore.ts:58-71` — `getConvictionHistoryRows()`, confirmed live SQL `ORDER BY date ASC, symbol ASC LIMIT ?`; docstring L16-19 is the stale 2026-06-11 snapshot BA identified as the root enabler.
  - `apps/mcp-server/src/interface/mcp/routes/convictionHistoryHandler.ts:155-170` (`buildSnapshot`) — confirmed `Map.set` last-write-wins per symbol (L159-165), depends 100% on ASC input; no internal sort.
  - `apps/mcp-server/src/interface/mcp/routes/convictionHistoryHandler.ts:180-200` (`buildSeries`) — confirmed append-in-received-order, documented "full ASC history" (L36 response-shape docstring); no internal sort.
  - `apps/mcp-server/src/interface/mcp/routes/convictionHistoryHandler.ts:284-289` — `tradingDate` = `rows.reduce(max)` over the RETURNED window only, not a table-wide query — confirms BA's root-cause chain end to end.
  - `apps/mcp-server/src/__tests__/TASK17-CONVICTION-conviction-history-endpoint.test.ts` — 631L, AC-1..AC-15; new regression slots in as AC-16.
- **Reuse patterns:** No new port/interface — `getConvictionHistoryRows(db, limit)` signature and `ConvictionRow[]` return type stay identical; pure adapter (SQL) swap.
- **Design decisions:**
  - **FR-1 exact SQL** (ratifies BA's two-stage shape verbatim, no deviation):
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
    Inner query selects the newest `limit` rows; outer wrap restores the documented ASC-by-(date,symbol) contract before rows reach the handler — zero caller-side change (traced above).
  - Layer: infrastructure/db only — zero domain/application/interface touch.
  - **FR-2:** replace docstring L16-19's stale row-count snapshot with the real invariant (newest-N-by-date selection, ASC-return contract) + a note that growing the table does NOT require raising `LIMIT` — the window auto-tracks "now"; only the oldest edge moves.
  - **NFR-2 decision (architect-owned):** REJECT option (a) calendar-day window; CHOOSE option (b) keep the absolute-row `LIMIT`. Reason: BA's own §6 Scope Out locks "no change to the `?limit=` clamp behavior `[1, 2000]`" — but that SAME client-facing `limit` value is passed straight through as the store's SQL row-count bound (handler L279-284). A calendar-day window would decouple rows-returned from the client's `?limit=` value (a client requesting `?limit=1` is entitled to ≤1 row today per AC-14) — incompatible with BA's own locked contract, not merely lower-priority. Residual risk (not actioned in this S-size task, flagged for PM): at ~34 rows/day growth, the newest-2000-row window covers ~59 days before the same defect class could recur as slow 1-day-at-a-time degradation with no hard error. Recommend a small follow-up backlog row wiring a coverage-floor check into the EXISTING audit-check convention (`apps/mcp-server/src/scheduler/news-analysis/audit-checks/checkConvictionHistoryGap.ts`'s sibling `AuditFinding`/`insertFeedbackIfNew` plumbing in `dataAuditShared.ts`) that fails loud once the LIMIT-derived day-coverage drops under ~30 days — reuses existing plumbing, no new monitoring machinery.
- **Test strategy (NFR-1, new AC-16, same file):**
  1. Seed ≥3 symbols across dates spanning MORE rows than a small test `limit`; assert HTTP `tradingDate` == true `MAX(date)` over the FULL seeded set (not just the queried window).
  2. Anti-regression for the naive-DESC-flip trap BA flagged: pick a symbol whose peak_score differs between its oldest and newest seeded row; assert `snapshot` reports the NEWEST row's peakScore/signal. This is the exact check a raw `ORDER BY date DESC` flip would fail (passes #1, silently fails #2).
  3. Assert `series[symbol]` for that symbol stays ASC (first date < last date) — catches an omitted outer-wrap.
  4. Re-run existing AC-1..AC-15 unmodified — must all still pass.
  5. Edge cases (BA §4): empty table (AC-11 path unmodified); table smaller than limit (AC-15 "production shape," 7 rows vs limit 2000 — no-op ASC path, all rows returned).
- **Risk flags:**
  - HIGH (BA-identified, ratified): a raw `ORDER BY date DESC` flip fixes staleness while silently corrupting every symbol's snapshot to its OLDEST score — no existing test catches this. The inner-DESC/outer-ASC wrap is non-negotiable; flag explicitly to developer.
  - MEDIUM (accepted trade-off, not a new bug): a symbol whose most recent print falls outside the newest-N window disappears from snapshot+series until its next write. Expected post-fix behavior (BA §4) — QA must not re-file as regression.
  - LOW (tech debt, no action this task): NFR-2 residual-risk note above, PM-scheduled follow-up only.
- **Scan clean:** true ✓ (no DDD violations — infra-only touch, port signature preserved)
- **BUILD-STANDARD:** not-applicable (BUG-FIX, in-zone, no new primitives)

## RETURN (architect)
DONE: Technical design complete — newest-N inner-DESC/outer-ASC SQL wrap ratified for `getConvictionHistoryRows()`, docstring fix specified, NFR-2 durable-freshness trade-off resolved (keep row LIMIT — calendar-day window is incompatible with BA's own locked `?limit=` contract), AC-16 regression test designed with an explicit anti-regression assertion against the naive-DESC-flip trap.
ZONE: apps/mcp-server/
NEXT: pm — create developer task (single-file, single-test-file change; safe to pair with sibling FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD, zero file overlap).
HANDOFF: docs/handoffs/FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST-BA-spec.md
PIPELINE: continue
