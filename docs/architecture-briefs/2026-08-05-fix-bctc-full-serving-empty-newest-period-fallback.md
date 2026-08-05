# get_bctc_full Empty-Newest-Period Head-of-Line Block — Fallback-to-Servable-Period Fix

**Task:** `FIX-BCTC-FULL-SERVING-EMPTY-NEWEST-PERIOD-HEAD-OF-LINE` (`docs/data/orch/orch-state.json` →
`task_board.backlog`) — P0, size S, zone=`apps/mcp-server/`, owner=po
**Author:** agents-architect | **Date:** 2026-08-05
**Scope:** Design only. No app code, no test file, no container action this session.

---

## 1. Root cause (verified by direct read, `bctcFullTools.ts`)

`get_bctc_full`'s row-selection query is unconditional on data usability:

```ts
// bctcFullTools.ts:954-958
const latestRow = db
  .query<ReportRow, typeof params>(
    `SELECT * FROM financial_reports WHERE ${whereClause} ORDER BY sort_key DESC LIMIT 1`,
  )
  .get(params);
```

`whereClause` is `action_code = $code` (+ optional `period_year`/`period_type` when the caller
supplies `year`/`quarter`). With no year/quarter filter this always returns the single newest
period, full stop — no predicate on `refine_status`, `text_status`, or `validation_status`.

The row then runs the existing `checkPublishability` gate (PUB-1..8, :609-857). PUB-1 is first:

```ts
// bctcFullTools.ts:616-627
const report = db.query<{ refine_status: string }, [string]>(
  "SELECT refine_status FROM financial_reports WHERE id = ?",
).get(reportId);
if (!report || !["DONE", "PARTIAL"].includes(report.refine_status)) {
  return { publishable: false, reason: "Chưa có dữ liệu BCTC" };
}
```

For FPT/HPG/VCB the newest row (2026-Q2) is an `ensureFinancialReportShellRow.ts` shell:
`refine_status=PENDING`, `total_assets=NULL`, `validation_status=pending_extraction` — created the
moment the PDF is pulled, before extraction runs (same shell mechanism `reports.ts`'s
`FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS` comment already documents). PUB-1 rejects it, and the tool
handler (:1190-1200) returns `pubCheck.reason` verbatim with **zero fallback** — `"Chưa có dữ liệu
BCTC"` is returned even though 2026-Q1 and 2025-Q4 sit one and two periods back, both
`refine_status=DONE`, both `validation=passed`/`passed_with_warnings`, fully servable. Confirmed
against the row's own live DB probe (three tickers, byte-identical shape).

This is a **selection defect**, not a **gate** defect: PUB-1..8 correctly identify the newest row as
unusable — the bug is that nothing tries the next-most-recent row when they do.

Notable: `buildComparisonSection` (:366-493, used only for the *prior*-period side of the QoQ/YoY
delta once `latestRow` is already fixed) already has exactly the fallback shape this fix needs, at
smaller scope — it walks to `sort_key < latest.sort_key ORDER BY sort_key DESC LIMIT 1` (:393-402)
and separately withholds (not fails) when that prior row is itself `refine_status='PENDING'`
(:415-421). The file already knows "don't trust the newest row without checking it," it just never
applies that discipline to the *primary* row the whole response is keyed on.

## 2. Shared-root-cause hypothesis vs `FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW` — REFUTED (same bug class, not a shared helper)

Read the sibling row in full (`review_note`, `getBctcPendingRefineTool.ts` live) before concluding.

| | `get_bctc_full` (this row) | `get_bctc_pending_refine` (sibling, shipped) |
|---|---|---|
| File | `bctcFullTools.ts` | `getBctcPendingRefineTool.ts` — separate module, no shared import between them (grep-confirmed: neither file references the other; no shared row-selection helper module exists for either) |
| Scope of query | ONE ticker's newest period (`WHERE action_code=?`) | ALL tickers' refine queue (`ORDER BY parsed_at ASC`, no `action_code` filter by default) |
| Selection axis | newest by `sort_key` (report *period*) | oldest by `parsed_at` (report *ingestion order*, a work queue) |
| What was wrong | newest-selected row can be an **empty PENDING shell** never extracted, no fallback to an older *usable* row exists at all | a **terminal FAILED** row with zero remaining retry windows sat at the queue head, `NOT (...)` exclusion added to the WHERE clause so the query skips past it to the next queue row |
| Fix shape ratified | (this brief) fallback: try the next-most-recent *usable* period | exclusion: `NOT (refine_status IN ('PARTIAL','FAILED') AND zero-remaining-windows)` |

