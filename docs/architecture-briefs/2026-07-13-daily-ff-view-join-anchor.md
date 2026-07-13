# FIX-DAILY-FF-VIEW-JOIN-ANCHOR — daily_ohlcv_with_flow bidirectional view

**Task:** FIX-DAILY-FF-VIEW-JOIN-ANCHOR | **Sprint:** ARCH-DAILY-FOREIGN-FLOW-TABLE | **Zone:** `apps/mcp-server/`
**Author:** architect | **Status:** READY_FOR_DEV → dev-mcp-server
**CI gate:** CI-RED-29f92c5b — `apps/mcp-server/src/__tests__/daily-foreign-flow-integration.test.ts` (2 RED-by-design assertions, PO-accepted gate)

## Decision: SHAPE A (bidirectional/FULL-OUTER-emulated view)

Shape B (point the 5 Class-A read sites at `daily_foreign_flow` directly, leave the view
untouched) is **structurally disqualified**, not just less-preferred: the 2 frozen gate
assertions in `daily-foreign-flow-integration.test.ts` (`queryViewRow()`) query
`daily_ohlcv_with_flow` **directly** — they do not go through any Class-A tool function.
No amount of read-site rewiring changes what that helper selects. The only way to flip
those 2 assertions GREEN without editing the test is to fix the view itself. Shape A it is.

## Root cause (verified)

`apps/mcp-server/src/infrastructure/db/schema-market-data.ts:162-174`:

```sql
CREATE VIEW IF NOT EXISTS daily_ohlcv_with_flow AS
SELECT
  o.code, o.date, o.open, o.high, o.low, o.close, o.volume, o.updated_at, o.data_env,
  COALESCE(f.foreign_buy_vol,    o.foreign_buy_vol)    AS foreign_buy_vol,
  COALESCE(f.foreign_sell_vol,   o.foreign_sell_vol)   AS foreign_sell_vol,
  COALESCE(f.foreign_net_vol,    o.foreign_net_vol)    AS foreign_net_vol,
  COALESCE(f.put_through_vol,    o.put_through_vol)    AS put_through_vol,
  COALESCE(f.foreign_buy_value,  o.foreign_buy_value)  AS foreign_buy_value,
  COALESCE(f.foreign_sell_value, o.foreign_sell_value) AS foreign_sell_value
FROM daily_ohlcv o
LEFT JOIN daily_foreign_flow f ON f.code = o.code AND f.date = o.date;
```

Anchored on `daily_ohlcv` (the LEFT side). A `(code,date)` key that exists ONLY in
`daily_foreign_flow` never has an anchor row, so it is never emitted — COALESCE only
resolves column-value precedence *after* a row already exists; it cannot manufacture a
row the anchor table lacks. SQLite has no `FULL OUTER JOIN` keyword, so the fix emulates
one: `LEFT JOIN` (existing, unchanged) `UNION ALL` an anti-joined pass over
`daily_foreign_flow` for the keys `daily_ohlcv` doesn't have.

## Exact view SQL (replaces schema-market-data.ts:162-174)

```sql
DROP VIEW IF EXISTS daily_ohlcv_with_flow;

CREATE VIEW daily_ohlcv_with_flow AS
SELECT
  o.code, o.date, o.open, o.high, o.low, o.close, o.volume, o.updated_at, o.data_env,
  COALESCE(f.foreign_buy_vol,    o.foreign_buy_vol)    AS foreign_buy_vol,
  COALESCE(f.foreign_sell_vol,   o.foreign_sell_vol)   AS foreign_sell_vol,
  COALESCE(f.foreign_net_vol,    o.foreign_net_vol)    AS foreign_net_vol,
  COALESCE(f.put_through_vol,    o.put_through_vol)    AS put_through_vol,
  COALESCE(f.foreign_buy_value,  o.foreign_buy_value)  AS foreign_buy_value,
  COALESCE(f.foreign_sell_value, o.foreign_sell_value) AS foreign_sell_value
FROM daily_ohlcv o
LEFT JOIN daily_foreign_flow f ON f.code = o.code AND f.date = o.date

UNION ALL

SELECT
  f.code, f.date,
  NULL AS open, NULL AS high, NULL AS low, NULL AS close, NULL AS volume,
  f.updated_at, NULL AS data_env,
  f.foreign_buy_vol, f.foreign_sell_vol, f.foreign_net_vol, f.put_through_vol,
  f.foreign_buy_value, f.foreign_sell_value
FROM daily_foreign_flow f
LEFT JOIN daily_ohlcv o ON o.code = f.code AND o.date = f.date
WHERE o.code IS NULL;
```

