# SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION — Does maxWindowPages truncation drop/mis-merge financial data in BCTC refine?

**Task:** SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION (P3, timebox 120min)
**Investigator:** dev-mcp-server (router-dispatched, coordination_session=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae)
**Mode:** read-only recon — code trace across `windowPartitioner.ts` → `refine_bctc_md` agent-flow →
`refinedMarkdownParser.ts` → `finalizeBctcRefine.ts` → `bctcScalarAggregator.ts`, plus a survey of
`docs/agent-memory/health/*.md` for the misattribution's live history. No code changed, no branch
created, no DB write.

---

## Question

The 2026-06-21T16:05Z health-recheck (ISSUE-8) framed 5× `[windowPartitioner] continuation window
truncated at maxWindowPages` as an **intelligence-cycle news signal-drop on high-news cycles**. Is
that framing correct? And separately: when a >`maxWindowPages` (default 3) continuation table is
split across two windows, does `finalizeBctcRefine` **lose rows**, **mis-merge** the spanning table,
or **stitch it correctly**?

---

## Finding 0 — the news-signal-drop framing is CONFIRMED WRONG

```
grep -rln "partitionIntoWindows\|windowPartitioner" apps/mcp-server/src --include="*.ts" | grep -v __tests__
→ getBctcPendingRefineTool.ts, bctcRefineJob.ts, windowPartitioner.ts, priceFreshnessGate.ts (comment only)
```

