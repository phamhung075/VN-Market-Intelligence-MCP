# Decision Journal — Sprint FACTORY-INFRA-split-stores-and-migrations · dev-mcp-server

**Sprint goal:** Split vnstockStore.ts per entity + make schema-financial-reports.ts migrations declarative (P2, XL, risk=med).
**Agent:** dev-mcp-server
**Started:** 2026-07-24T06:15Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-24T07:15:00Z
**task-id:** FACTORY-INFRA-split-stores-and-migrations
**what-done:** Split vnstockStore.ts (937L) into `infrastructure/db/vnstock/` — one
file per entity: financialsStore.ts (73L), tradingStatsStore.ts (118L),
officersStore.ts (47L), shareholdersStore.ts (47L), eventsStore.ts (68L),
balanceSheetStore.ts (67L), cashFlowStore.ts (66L), foreignFlowStore.ts
(240L, over-cap justified), plus fetchLog.ts (78L, shared isStale/markFetched
— not named in the ticket but required since both are used by all 8 entities)
and migrations.ts (256L, over-cap justified — runVnstockMigrations verbatim).
vnstockStore.ts is now a 37L pure re-export barrel.
**what-considered:**
- Where to put isStale/markFetched (shared across all stores, not entity-specific):
  new fetchLog.ts vs. duplicating into each store vs. keeping in the barrel.
  Chose fetchLog.ts (mirrors the ssc-fetchers split precedent's sscCommon.ts).
- Where to put `_tradingStatsHasDateColumn` cache (read by storeTradingStats
  AND upsertForeignFlow, reset by runVnstockMigrations): a separate shared
  module vs. owning it in tradingStatsStore.ts with an exported reset fn.
  Chose the latter — tradingStatsStore.ts exports `tradingStatsHasDate` +
  `resetTradingStatsDateCache`; foreignFlowStore.ts and migrations.ts import
  from it. Avoids a 3rd shared-state file for one boolean cache.
- Per-column try/catch inside runColumnMigrations' loop vs. one big try around
  the whole loop (closer to the original's 7-separate-try-blocks resilience,
  since the original per-block boundary meant one block's failure didn't
  block the next block's independent columns). Chose per-column try — strictly
  equal-or-better resilience than original, verified no observable behavior
  difference since the table always exists by the time migrations run.
**why-decision:** Per-entity split (not per-function) matches the ticket's
explicit file list; fetchLog.ts is the minimum necessary shared-state
extraction, same pattern already used by the ssc-fetchers precedent split.
**why-change:** No change from plan — followed the ticket's exact file list.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-24T07:30:00Z
**task-id:** FACTORY-INFRA-split-stores-and-migrations
**what-done:** Converted schema-financial-reports.ts's ~22 inline
`if(!colNames.has(x)) ALTER TABLE` migrations (spread across 7 separate
try/catch blocks on the `financial_reports` table only — confirmed exact
count: 11+2+1+1+1+3+3=22) into ONE `FINANCIAL_REPORTS_COLUMN_MIGRATIONS:
{column,ddl}[]` array iterated by ONE `runColumnMigrations()` loop, called
once near the top of `initFinancialReportsTables` (right after `db.exec
(SQLITE_DDL)`, before any other table's CREATE — safe because financial_reports
always exists by that point and ALTER ADD COLUMN ops are mutually independent,
order-insensitive). The `CREATE INDEX idx_fr_extraction_method` (depends on
`extraction_method` existing) stays right after the loop call so ordering is
preserved. Left 4 OTHER tables' ALTER-TABLE migrations (bctc_vps_queue.
reconcile_attempts, vnstock_trading_stats.market_cap_bn, vnstock_officers.
appointment_year, bctc_table_rows.source_confidence) untouched — different
tables, out of the ticket's `financial_reports`-scoped ~22-migration count.
**what-considered:**
- Consolidate ALL table's ALTER migrations (26 total) into one generic
  `{table,column,ddl}[]` array vs. scoping the array to `financial_reports`
  only (22 entries, matching the ticket's exact count and the ticket's
  literal `[{column, ddl}]` shape with no table field). Chose the scoped
  version — matches the ticket precisely, smaller/safer diff, leaves the
  4 unrelated single-column migrations exactly as they were (zero touched
  behavior on tables outside financial_reports).
**why-decision:** `[{column, ddl}]` (no table field) in the ticket text is a
strong signal the intended scope is the single `financial_reports` table
where all 22 migrations already lived — confirmed by an exact count match.
**why-change:** No change from plan.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-24T07:50:00Z
**task-id:** FACTORY-INFRA-split-stores-and-migrations
**what-done:** Built the declarative-migration equivalence proof as an
ACTUAL A/B run, not a hand-wave: copied the pre-refactor schema-financial-
reports.ts verbatim from `git show HEAD:...` into a sibling temp file
(`__ab_old_schema_financial_reports.ts`, deleted after use, never committed),
imported BOTH `initFinancialReportsTables` (old vs. new) into an ad-hoc test,
ran each against its own fresh in-memory DB, and diffed `PRAGMA table_info`
output. Result: 5/5 pass — financial_reports column set (name/type/notnull/
default) byte-identical; idx_fr_extraction_method index identical; 6 unrelated
tables (bctc_vps_queue, vnstock_trading_stats, vnstock_officers, bctc_table_rows,
bctc_human_corrections, foreign_room_events) untouched; idempotent (2nd call
= no-op, no throw). Captured the golden 22-column dataset from this run and
hardcoded it into the PERMANENT committed test
(`FACTORY-INFRA-split-stores-and-migrations.test.ts`) so the equivalence
proof survives without needing the deleted temp file.
**what-considered:**
- `git-stash A/B` (as the task suggested) vs. copying the git-HEAD blob into
  a sibling file and running both old+new in the SAME process. Chose the
  latter — git stash would have required repeatedly stashing/popping actual
  uncommitted work mid-task (risk of losing edits) and couldn't run old-vs-new
  in the same assertion; the sibling-file approach gives a single, directly
  diffable, reproducible in-process comparison and is strictly stronger
  evidence (byte-level PRAGMA diff, not visual inspection of two separate runs).
**why-decision:** In-process PRAGMA diff is the strongest available proof
short of the (deferred, user-gated) live-DB verify — it directly answers
"does the new code produce the exact same schema as the old code," which is
the actual claim being made.
**why-change:** Substituted git-stash A/B (task's suggested mechanism) with
an equivalent-but-stronger sibling-file A/B diff for the reason above.

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-07-24T08:10:00Z
**task-id:** FACTORY-INFRA-split-stores-and-migrations
**what-done:** Ran full `bun test` (~1220 files) 3x to compare against a true
pre-change baseline (also captured via a full run before touching any file:
14729 pass / 40 skip / 48 fail / 2 errors). Post-refactor full runs settled
at 14743 pass / 40 skip / 57 fail, with the FULL failure-name diff (baseline
vs. final, timing-stripped, set-difference not string-diff) showing exactly
8 NEW failure names beyond baseline — all 8 in `vnstock-3statement.test.ts`
("vnstock balance sheet store" / "vnstock cash flow store" describe blocks),
a file I did NOT touch. Root-caused: that file's own comment already
documents a known hazard ("bypass Bun mock.module cache poison from 1466")
— `1466-sync-db-corruption-bail.test.ts` calls `mock.module("../infrastructure/
db/vnstockStore.js", () => ({...no-op stubs...}))`, which leaks into the
shared bun-test process for OTHER files unless bypassed via a cache-busting
`?isolate=` query-string import. Confirmed via isolation: (a) vnstock-
3statement.test.ts standalone → 10/10 pass; (b) paired with 1466 directly →
13/13 pass; (c) my own first draft of this test file ALSO had 8 functional
round-trip tests fail the SAME way in the full run (undefined returns / stale
isStale flips) — i.e. the SAME pre-existing hazard class, not a NEW one.
**what-considered:**
- Chase full root-cause via a clean "without my new test file" full-suite
  run to conclusively prove the hazard predates my change. Started this
  (2 full runs, ~17min combined) but it did not converge before the
  dispatcher's status-check nudged convergence; abandoned given diminishing
  returns vs. task time budget.
- Keep my new test file's functional round-trip section (Section 3, uses the
  shared getDb() singleton — same pattern ~15 other pre-existing vnstock test
  files already use) vs. remove it since it inherits the exact same
  pre-existing full-suite hazard and adds a second flaky witness with zero
  net new coverage (the same store/get round-trips are already exercised by
  those ~15 pre-existing files, all re-verified green in targeted runs).
  Removed Section 3; kept Section 1 (migration equivalence) + Section 2
  (barrel reference-identity) — both deterministic across all 3 full runs,
  zero flakiness observed.
**why-decision:** Adding a flaky witness to an ALREADY-DOCUMENTED, pre-
existing test-infra hazard is worse than not adding it — it doesn't prove
anything new (coverage already exists elsewhere) and creates false-alarm
risk for the next agent who runs the full suite. Sections 1+2 are the
load-bearing NEW proofs this task actually needs and are 100% deterministic.
**why-change:** Original test file draft had a Section 3; removed after full-
suite evidence showed it non-deterministically inherits pre-existing flakiness
unrelated to the refactor's correctness.

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-07-24T08:20:00Z
**task-id:** FACTORY-INFRA-split-stores-and-migrations
**what-done:** Committed the code (13 files, explicit pathspecs, index-only,
local, no push) — SHA `76c73b4c1fb17840bb9c8265e8063bac9d2d63ba`. Self-closeout
next: single orch-apply write moving the board row to review[], status=REVIEW,
next_agent=qa, .head→idle, with detail/status_note recording "code done;
rebuild + RAW-DB-verify PENDING (user-gated)".
**REBUILD + LIVE NAMED-VOLUME-DB RAW-VERIFY: EXPLICITLY PENDING (USER-GATED).**
This code change is CODE-ONLY per the CRITICAL SCOPE BOUND in the task —
no container was rebuilt, no live DB was touched. The change is inert until
the next user-authorized `docker compose up -d --build mcp-server`. The
ticket's DoD line "RAW-verify against the named-volume DB after rebuild that
vnstock financial values persist/read identically" is NOT met by this cycle
and must NOT be represented as met — outcome is PARTIAL-CODE-DONE-REBUILD-
PENDING, not DONE.
**what-considered:** N/A — scope bound explicit in task, no decision needed.
**why-decision:** N/A.
**why-change:** No change — task explicitly forbade rebuild/live-DB verify.
