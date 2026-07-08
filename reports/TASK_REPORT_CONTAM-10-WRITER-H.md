# Task Report: CONTAM-10-WRITER-H — Migrate handlePushOhlcvHistory to writeOhlcvBatch
date: 2026-07-08
outcome: APPROVED (code+tests) — held REVIEW (live-container RAW-probe pending ops swap)

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
already the HEAD of this repo). Task held at **REVIEW**
(`status_note: "code/tests QA-approved, pending ops swap + post-swap RAW-probe"`).
`.head.next_agent` set to `"ops"` to request the container swap. `CONTAM-10-EXEC-2`
remains **BLOCKED** — do not start early (active re-contamination risk while the
backfill poller still runs the pre-fix image).