**15 columns, identical order in both halves** — required for a valid `UNION ALL` and so
`PRAGMA table_info(daily_ohlcv_with_flow)` keeps resolving all 15 names (SQLite takes
compound-view column names from the *first* SELECT — verified below).

Column-by-column for the anti-join half: `code`/`date`/foreign-* columns come straight
from `f` (real data, not fabricated). Price columns (`open/high/low/close/volume`) and
`data_env` are `NULL` — there is genuinely no OHLCV bar yet, so `NULL` is the honest
value (no fake data — user directive `feedback_no_fake_data_real_fetch.md`).
`updated_at` uses `f.updated_at` (the FF write's own timestamp) rather than `NULL` since
it's a real, meaningful freshness signal for that row.

**Production migration note (footgun flagged):** the live MCP-server DB is a persistent
named Docker volume, not recreated per boot. The old view was created with
`CREATE VIEW IF NOT EXISTS` — on a DB that already has `daily_ohlcv_with_flow` in
`sqlite_master`, `IF NOT EXISTS` is a silent no-op and the corrected definition would
NEVER take effect after deploy, even though every test (fresh `:memory:` DB per test)
would go green. The `DROP VIEW IF EXISTS` + unconditional `CREATE VIEW` above is
required, not optional. Views carry no data — dropping and recreating is O(1), zero
data-loss risk, safe to run unconditionally on every boot.

## Verified via isolated sqlite3 scratch session (no repo files touched)

Ran this exact SQL against a throwaway `sqlite3 :memory:` session (not the app, not
`apps/mcp-server/**`) to empirically confirm behavior before handoff:

- FF-only row (T-3 / gate case): view returns **1 row**, price cols NULL,
  `foreign_buy_vol=555` — correct.
- Late-OHLCV join (T-4 regression case: FF written first, OHLCV bar arrives after):
  view returns **exactly 1 row** (anti-join correctly excludes it once the anchor
  appears — no duplicate), `close=205` (real price), `foreign_buy_vol=300` preserved
  (not overwritten) — matches the existing T-4 regression assertion.
- Legacy-only fallback (no `daily_foreign_flow` row, only legacy `daily_ohlcv.foreign_*`
  columns): COALESCE falls back correctly (`222`/`200`) — unchanged behavior.
- `PRAGMA table_info(daily_ohlcv_with_flow)` returns all 15 expected column names
  (`code, date, open, high, low, close, volume, updated_at, data_env, foreign_buy_vol,
  foreign_sell_vol, foreign_net_vol, put_through_vol, foreign_buy_value,
  foreign_sell_value`) — the existing `daily-foreign-flow-schema.test.ts` "view exposes
  the same foreign-flow column names" assertion keeps passing.

## How the 2 gate assertions go GREEN

- **T-3 (view correctness):** insert FF-only row → `queryViewRow()` now hits the
  anti-join branch → returns the row → `foreign_buy_vol=555` assertion passes.
- **Behavioral gate (R-1 elimination proof):** `writeForeignFlowToOhlcv()` writes to
  `daily_foreign_flow` with zero `daily_ohlcv` rows → same anti-join branch → view
  returns `foreign_buy_vol=100` → assertion passes.
- The other 3 tests already in that file (COALESCE-both, COALESCE-legacy-fallback,
  late-OHLCV-join/T-4) all still pass under Shape A (verified above) — no regression
  within the gate file itself.

## Blast radius — who reads `daily_ohlcv_with_flow` (grepped, not assumed)

Exactly 5 sites do `FROM daily_ohlcv_with_flow` in production code (matches the task's
Class-A list, confirmed by grep — `slaStatusTools.ts`, `vpsProxyWatchdogJob.ts`,
`freshnessSlaMonitorJob.ts`, `vpsHealthPoller.ts` only *mention* the view name in
comments explaining why they deliberately do NOT use it — Class-B probes query
`daily_foreign_flow` directly per TASK-2004, unaffected by this change):

1. `marketWideForeignFlowTool.ts` (`queryMarketWideForeignFlow`, `queryTopFlowTickers`) —
   selects only `date, code, foreign_buy_vol, foreign_sell_vol, foreign_net_vol`
   (`COALESCE(..., 0)`-wrapped) with `WHERE foreign_net_vol IS NOT NULL`. **No price
   columns selected.** `GROUP BY date` aggregate: previously-dropped FF-only tickers now
   correctly join the SUM and `ticker_count` — this is the intended fix, not a
   regression (it was undercounting before).
2. `foreignFlowTools.ts` (`getForeignFlowValues`, the `db` test-injection history path) —
   selects `foreign_buy_value/foreign_sell_value` / `foreign_net_vol` only. No price
   columns.
3. `foreignFlowAlertJob.ts` (`getForeignFlowHistoryFromDb`) — selects `code, date,
   foreign_net_vol` only. No price columns.
4. `franceSummaryJob.ts` — the `latestDateRow` lookup (`SELECT date ... WHERE
   foreign_net_vol IS NOT NULL ORDER BY date DESC LIMIT 1`) now correctly picks up a
   date where only FF data exists (previously silently blind to it); the movers query
   selects `code, foreign_buy_vol/sell_vol/net_vol` only. No price columns.
5. `assembleEveningSummary.ts` — selects `code, foreign_net_vol, foreign_buy_vol,
   foreign_sell_vol` only. **Caveat (pre-existing, orthogonal, not fixed by this
   change):** its `WHERE date = (SELECT MAX(date) FROM daily_ohlcv)` clause resolves the
   "latest date" from the raw `daily_ohlcv` table directly, not from the view — so if
   the single latest trading date has ONLY FF data and zero OHLCV bars yet, this
   particular site still won't surface it (the subquery itself needs to target
   `daily_ohlcv_with_flow`/`daily_foreign_flow` to fully close that gap). Not part of
   this fix's scope (the gate doesn't test this file) — flagging as a known residual
   for a follow-on ticket, do not silently fold in scope creep here.

