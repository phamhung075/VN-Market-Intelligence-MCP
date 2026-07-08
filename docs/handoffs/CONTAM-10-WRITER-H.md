---
sprint: OHLCV-UNIT-CONTAM-WHOLEROW-LT1000
task_id: CONTAM-10-WRITER-H
branch: task/CONTAM-10-WRITER-H
size: M
zone: apps/mcp-server/src/interface/mcp/routes/
depends_on: []
blocks: [CONTAM-10-EXEC-2]
---

## TLDR

Migrate `handlePushOhlcvHistory` (route `POST /api/push-ohlcv-history`) from raw INSERT...ON CONFLICT DO UPDATE to use `writeOhlcvBatch(rows, db, {conflictStrategy:"backfill"})`. This closes an actively-reproducing leak: the VPS backfill queue poller (~15–30 min cadence) bypasses the CONTAM-10-WRITER cross-day scale guard and re-contaminates daily_ohlcv with whole-row thousand-scale bars (6,533 rows/27 tickers as of 2026-07-07).

## [PM] Planning Context

- **Zone:** `apps/mcp-server/src/interface/mcp/routes/` — interface layer
- **Acceptance Criteria:**
  - [ ] `handlePushOhlcvHistory` in `ohlcvBackfillHandler.ts` swaps raw INSERT clause for `writeOhlcvBatch()` call with `conflictStrategy:"backfill"`
  - [ ] Existing parse-and-reject pre-pass (TASK-OHLCV-WIC-2 numeric check) preserved — builds `OhlcvWriteRow[]` input for `writeOhlcvBatch`
  - [ ] Response shape (`ok, inserted, skipped, code`) derived from `writeResult.written` / `writeResult.skipped + writeResult.rejected.length`
  - [ ] Regression tests PASS: `1350-ohlcv-backfill-endpoint.test.ts` + `TASK-OHLCV-WIC-2-writer-h-coerce.test.ts` (high/low coerce gate unmodified, still GREEN)
  - [ ] New test file `CONTAM-10-WRITER-H-*.test.ts` added with 3 scenarios:
    - TC-WH-1: contaminated batch + existing cleanRef history → ×1000 corrected via `fetchCleanReferenceCloseMap`
    - TC-WH-2: brand-new ticker (no prior daily_ohlcv history) → written as-is (documents accepted gap)
    - TC-WH-3: legitimately cheap stock (all-history close < 1000) → unchanged
  - [ ] `tsc --noEmit` clean (0 errors)
  - [ ] Full bun test suite passes (exit code 0); targeted CONTAM-10 tests alone pass
  - [ ] Type-coercion pre-pass stays intact (RULE-5 intra-row plausibility already covered by TASK-OHLCV-WIC-2, and `writeOhlcvBatch` calls `validateOhlcvUnit` on coerced values)
  - [ ] Rebuild `mcp-server` image; verify container healthy and peer containers untouched

- **Files to read first:**
  - `apps/mcp-server/src/interface/mcp/routes/ohlcvBackfillHandler.ts` (current implementation, lines ~120–180 for `handlePushOhlcvHistory`)
  - `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` (writeOhlcvBatch signature + conflictStrategy pattern, lines ~1–417)
  - `docs/handoffs/FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM.md` §10 Round-2 (architect evidence + design decisions)
  - `docs/architecture-briefs/2026-06-30-OHLCV-UNIT-CONTAM-WHOLEROW-LT1000.md` (full design rationale)

- **Files to modify:**
  - `apps/mcp-server/src/interface/mcp/routes/ohlcvBackfillHandler.ts::handlePushOhlcvHistory` — replace raw INSERT + `validateOhlcvUnit` with `writeOhlcvBatch(rows, db, {conflictStrategy:"backfill"})`

- **Files to create:**
  - `apps/mcp-server/src/__tests__/CONTAM-10-WRITER-H-backfill-scale-guard.test.ts` (regression: 3 scenarios above)

- **Dependencies:** None (independent fix; CONTAM-10-EXEC-2 blocks_on this task)

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` — atomic task discipline
  - `docs/standards/gateway-call-contract.md` — MCP tool call patterns (if needed for test harness)
  - CONTAM-10-WRITER design rationale (CONTAM-10-WRITER shipped 2026-06-30, code present in live container; this task fixes the `handlePushOhlcvHistory` writer that was never migrated)

## Implementation Notes

**Design decision (from architect Round 2):** The fix is a "drop-in swap" — `writeOhlcvBatch`'s `UPSERT_BACKFILL_SQL` conflict clause is already semantically identical to the current raw INSERT on CONFLICT (unconditional overwrite of open/high/low/close/volume/updated_at; foreign-flow columns untouched). No rewrite, no new SQL patterns needed.

**Overlap guard (from architect):** This task does NOT overlap with `FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0` (REVIEW, stalled). That P0 is about high/low type-coercion (pure Rule-5 intra-row); this task is about whole-row cross-day scale detection (new class). Both tasks may touch `handlePushOhlcvHistory`, but they fix disjoint defects:
- P0 (type coercion): preserves existing high/low coerce pre-pass, no change there
- This task (scale guard): adds `writeOhlcvBatch` routing so cross-day guard runs after coercion

**Accepted gaps (documented for visibility, out of scope):**
1. **Brand-new ticker cold-start:** A freshly-added watchlist ticker backfilled for the first time with zero prior `daily_ohlcv` history and real price ≥100,000 VND has no `prevClose`/`cleanRef` reference at all — `writeOhlcvBatch` cannot detect the scale error on that first write (symmetric to "legitimately cheap stock" case). Not exploitable for VHM/VIC/FPT (deep history exists); only matters for a freshly-added watchlist ticker's first backfill. TC-WH-2 documents this.
2. **Writer E (startup probe):** `ohlcvBackfill.ts` called once per container boot also has the same structural gap (calls `normalizeOhlcvToVnd` only). Fires once per boot vs this task's ~15–30 min cadence. Not the active/reproducing vector; separate backlog item recommended.
3. **VPS-script gap (client-side defense-in-depth):** `vps-scripts/fetch-ohlcv-backfill.sh` line 245 `normalizeThousandVnd` jq filter uses same STOCK_MIN_VND=100 threshold. Server-side SSOT gate (this task) is authoritative; VPS script gap is defense-in-depth only, separate backlog item.

---

## Success Criteria

- [ ] Commit message references this task (`CONTAM-10-WRITER-H`)
- [ ] No regression in existing OHLCV endpoint tests
- [ ] Acceptance criteria above all checked
- [ ] QA approve with live gateway probe (POST /api/push-ohlcv-history with contaminated batch + clean history) showing corrected scale