`partitionIntoWindows()` has **zero** callers in `intelligenceCycleJob.ts` or anywhere under
`news-analysis/`. It is used exclusively by the BCTC financial-report agentic-refine pipeline:
`getBctcPendingRefineTool.ts` (live path, called by `refine_bctc_md`'s `get_bctc_pending_refine`
MCP tool) and `bctcRefineJob.ts::refineOneReport` (a legacy/test-only orchestration path — "used by
tests; fleet cron uses MCP tools" per its own header comment). Confirmed by re-reading five
health-recheck cycles (`2026-06-19` through `2026-06-23`) that carried this same ISSUE-8 language:
the WARN was consistently reasoned about as an "intelligence-cycle"/"high-news" pagination concern
("Increase `maxWindowPages` in `intelligenceCycleJob.ts`") — that file was never in the call graph.
This has been sitting misdiagnosed for over a month.

Also disproved in passing: the docstring at `windowPartitioner.ts:50` and the backlog description
both assert the truncation is "already flagged `truncated_continuation`". No such flag exists
anywhere in the codebase — `Window` (windowPartitioner.ts:28-33) and `RefineWindow`
(getBctcPendingRefineTool.ts:82-89) both carry only `{unit_id, page_numbers, texts/page_type,
needsImage/needs_image}`. `grep -rn "truncated_continuation" apps/mcp-server/src` → 0 hits outside
the stale comment itself. This is a comment≠code drift, not a real safety net.

---

## Finding 1 — no page or window is ever dropped (mechanically)

`partitionIntoWindows`'s outer loop (`windowPartitioner.ts:63-111`) always advances `i = j` after
building each window, and `j` only ever points at the next un-consumed page — every page in
`pageTexts` lands in exactly one window, cap or no cap. `finalizeBctcRefine`'s
`parseDoneUnitsToRows` (finalizeBctcRefine.ts:160-206) reads **all** `DONE` `bctc_refined_units`
rows `ORDER BY unit_id ASC` and flattens every window's parsed rows into one list — no window is
skipped, no page range goes missing. So the literal "rows disappear" framing is not what happens.

## Finding 2 — but the tail window is NOT a clean stitch: a real corruption path exists

When the cap is hit mid-continuation (`windowPartitioner.ts:92-101`), the loop does **not** fold
the excess pages into the current window — it logs the WARN and starts a **brand-new window**
at the very next page (`i = j`), which is itself a continuation page (it matched
`CONTINUATION_MARKER` against the prior page, that's *why* the WARN fired). Call this **window
A** (`[N, N+1, N+2]`, has the table's real header on page N) and **window B** (`[N+3, N+4, …]`,
starts mid-table with no header of its own).

Both windows get `page_type: "continuation"` from `getBctcPendingRefineTool.ts:319-335` and are
dispatched to the **same** sub-flow, `docs/agents/refine_bctc_md/flow/continuation-stitch.md`. That
flow's contract (`main.md:82-85`, `continuation-stitch.md` Steps 2-3) treats the window's *first*
page unconditionally as "page N": "Collect header + data rows" — a rule written for a window that
genuinely starts at the top of a table. It has no branch for "this window's first page is itself a
truncated mid-table continuation with no header of its own" — that shape only exists **because of**
the `maxWindowPages` cap, and the flow was never updated to anticipate it.

Downstream, this matters because `refinedMarkdownParser.ts::resolveColumnLayout()`
(refinedMarkdownParser.ts:386-393) decides whether a 4+-column table is **code-first** (VAS
corporate convention: `Mã số | Chỉ tiêu | …`) or **label-first** (bank Mẫu B02a/TCTDHN convention:
`Mục | Mã | …`, confirmed live for CTG — see `FIX-BCTC-BANK-BS-COLUMN-ORDER`) by reading the
header row's own cell text. `headerCells` is a **local variable re-initialized to `null` on every
call** to `parseRefinedMarkdown` (refinedMarkdownParser.ts:439) — unlike `statement_section`, which
*is* explicitly threaded window-to-window via `initialSection`/`finalSection`
(refinedMarkdownParser.ts:404-419, finalizeBctcRefine.ts:162,174-175, with an explicit code
comment calling out exactly this "printed once, on the FIRST page, never repeated" hazard for
`statement_section`). Column-layout state has no equivalent thread.

So: window B's markdown, if it has no header line (the expected case — page N+3 genuinely doesn't
print one), falls through to the already-shipped headerless-recovery branch
(refinedMarkdownParser.ts:502-516, `FIX-BCTC-BANK-BS-SECTION-CLASSIFIER`) which correctly promotes
straight to data-row parsing (no rows are dropped to zero — this part *was* already hardened). But
`resolveColumnLayout(null)` then falls back to the **default `"code-first"` layout**
(refinedMarkdownParser.ts:387,391). For a **label-first** (bank-form) table whose true header only
existed in window A, every 4-column data row in window B has **`code` and `label` silently
swapped** (refinedMarkdownParser.ts:591-603 vs 597-603 — both layouts read `value_current`/
`value_prior` from the *same* cell indices 2/3, so only `code`/`label` text is corrupted, not the
numeric values themselves).

This is not inert: `bctcScalarAggregator.ts` resolves headline scalars (`total_assets`,
`equity_total`, `net_revenue`, …) via **label-pattern matching preferred over code**
(`bctcScalarAggregator.ts:20-21` "LABEL-CANONICAL: prefer label match first", `:396-399`
`TOTAL_ASSETS_LABEL.test(r.label)`) and also uses row `code`/`label` shape to auto-detect
bank-vs-corporate form (`isBankFormFromRows`, imported `:62`). A code/label swap in window B's rows
can therefore make the correct grand-total row invisible to the label matcher (its descriptive text
is now sitting in the `code` column) — silently degrading or nulling exactly the headline figures
this pipeline exists to produce, with **no error, no flag, and no gate that catches it**:
`checkSectionCompleteness` (BEQ-7, `bctcSectionCompleteness.ts`) only checks *presence* of
`statement_section` values, never `code`/`label` correctness, so a swapped-but-present row still
reads as "complete."

## Finding 3 — this is a live-reproducible trigger, same defect family as an already-shipped fix

`docs/agent-memory/health/team-tool-recheck-2026-06-21-1605.md` recorded **5 real firings within
the same second** of a single run — this is not a theoretical edge case; multi-page continuation
tables routinely exceed 3 pages in real VN BCTC filings (bank Mẫu B02a/TCTDHN balance sheets in
particular run long). The exact code/label column-order confusion this finding describes is the
**same root mechanism** already fixed once for the *single-window, no-captured-header* case
(`FIX-BCTC-BANK-BS-COLUMN-ORDER`, confirmed live for CTG) — that fix added `resolveColumnLayout()`
+ within-window header capture, but never added **cross-window** header/layout threading, so the
truncation-tail scenario re-opens the identical hazard through a side door the original fix didn't
anticipate.

**What was NOT independently reproduced within this timebox:** a live corrupted `bctc_table_rows`
row instance from an actual truncation-tail window (would require pulling a real `bctc_refined_units`
row with `unit_id` > the report's first truncated unit and diffing its markdown/parsed row against a
known label-first bank filing — out of scope for a 120-min code-trace spike). This finding is a
verified **code-path/contract gap**, corroborated by live-trigger frequency and an already-shipped
sibling defect, not a directly-observed corrupted row.

---

## Disposition

**Neither "clean stitch" nor "wholesale data loss."** The WARN's severity should **stay WARN**
(not downgraded to INFO) — the underlying mechanism has a real, live-reproducible corruption path,
not merely already-flagged degraded behavior. A FIX is minted (below) rather than a severity
downgrade, per the task's own either/or framing, justified by Findings 2-3 above (not a blind
guess): the "raise `maxWindowPages`" fix and the "thread header/column-layout state across windows"
fix are two independent, non-exclusive mitigations, and the choice between them (or both) needs an
explicit design call — hence `next_agent: architect`, not a blind implementation.