Both bugs are the same **bug class** — "pick the row favored by one sort key, without an
is-this-row-actually-usable predicate, and don't recover when it isn't" — and this is now the
**third** live instance of that class in this file family (see §3). But they are not the same
code, not the same query shape, and not fixable by porting the sibling's literal SQL clause: the
sibling excludes *terminal-dead* rows from a *multi-report queue*; this one needs a *fallback to an
older row* for a *single-ticker latest lookup*, which is a different operation (a queue exclusion
has nothing to fall back TO — it just moves to the next queue row, which already is a different
report; `get_bctc_full` must actively re-query for an older period of the *same* ticker). Verdict:
**hypothesis refuted as a shared-helper claim; confirmed as a recurring class the owning file family
should absorb a general lesson from** (see §5 risk flag).

## 3. Blast-radius check — other `ORDER BY sort_key DESC LIMIT 1` call sites

```
grep -rn "ORDER BY sort_key DESC" apps/mcp-server/src --include="*.ts" | grep -v __tests__
```
found 6 non-test hits. Triaged each:

- **`bctcFullTools.ts:956` (get_bctc_full)** — THIS row, confirmed broken, in scope.
- **`reports.ts:288` (get_financial_summary)** — same "newest row, no filter" shape, but this file
  already carries a *narrower*, already-shipped mitigation (`FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS`,
  :308-328): it gates on `validation_status === 'pending_extraction'` before serving and returns an
  honest "not yet extracted — check back shortly" message instead of the bare
  "Chưa có dữ liệu BCTC". That fix stopped short of adding a fallback to the prior COMPLETE period —
  same class, smaller symptom (honest message vs. bare absence), **not today's live P0 outage**
  (PO's live probe target was `get_bctc_full`, not `get_financial_summary`). Recommend a follow-up
  P2/P3 row once this one ships, reusing the same fallback shape — do not fold into this S-size row.
- **`reports.ts:430` (`compare_financials`'s `fetchRow`)** — NOT affected: both `period1` and
  `period2` are mandatory explicit `{year, quarter}` inputs (`PeriodSchema`, required in the Zod
  schema), there is no implicit "latest" selection here at all, so there is no head-of-line row to
  fall behind. Out of scope, confirmed by design not just by absence of a report.
- **`bctcSeriesTools.ts:131`, `getBctcReportIdTool.ts:134/158`, `tickerIntelligenceTools.ts:232`,
  `compareTools.ts:122`** — NOT read in depth this session (would expand this S-size row's blast
  radius past its own zone/time-box). Flagged, not verified — the existing
  `SPIKE-BCTC-Q1-2026-SERVABILITY-CENSUS` row (backlog/architect, already noted by PO as sequenced
  *after* this fix) is the natural place to sweep these for the same class, since it already exists
  to measure servability through this tool family. Do not mint a duplicate census row here.

## 4. Proposed fix

Scope the fallback to the **no-explicit-period** call shape only — `year`/`quarter` are optional
filters and the tool's own docstring says "If year/quarter are omitted, returns the most recent
available period" (mirrors `get_financial_summary`'s doc verbatim). An explicit `{year, quarter}`
request must keep returning an honest per-period answer for that exact period (including PUB-1's
existing "not ready yet" message) — silently substituting a different period the caller didn't ask
for would be a correctness regression, not a fix. This mirrors the `get_financial_summary` /
`compare_financials` split already established in `reports.ts` (implicit-latest gets a fallback
policy; explicit-period stays exact).

**For the no-filter path:** replace the single `LIMIT 1` fetch with a bounded candidate scan (newest
`N` periods for the ticker, `N` = 6 — roughly 1.5 years of quarters, small and index-backed via the
existing `action_code`/`sort_key` access pattern, not an unbounded table scan), then reuse the
**existing** `checkPublishability` gate (already exported, already covers PUB-1..8 in one place —
extend, don't duplicate, per this agent's `always_extend_not_duplicate` constraint) to pick the
newest candidate that actually passes:

```ts
const CANDIDATE_WINDOW = 6;

let latestRow: ReportRow | null;
let servedOlderThanNewest: { newestSortKey: string } | null = null;

if (year === undefined && quarter === undefined) {
  const candidates = db
    .query<ReportRow, [string]>(
      `SELECT * FROM financial_reports WHERE action_code = $code
       ORDER BY sort_key DESC LIMIT ${CANDIDATE_WINDOW}`,
    )
    .all({ $code: upperCode });

  latestRow = null;
  for (const candidate of candidates) {
    const bf = isBankFormFromDb(db, candidate.id);
    const check = checkPublishability(db, candidate.id, bf, candidate);
    if (check.publishable) {
      latestRow = candidate;
      if (candidate.id !== candidates[0]?.id) {
        servedOlderThanNewest = { newestSortKey: candidates[0].sort_key };
      }
      break;
    }
  }
  // No candidate in the window is publishable → preserve today's honest-rejection
  // behavior by falling through to the absolute-newest row, so PUB-1..8's existing
  // reason strings still fire (this is NOT a silent-absence regression — it is the
  // unchanged behavior for a ticker with genuinely no usable data at all).
  if (latestRow === null) latestRow = candidates[0] ?? null;
} else {
  latestRow = db.query<ReportRow, typeof params>(
    `SELECT * FROM financial_reports WHERE ${whereClause} ORDER BY sort_key DESC LIMIT 1`,
  ).get(params);
}
```

Notes for the implementer:
- `checkPublishability`/`isBankFormFromDb` are already called a second time later in the handler
  (:1177, :1190) against whatever `latestRow` ends up being — that is correct and must stay (the
  loop's own calls are only to find the *right* row; the existing downstream calls still drive
  `pubCheck.sanitizedRatios`/`partialWarning` used by `buildSummarySection`). Do not try to thread
  the loop's `PublishabilityCheck` result through to skip the existing :1190 call — it must run
  against the *finally chosen* row either way, so the small extra work is correctness, not waste.
- Emit an honest note (same `FR-DEGRADE-01` philosophy already used in this file for VPS staleness,
  :901-937 / :1218-1227 — never silently serve a *different* period than "the newest" without saying
  so) when `servedOlderThanNewest` is set, e.g. appended to `textOutput` and mirrored in the
  `content[1]` JSON block: `"Kỳ mới nhất (${candidates[0].sort_key}) chưa được trích xuất — hiển thị
  kỳ gần nhất có dữ liệu (${latestRow.sort_key})."` This satisfies AC-3's "fall back" requirement
  without hiding that a newer period exists but isn't ready — same transparency bar this file
  already holds itself to for VPS staleness.
- `CANDIDATE_WINDOW=6` is a named constant, not a magic number, and bounds the extra query cost to a
  handful of indexed row fetches plus up to 6 `checkPublishability` calls (each already O(few
  indexed COUNT queries) — same cost class the existing single-row path already pays once). If a
  ticker has zero usable periods within the last 6, `latestRow` falls back to the absolute newest and
  serves today's PUB-* rejection message unchanged — no new failure mode introduced.

## 5. Risk flags

- **DDD/layering:** the new candidate-scan loop stays in the `interface/mcp/tools` file alongside
  the query it replaces — same layer as today, no new domain/application seam required for an S-size
  in-zone fix. If a 4th instance of this bug class turns up during the servability census (§3), that
  would be the trigger to extract a shared `selectServableFinancialReport(db, code, {year, quarter})`
  helper into `domain/services/financial-reports/` — **not now**, one extra call site does not justify
  a new abstraction (YAGNI), but flag it so the census row's own design step doesn't have to
  re-derive this reasoning from scratch.
- **Explicit-period behavior must not change.** The single highest-risk regression here is
  accidentally applying the fallback when `year`/`quarter` ARE supplied — that would silently answer
  a different period than the one asked for. The design above branches on `year === undefined &&
  quarter === undefined` specifically to keep the explicit path byte-identical to today.
- **PUB-1's own known caveat (pre-existing, not this row's defect, but adjacent):** `reports.ts`'s
  own comment (:312-317) notes `refine_status` never transitions for reports extracted only through
  the legacy scalar pipeline, so such rows can carry real data while `refine_status` sits at its DB
  default. If any of the `CANDIDATE_WINDOW` rows fall into that class, the loop would (correctly, per
  existing PUB-1 semantics) skip them the same way the current single-row path already would — this
  fix does not create or worsen that pre-existing edge case, only surfaces it slightly more often
  (across 6 candidates instead of 1). Not a blocker; noted for QA test-design awareness only.

## 6. Test strategy

Extend `apps/mcp-server/src/__tests__/240-bctc-full.test.ts` (existing fixture helpers
`insertFinancialRow`/`insertTableRow`/`insertRefinedUnit`/`makeDb`/`makeServer` — DB default
`refine_status='DONE'`, override per-row as needed). New `describe` block, e.g.
`"FIX-BCTC-FULL-SERVING-EMPTY-NEWEST-PERIOD-HEAD-OF-LINE — fallback to newest servable period"`:

1. **RED-then-GREEN, AC-1/AC-3 core case:** insert 2026-Q1 (DONE, full data + `insertTableRow` +
   `insertRefinedUnit`) then 2026-Q2 (`refine_status: 'PENDING'`, `total_assets: 0`/shell-shape, no
   `bctc_table_rows`/`bctc_refined_units` rows). Call `get_bctc_full({code})` with no year/quarter →
   must return the 2026-Q1 data (`content[0]` contains `"2026-Q1"`, NOT the literal string
   `"Chưa có dữ liệu BCTC"`), plus the honest fallback note mentioning `2026-Q2`. Fails today
   (returns the bare rejection string) — this is the row's own `verification_gate` reproduced as a
   unit test.
2. **Negative control — explicit period must NOT fall back:** same two-period fixture, call with
   `{code, year: 2026, quarter: 'Q2'}` explicitly → must still return the PUB-1 rejection message for
   Q2 specifically (proves the explicit-filter path is untouched).
3. **No usable period in window — unchanged failure behavior:** insert only a single PENDING shell
   row (no older DONE/PARTIAL row at all) → must still return the same "Chưa có dữ liệu BCTC" (or
   whichever PUB-* reason fires) as today — proves the fallback doesn't fabricate data when none
   exists.
4. **Multi-period skip:** insert 2025-Q4 (DONE), 2026-Q1 (`refine_status: 'FAILED'`, no publishable
   rows — simulates a failed extraction attempt, not just a not-yet-started shell), 2026-Q2 (PENDING
   shell) → must skip both unusable periods and serve 2025-Q4.
5. **Regression:** existing test at :475 ("returns graceful message when no financial data exists for
   the stock" — zero rows at all, not even a shell) must stay green unchanged (the candidate query
   simply returns `[]`, `candidates[0]` is `undefined`, falls through to the existing `!latestRow`
   branch).

`bun tsc --noEmit` clean + this file's full suite green is the local gate; live verification gate
per the row's own AC is `get_bctc_full(code: "FPT"|"HPG"|"VCB")` through the gateway returning
structured data post-deploy (same user-gated-rebuild caveat as the sibling row — **do not rebuild
autonomously**; this codebase's own recent history on the sibling row shows a shipped fix sitting
unverifiable behind a stale container image until a user-authorized rebuild — surface the rebuild
request explicitly when this reaches QA, do not assume it or skip the live gate).

## Standard Detection

BUG-FIX / REFACTOR (in-zone, no new primitives) → **BUILD-STANDARD: not-applicable** (skip).

## RETURN

DONE: Root cause confirmed — `get_bctc_full` selects the newest `financial_reports` row for a
ticker unconditionally (`ORDER BY sort_key DESC LIMIT 1`, `bctcFullTools.ts:954-958`) and the
downstream PUB-1 publishability gate rejects it with zero fallback when it's an empty
pending-extraction shell, surfacing the bare "Chưa có dữ liệu BCTC" even though older, fully
COMPLETE/validated periods exist for the same ticker. Shared-root-cause hypothesis vs
`FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW` REFUTED as a literal shared-helper claim (different
files, different queries, different selection axis — queue-exclusion vs per-ticker fallback) but
CONFIRMED as the same recurring bug class (3rd live instance in this file family, see §3).
Fix: bound a 6-period candidate scan for the no-explicit-filter path only, reuse the existing
exported `checkPublishability` gate to pick the newest row that's actually servable, fall through to
today's unchanged rejection behavior when none in the window qualify. Explicit `{year, quarter}`
calls are untouched by design (§4).
ZONE: apps/mcp-server/
NEXT: dev-mcp-server — implement §4, tests per §6, all within `bctcFullTools.ts` +
`240-bctc-full.test.ts`; no PM decomposition needed for a single-file S-size fix with AC/verification
gate already fully specified by PO + this brief.
HANDOFF: docs/data/orch/orch-state.json task_board row `FIX-BCTC-FULL-SERVING-EMPTY-NEWEST-PERIOD-HEAD-OF-LINE`
`.architect_review_note` (no `docs/handoffs/` file — direct PO board-mint, no BA spec, per this
flow's own established convention for supervised/direct-mint rows).
PIPELINE: continue
