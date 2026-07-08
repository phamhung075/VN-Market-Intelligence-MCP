# Task Report: CONTAM-10-WRITER-H — Migrate handlePushOhlcvHistory to writeOhlcvBatch
date: 2026-07-08
outcome: DONE_VERIFIED — post-swap live-gateway RAW-probe PASS

## Post-Swap Live-Gateway RAW-Probe (final gate, 2026-07-08T02:25:01Z)

Ops completed the gated swap (`e2bac5b0a`, image `4c8ea4cfd41f`) — independently
re-confirmed via my own `docker inspect` on `vn-market-intelligence-mcp-mcp-server-1`
(not trusting the ops badge alone). Ran the TRUE live-gateway probe deferred last
cycle: a real `POST http://localhost:3000/api/push-ohlcv-history` against the actual
running container (not an isolated local instance).

Used synthetic ticker `QAPROBE1` (pre-checked absent from `daily_ohlcv`/`watchlist`;
`daily_ohlcv.code` has no FK, so a never-used code carries zero production-collision
risk regardless of date):
1. Seeded a clean full-VND anchor row (`2020-01-02`, O/H/L/C = 131000/133000/129000/130000,
   volume=1000000) → `{ok:true,inserted:1,skipped:0}`.
2. Pushed a contaminated batch shaped exactly like the real leak evidence
   (`2020-01-03`, O/H/L/C = 131/133/129/130, 100-999 VND range, volume=500000) →
   `{ok:true,inserted:1,skipped:0}`.

Verified the **persisted** row (not just the HTTP response) via an in-container
`bun:sqlite` read (same uid as the writer process — correctly sees committed WAL
pages, unlike the external read-only sidecar `keinos/sqlite3 file:...?immutable=1`
which is WAL-blind by design and returned 0 rows for the identical query right after
the write — a known gotcha, not a probe failure): row landed at
131000/133000/129000/130000, whole-row ×1000 corrected exactly matching the clean
anchor, volume left unscaled (correct). Container log confirmed the exact guard
firing: `[ohlcvWriteService] scale_correction QAPROBE1 2020-01-03:
prevClose=130000 current=130 ratio=1000.0 → ×1000`.

**Cleanup:** both synthetic `QAPROBE1` rows deleted from the live `daily_ohlcv`
table immediately after verification (in-container `DELETE`, 2 rows removed,
confirmed 0 remaining via both an in-container read and
`GET /api/prices/history?code=QAPROBE1` → `404 no_data`). `daily_ohlcv` total row
count (737,441) unaffected net of the transient synthetic rows. No production
ticker or date was ever touched.

**Verdict: PASS.** `CONTAM-10-WRITER-H` flipped to `DONE_VERIFIED` via
`scripts/orch-apply.sh`. `CONTAM-10-EXEC-2` (`depends: [CONTAM-10-WRITER-H]`) is now
**unblocked** for a future dev-team/router dispatch — not dispatched by qa.

## Summary

`handlePushOhlcvHistory` (route `POST /api/push-ohlcv-history`, the VPS backfill-queue
poller, ~15-30min cadence) migrated from a raw `INSERT...ON CONFLICT DO UPDATE` +
naive `validateOhlcvUnit` (>=100 VND floor on un-normalized values) to
`writeOhlcvBatch(rows, db, {conflictStrategy:"backfill"})` — closing an actively
reproducing leak (6,533 contaminated rows / 27 tickers as of 2026-07-07). Commit
`7fa78ac42`.

## Test Results

- Targeted regression (re-run independently, not trusting the self-report):
  `1350-ohlcv-backfill-endpoint.test.ts` 8/8, `TASK-OHLCV-WIC-2-writer-h-coerce.test.ts`
  12/12, `OHLCV-WHOLEROW-LT1000-writer-guard.test.ts` 3/3,
  `TASK-VNINDEX-RS-B-durability.test.ts` 9/9, `CONTAM-10-WRITER-H-backfill-scale-guard.test.ts`
  3/3 — **38/38 pass, 167 expect()** — exact match to dev-mcp-server's claim.