Separately (not a FIX, just a fact for whoever owns health-recheck triage going forward): future
health-recheck cycles should stop attributing this WARN to `intelligenceCycleJob.ts`/news
signal-drop — Finding 0 is dispositive and grep-verifiable in under a minute.

### Mint: `FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW` (P2, backlog)

Root cause: `windowPartitioner.ts`'s `maxWindowPages` cap creates a "headless tail window" (first
page is itself a mid-table continuation with no header of its own) that (a) `continuation-stitch.md`'s
sub-flow contract never anticipated (assumes the window's first page always carries the real
header) and (b) `refinedMarkdownParser.ts::resolveColumnLayout()`'s `headerCells` state is not
threaded across windows the way `statement_section` already is — so a label-first (bank Mẫu
B02a/TCTDHN) continuation table whose true header lived only in the truncated head window silently
defaults to code-first layout for its tail window, swapping `code`/`label` on every data row,
degrading `bctcScalarAggregator`'s label-pattern resolution of headline scalars with no error/flag.
Candidate mitigations for architect to weigh (not mutually exclusive): (1) raise `maxWindowPages`
default / make it PDF-adaptive so real long bank tables don't split; (2) thread a
`headerCells`/layout hint forward across windows in `parseDoneUnitsToRows` exactly the way
`carrySection` already is; (3) have `windowPartitioner` mark truncation-tail windows explicitly
(the docstring already claims this exists — make it real) so `continuation-stitch.md` can fetch
page N's header context on demand instead of assuming it's absent.

---

## Code references

- WARN + truncation branch: `apps/mcp-server/src/application/utils/windowPartitioner.ts:56-114`
  (outer loop `i=j` never skips a page: L110; cap-hit WARN: L92-101; stale
  `truncated_continuation` docstring claim: L50).
- Server-side window list (no truncation flag surfaced to caller):
  `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts:82-89,
  299-344`.
- Legacy/test-only orchestration path (same partitioner, not the live path):
  `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts:280-398`.
- Live agentic-refine dispatch by `page_type` (no truncation-tail branch):
  `docs/agents/refine_bctc_md/flow/main.md:75-104`.
- Sub-flow contract assuming window's first page always has the real header:
  `docs/agents/refine_bctc_md/flow/continuation-stitch.md:12-26,58-64`.
- Finalize merge — flattens all DONE windows' rows, threads `statement_section` but nothing about
  column layout: `apps/mcp-server/src/application/usecases/finalizeBctcRefine/finalizeBctcRefine.ts:160-206`.
- Column-layout resolution — per-call `headerCells`, no cross-window threading, defaults to
  code-first when absent: `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts:386-393,
  421-439, 502-516, 591-603`.
- Headerless-row-recovery (already hardened — rows are NOT dropped to zero without a header):
  `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts:502-516`
  (`FIX-BCTC-BANK-BS-SECTION-CLASSIFIER`).
- Scalar aggregator — label-preferred matching, sensitive to code/label swap:
  `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts:20-21,396-399`.
- Section-completeness gate (does NOT catch code/label swap — presence-only check):
  `apps/mcp-server/src/domain/services/financial-reports/bctcSectionCompleteness.ts:27-60`.
- Sibling already-shipped defect (same root mechanism, single-window case):
  `FIX-BCTC-BANK-BS-COLUMN-ORDER` (referenced throughout `refinedMarkdownParser.ts` comments,
  confirmed live for CTG).
- Live misattribution history (5 cycles, 2026-06-19 → 2026-06-23), including the original 5×
  same-second firing: `docs/agent-memory/health/team-tool-recheck-2026-06-21-1605.md:190-203`,
  and continued "MONITOR"/"UNCERTAIN"/"RESOLVED — not reproduced this cycle" churn in
  `team-tool-recheck-2026-06-19-2005.md`, `-2026-06-20-0007.md`, `-2026-06-20-0205.md`,
  `-2026-06-21-1806.md`, `-2026-06-21-2007.md`, `-2026-06-21-2206.md`, `-2026-06-22-0004.md`,
  `-2026-06-23-1008.md`, `-2026-06-23-1211.md`.
- No test exercises the actual >`maxWindowPages` split-across-two-windows scenario end to end
  (partition → refine → finalize): `grep -rn maxWindowPages apps/mcp-server/src/__tests__` only
  covers `maxWindowPages: 3` with inputs that never exceed it
  (`AR-refined-units-idempotency.test.ts:346,369`; `FIX-REFINE-WINDOW-DB-PAGELIST.test.ts:128`,
  which tests a different bug — DB-driven page-list construction, not the continuation cap).