**Net finding: none of the 5 Class-A consumers select price columns
(`open/high/low/close/volume`) from the view at all.** The theoretical "every reader
inherits NULL-price rows" risk the task description raised does not materialize for the
current known consumer set — they only ever touch `code/date/foreign_*` columns, which
are always real values (never NULL-by-omission) on the anti-join branch. Blast radius is
low.

## Regression requiring a companion test-assertion fix (found by full-suite audit)

`apps/mcp-server/src/__tests__/daily-foreign-flow-schema.test.ts` (TASK_2000,
lines 242-266), test **"view returns a row via LEFT JOIN when only daily_foreign_flow
has data and daily_ohlcv has none (R-1 view-level proof)"**, currently PASSES by
asserting the OLD/broken behavior as correct:

```ts
const rows = db.prepare(`SELECT * FROM daily_ohlcv_with_flow WHERE code=? AND date=?`)
  .all("ORPHAN-FF-VIEW-TEST", "2026-07-12");
expect(rows.length).toBe(0);   // <-- documents the bug this task fixes
```

Under Shape A this becomes 1 row (price cols NULL, foreign cols populated) — this
assertion **will flip to failing** unless updated in the SAME commit as the view change.
This is NOT the "skip/delete the gate" the PO rejected — it is a different, sibling test
file whose assertion and inline comment (`"the view is anchored on daily_ohlcv... The
view itself returns zero rows for this code/date — documenting the known anchoring
behavior"`) literally encodes the exact defect being fixed as expected behavior. Leaving
it untouched means CI just moves red from one file to another (net zero, or worse —
currently-green test goes red). dev-mcp-server must update this test's assertion (to
`toBe(1)` + assert `foreign_buy_vol` from the row, mirroring the new T-3 test in
`daily-foreign-flow-integration.test.ts`) and its stale comment, in the same commit as
the schema-market-data.ts view change.