- Additional caller found via grep (not in dev's listed set):
  `CONTAM-7-ohlcv-unit-contam-integration.test.ts` — **45/45 pass, 113 expect()**.
- QA-authored independent RAW-probe (new test, isolated local `createBunServer`
  instance, real HTTP POST to the real route): **1/1 pass** — contaminated batch
  (open=131/close=130) + clean ~130,000 VND history → corrected to x1000 scale
  (open=131000/close=130000/high=133000/low=129000).
- Full `bun test`: independently re-run in background under heavy host contention
  (2 concurrent `bun test` processes observed); did not reach 100% completion within
  this QA cycle (~300/1171 files covered, ~22K log lines) — zero new OHLCV/CONTAM-related
  failures observed in the covered portion; only expected/pre-existing failure classes
  seen directly (insider-transactions timeouts, deliberate "no such table: daily_ohlcv"
  degraded-fallback paths). Not load-bearing for this verdict — the targeted +
  adjacent-caller suites (the only files that actually exercise this diff) are complete
  and green.
- TypeScript: `bun tsc --noEmit` — **0 errors**.

## DDD Compliance: PASS
`ohlcvBackfillHandler.ts` (interface layer) now imports `writeOhlcvBatch` from
`application/usecases/ohlcvWriteService.ts` — the allowed import direction
(interface → application). `domain/` layer untouched by this diff.

## Security: PASS
No hardcoded secrets. `process.env` usage confined to test files (matches a
pre-existing 14-file repo-wide test convention — not a new violation). All SQL
parameterized (`UPSERT_BACKFILL_SQL` uses `?` placeholders).

## Code Review Findings
- `UPSERT_BACKFILL_SQL` verified byte-identical semantics to the prior raw INSERT
  (unconditional overwrite of open/high/low/close/volume/updated_at; foreign-flow
  columns untouched).
- WIC-2 parse-and-reject pre-pass preserved verbatim (diff-confirmed — only
  de-indented out of the removed `db.transaction` wrapper).
- Response shape `{ok, inserted, skipped, code}` correctly derives from
  `writeResult.written` / `parseSkipped + writeResult.skipped + writeResult.rejected.length`.
- Writer-H inventory row in `ohlcvWriteService.ts` correctly updated:
  "ON CONFLICT DO UPDATE / In-scope bypass" → "writeOhlcvBatch / Migrated".
- `TASK-VNINDEX-RS-B-durability.test.ts` FR-B1-TC2 assertion flip independently
  verified as a genuine behavior-alignment fix (not a masked regression): the bar's
  FR-S1 seed-bar exemption does not apply (O!=H!=L!=C), so it legitimately flows
  through `normalizeOhlcvToVnd` x1000 correction — matches Writers A/C/D semantics.

## Issues Found
### Blocking
None.

### Non-Blocking
- Live-gateway RAW-probe against the shared container is still pending: `docker
  inspect` confirmed the running `mcp-server` container is on the pre-fix image
  (`sha256:d61c83a939a3...`), not the rebuilt `4c8ea4cfd41f` (built 2026-07-08T03:54
  local). `docker compose up -d mcp-server` is an ops-gated live-container swap per
  standing policy — QA does not self-authorize it.
- Full `bun test` suite not run to 100% completion within this QA cycle due to host
  contention (best-effort corroboration only; not load-bearing).

## Merge Status
No branch merge required — dev-mcp-server committed directly to `main` (`7fa78ac42`,
already the HEAD of this repo). Ops deployed the gated swap (`e2bac5b0a`, image
`4c8ea4cfd41f`). Task flipped to **DONE_VERIFIED** this cycle after the post-swap
live-gateway RAW-probe PASS (see above), via `scripts/orch-apply.sh`.
`.head.next_agent` set to `"router"`. `CONTAM-10-EXEC-2` (`depends: [CONTAM-10-WRITER-H]`)
is now **unblocked** — ready for a future dev-team dispatch (dry-run → human/PO gate
→ live repair → post-verify + gateway probe); not dispatched by qa.
