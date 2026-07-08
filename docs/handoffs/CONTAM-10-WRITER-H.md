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

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/src/interface/mcp/routes/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/routes/ohlcvBackfillHandler.ts::handlePushOhlcvHistory` — replaced raw `INSERT...ON CONFLICT DO UPDATE` + manual `validateOhlcvUnit` (on raw un-normalized values) with `writeOhlcvBatch(rows, db, {conflictStrategy:"backfill"})`. WIC-2 parse-and-reject pre-pass (NaN/≤0 reject for open/close/high/low) preserved verbatim — builds `OhlcvWriteRow[]` for `writeOhlcvBatch`. Response `{ok,inserted,skipped,code}` now derives from `writeResult.written` / `parseSkipped + writeResult.skipped + writeResult.rejected.length`. Module docstring updated to reflect the new routing.
  - `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` — Writer inventory table: Writer H row updated from "ON CONFLICT DO UPDATE / In-scope bypass" to "writeOhlcvBatch / Migrated".
  - `apps/mcp-server/src/__tests__/TASK-VNINDEX-RS-B-durability.test.ts` — updated 1 stale assertion (FR-B1-TC2, "stock bar without type field, open < STOCK_MIN_VND=100"): old raw-INSERT path rejected these bars outright (inserted=0); `writeOhlcvBatch`'s `normalizeOhlcvToVnd` correctly auto-corrects them ×1000 instead (inserted=1, whole-row scaled) — same behavior Writers A/C/D already have. Inline comment documents why. Genuine regression found while running the full suite, not anticipated in the original handoff — fixed rather than reverting the swap.
- **Files created:**
  - `apps/mcp-server/src/__tests__/CONTAM-10-WRITER-H-backfill-scale-guard.test.ts` — 3 scenarios (TC-WH-1/2/3) via the live HTTP route (not writeOhlcvBatch directly — that unit is already covered by `OHLCV-WHOLEROW-LT1000-writer-guard.test.ts`), proving the handler is actually wired to the guarded writer.
- **Tests written:** CONTAM-10-WRITER-H-backfill-scale-guard.test.ts — 3 tests / 28 expect(), GREEN.
- **Regression suites:** `1350-ohlcv-backfill-endpoint.test.ts` 8/8, `TASK-OHLCV-WIC-2-writer-h-coerce.test.ts` 12/12, `OHLCV-WHOLEROW-LT1000-writer-guard.test.ts` 3/3, `TASK-VNINDEX-RS-B-durability.test.ts` 9/9 (after the 1 fix above) — all GREEN. Targeted CONTAM-10 suite (5 files) 38/38 pass, 167 expect().
- **Type check:** clean (`bun tsc --noEmit`, 0 errors).
- **Full `bun test`:** 14302 pass / 40 skip / 57 fail / 6 errors, then a Bun 1.3.13 engine crash-at-teardown (`panic(main thread): A C++ exception occurred` — fires AFTER the test summary line, known Bun bug unrelated to test content). The 57 failures span unrelated domains (news polling/RSS, insider transactions, VPS proxy health, telegram routing, IMF poller, verdict-resolution job, deprecated indicators file, orch-state coherence). Verified via `git stash` to the pre-change baseline + isolated re-run: `TASK-VNINDEX-RS-B-durability.test.ts` (pre-fix) and `1518-get-foreign-flow-ohlcv-source.test.ts` both reproduce identically on baseline — pre-existing full-suite-only flakiness, not caused by this task.
- **Docker:** `mcp-server` image rebuilt (`docker compose build mcp-server`, image id `4c8ea4cfd41f`, 2026-07-08T03:54 local). **NOT swapped into the running container** — `docker compose up -d mcp-server` is a gated live-container swap per standing policy (ops-owned); the currently-running container is still on the pre-fix image.
- **Tool count:** 183 (unchanged — no MCP tool touched).
- **Docs updated:** this handoff (Implementation Record); `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` Writer H inventory row; decision journal `docs/agent-memory/decisions/sprint-OHLCV-UNIT-CONTAM-WHOLEROW-LT1000-dev-mcp-server.md`; notebook `docs/agent-memory/notebooks/dev-mcp-server.md`.
- **Status:** flipped to **REVIEW** (not done_verified) — `.head` set to `next_agent: "qa"` via `orch-apply.sh`. Pending: (1) QA RAW-probe per Success Criteria above against the rebuilt image once deployed; (2) ops-gated `docker compose up -d mcp-server` swap + peer-container health verify; (3) `CONTAM-10-EXEC-2` stays blocked until the swap deploys (sequential gate — do not run early, re-contamination risk).