**Everything else audited clean:** grepped every test file that does
`INSERT INTO daily_foreign_flow` for FF-only fixtures reachable through the view —
`FIX-HEALTH-MONITOR.test.ts`, `FIX-PDF-VOLUME-SBV-TABLE.test.ts`,
`FIX-VPS-HEALTH-FRESHN.test.ts`, `TASK-2004-daily-ff-class-b-probes.test.ts`,
`daily-foreign-flow-backfill.test.ts` all query `daily_foreign_flow` DIRECTLY (Class-B
pattern, TASK-2004), never through the view — unaffected. `MSG-1-market-foreign-flow.ts`
and friends only ever write to legacy `daily_ohlcv.foreign_*` columns (never the new
table) in their fixtures, so Shape A adds zero new rows for those tests — the anti-join
branch only fires for `daily_foreign_flow` rows with no `daily_ohlcv` counterpart, and
none of those legacy-column tests create that condition.

## Test strategy for dev-mcp-server

1. `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:162-174` — replace with
   the SQL above (DROP + unconditional CREATE, bidirectional UNION ALL).
2. `apps/mcp-server/src/__tests__/daily-foreign-flow-integration.test.ts` — do NOT edit
   (the 2 RED assertions are the gate; they should now pass raw as a side effect of #1).
   Optionally remove/soften the file-header "FINDING" prose block (lines ~32-66) that
   documents the now-fixed limitation, since it will read as stale once the view is
   corrected — cosmetic, not required for the gate.
3. `apps/mcp-server/src/__tests__/daily-foreign-flow-schema.test.ts` lines 242-266 —
   update the "R-1 view-level proof" assertion from `toBe(0)` to `toBe(1)` +
   assert the FF values surface, update the inline comment to reflect the corrected
   behavior. Required in the same commit — this is a genuine regression otherwise.
4. Run targeted first: `bun test apps/mcp-server/src/__tests__/daily-foreign-flow-integration.test.ts apps/mcp-server/src/__tests__/daily-foreign-flow-schema.test.ts apps/mcp-server/src/__tests__/MSG-1-market-foreign-flow.test.ts apps/mcp-server/src/__tests__/1134-get-foreign-flow-tool.test.ts apps/mcp-server/src/__tests__/1516-france-summary-foreign-flow.test.ts apps/mcp-server/src/__tests__/FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN.test.ts apps/mcp-server/src/__tests__/1133-foreign-flow-alert-job.test.ts apps/mcp-server/src/__tests__/TASK-2004-daily-ff-class-b-probes.test.ts`
   — every one of these touches either the view or a Class-A/B consumer.
5. Then full suite: `bun test` (CI parity) — must be 0 fail before push. CI-red freeze:
   PO holds all pushing until green; dev-mcp-server does not push, just gets to
   green-locally + hands to qa per normal pipeline.

## DDD / risk notes

- Change is entirely `infrastructure/db` (view definition) — zero domain-layer touch,
  no `domain/` → `infrastructure/` violation risk.
- No new interfaces/ports needed — extends the existing view, per
  `always_extend_not_duplicate`.
- No data migration, no backfill, no write-path change — purely a read-shape fix.
  `ohlcvForeignFlowStore.ts` (the writer) is untouched.

## RETURN
SHAPE=A — the frozen gate test queries the view directly, so only a view-level fix can
satisfy it; Shape B cannot, structurally, regardless of merit.
BRIEF=docs/architecture-briefs/2026-07-13-daily-ff-view-join-anchor.md
ZONE=apps/mcp-server/
NEXT=dev-mcp-server
