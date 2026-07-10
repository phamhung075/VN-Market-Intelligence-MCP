# TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD

**Sprint:** FIX-BCTC-BANK-SUMMARY-MAPPING (W5 replacement, dual-task reconciliation per AC-14)
**Task ID:** TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD
**Specialist:** dev-mcp-server
**Type:** FIX-MIGRATION
**Size:** S (~2h)
**Priority:** P1
**Zone:** apps/mcp-server/
**Status:** READY

---

## Context

This task is the concrete replacement for the blocked W5 of FIX-BCTC-BANK-SUMMARY-MAPPING, addressing AC-5 (CTG `total_assets` plausibility) via a deterministic non-agentic path instead of re-attempting the stalled agentic-refine pipeline.

**Twin task closure:** FIX-BCTC-BANK-SCALAR-MAPPING (minted 2026-06-16 later same day, near-duplicate) is closed as a duplicate pointer per PM decision (AC-14, docs/architecture-briefs/2026-07-10-FIX-BCTC-BANK-SCALAR-MAPPING.md §3). Both tasks describe the same CTG defect; this work unit is the single forward execution thread.

**Design reference:** docs/architecture-briefs/2026-07-10-FIX-BCTC-BANK-SCALAR-MAPPING.md §2.5 (Track 1: CTG-specific orphaned-row carry-forward). Architect brief is the operative spec; this handoff extracts the atomic executable unit.

---

## Acceptance Criteria

**AC-TRACK1-1 [Code/Config]:** Extend `backfill_bctc_scalars` tool with an optional `source_report_id` parameter OR create a one-off migration script (pm/dev judgment call — both are ~1h equivalent):
- If `source_report_id` param: optional field accepting an orphaned `report_id`, used only if caller explicitly passes it; default behavior (copy `bctc_table_rows` by current session's report_id) unchanged
- If migration script: scoped, idempotent, documented as `/scripts/migrate-bctc-orphaned-rows.sh --source=96e36139-... --target=e497f7d1-... --verify`
- RAW-verify parameter contract matches the architect brief intent (copy 451 CTG 2026-Q1 rows from old id to new id)

**AC-TRACK1-2 [Live execution — named-volume market.db]:** Run the migration live against the NAMED-VOLUME `vn-market-intelligence-mcp_market_data`, not the host decoy:
- Verify pre-state: `bctc_table_rows WHERE report_id='e497f7d1-8717-49cc-bfa9-88804464d143'` returns 0 rows (current CTG orphaned state)
- Verify source exists: `bctc_table_rows WHERE report_id='96e36139-5dac-414d-8e4d-20a4725890d1'` returns 451 rows (old CTG 2026-Q1)
- Execute migration (tool call or script)
- Verify post-state: `bctc_table_rows WHERE report_id='e497f7d1-8717-49cc-bfa9-88804464d143'` returns 451 rows (carry-forward complete)

**AC-TRACK1-3 [Functional]:** After migration, verify `get_bctc_full(CTG)` downstream scalars are populated:
- `total_assets` > 0 (no longer 0)
- `net_revenue` plausible for CTG (no longer garbage ~3910)
- `net_margin_pct` within plausible bank band (not 229157%)
- W2's row-repair fixes (AC-3, AC-4 from original spec) are applied to the carried-forward rows (they inherit the corrected values from the 451 source rows if those rows were re-refined; if source rows are still corrupted, this carry-forward uncovers that W2's fixes never reflow'd — escalate if found)

**AC-TRACK1-4 [Regression]:** VCB and non-bank tickers (FPT, VNM) remain unaffected:
- VCB's current report (`bac3e1c1-...`) still returns its fresh parsed values (not carry-forward affected)
- FPT 2026-Q1 and VNM 2025-Q4 still pass validation (non-regression from original brief fixture set)

**AC-TRACK1-5 [Safety gate]:** AC-16 verification — confirm CTG and VCB report_ids are still current at dev time:
- Re-check `financial_reports` for CTG 2026-Q1: current report_id should still be `e497f7d1-8717-49cc-bfa9-88804464d143` (verify, don't hardcode; if churned, note it and re-verify architect intent applies to the new id)
- Re-check VCB 2026-Q1: current report_id should still be `bac3e1c1-0adf-4c03-9f06-d701ec753055`
- If ids have changed, escalate with new ids for qa-gate re-verification before shipping

**AC-TRACK1-6 [Commit discipline]:** Commit must reference:
- Original twin sprint: FIX-BCTC-BANK-SUMMARY-MAPPING (W5 replacement)
- Dedup note: "Closed FIX-BCTC-BANK-SCALAR-MAPPING as duplicate per AC-14; single execution thread"
- Architect brief: docs/architecture-briefs/2026-07-10-FIX-BCTC-BANK-SCALAR-MAPPING.md (Track 1 design)
- Do NOT commit session UUIDs or process logs

---

## Files in Scope

**Primary:**
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/backfillBctcScalarsTool.ts` (if param approach) OR
- `scripts/migrate-bctc-orphaned-rows.sh` (if script approach — new file)

**Read-only (context):**
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts` (identity-serve-guard, ensure it's not bypassed by this carry-forward)
- `docs/architecture-briefs/2026-07-10-FIX-BCTC-BANK-SCALAR-MAPPING.md` (operative spec)

---

## Dependencies

**MUST sequence after:**
- Twin sprint W2 deploy verification (row-repair fixes must land on the carried-forward rows; W2 is already shipped/done_verified 2026-07-03, VERIFIED ✓)

**Parallel-safe with:**
- Track 2 (general 62-report unblock) is separate backlog scope, does not overlap

---

## Notes

- RISK-2 (MEDIUM): If the gateway-blind defect resolves before this ships, the original agentic-refine W5 may become viable again — re-check `mcp__gateway__call_tool` reachability live before committing dev effort. If recovered, this track becomes unnecessary.
- No rebuild required (data-only operation against live DB).
- RISK-3 (LOW): Unidentified orphaned report_ids (4316f6d1, 65a9c724, d6f1885f) may represent additional carry-forward candidates — out of scope this cycle per architect brief, but worth a grep if Track 2 is ever scoped.

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** `apps/mcp-server/` (migration script lives at `scripts/migrations/` per repo-root Script Persistence convention — same precedent as `reingest-bctc-report.ts`/`repair-ohlcv-seed-candle-*.ts`; zero files touched under `apps/mcp-server/src/`)
- **RISK-2 pre-work check (mandatory, done before dev effort):** re-verified gateway reachability via the most recent on-disk signal, `docs/signals/processed/cowork-team-20260710T000000Z.json` (2026-07-10T00:01:49Z — newer than the architect brief's 2026-07-09T21:01:48Z citation): `"gateway_blind_status": "still live — native mcp__gateway__call_tool tool absent from available tool set this tick"`. **Gateway is still blocked** — Track 1 (this deterministic-migration path) remains the correct approach. No newer signal existed at execution time. Not silently switching approaches.
- **AC-TRACK1-1 (Code/Config):** Chose the migration-script option (not a `backfill_bctc_scalars` tool-param extension) — that tool is already deregistered from the MCP surface (TOOL-SURFACE-UPGRADE U3, handler retained for direct invocation only), so a standalone script matches existing precedent and keeps the deregistered interface file untouched. New file: `scripts/migrations/carry-forward-bctc-orphaned-rows.ts` (`--source`/`--target`/`--apply`, dry-run default, idempotent, exit codes 0-4 documented in file header). It performs the exact two-step design from architect brief §2.5: (1) `INSERT...SELECT` copies `bctc_table_rows` from the orphaned `report_id` onto the current one (remapping only `report_id`, source rows untouched), then (2) reuses the LIVE `buildBackfillBctcScalarsHandler` (zero duplicated aggregation logic) to reflow scalar columns from the newly-present rows.
- **AC-TRACK1-2 (Live execution, named-volume DB):** RAW-verified pre-state via `docker exec` against `vn-market-intelligence-mcp-mcp-server-1`: target (`e497f7d1-...`) had 0 `bctc_table_rows`, source (`96e36139-...`) had 451. Ran `--apply` live. Post-state RAW-verified: target now has 451 rows (byte-identical content spot-checked, e.g. `code='270'` row `value_current=1... ` preserved). Source untouched (still 451, copy not move). **PASS.**
- **AC-TRACK1-3 (Functional — scalars plausible):** **NOT achieved by Track 1 alone — escalating, not silently claiming pass.** The 451 carried-forward rows are 208 `income_statement` + 173 `cash_flow` + 70 `notes` — **zero** rows tagged `balance_sheet`/`general`. `backfill_bctc_scalars`'s BEQ-6 section-completeness gate correctly refused to promote to DONE (set `refine_status='PARTIAL'` instead, scalar columns left unchanged — `total_assets` still 0, `net_revenue` still 3910, `net_margin_pct` still ~229157%). This is the AC's own anticipated escalation clause firing ("if source rows are still corrupted, this carry-forward uncovers that W2's fixes never reflow'd — escalate if found") — except the finding is one level deeper than value-corruption: the balance-sheet **page window was never captured/tagged** in the agentic-refine pass that produced this orphan, so W2's row-repair had nothing to act on for this dataset. Requires a fresh agentic-refine pass targeting CTG's balance-sheet window once the gateway-blind defect resolves — not fabricable by this script (no-fake-data policy).
- **AC-TRACK1-4 (Regression — VCB/FPT/VNM):** By code inspection, the migration script's writes are scoped exclusively to `report_id IN (source, target)` — VCB/FPT/VNM were never referenced. RAW-verified live post-migration: VCB (`bac3e1c1-...`) unchanged — `total_assets=2550963342, net_revenue=17420998, net_margin_pct=54.31%`, 0 `bctc_table_rows` (unaffected, as expected — VCB has no orphan match per architect brief §2.4). FPT 2026-Q1 (`e8ea3df5-...`) `refine_status=DONE`, unchanged. VNM 2025-Q4 (`bd205cf3-...`) `refine_status=PENDING`, unchanged. **PASS — no regression.**
- **AC-TRACK1-5 (Safety gate — AC-16 freshness):** Re-checked live: CTG current report_id = `e497f7d1-8717-49cc-bfa9-88804464d143` (matches architect brief, unchanged). VCB current report_id = `bac3e1c1-0adf-4c03-9f06-d701ec753055` (matches, unchanged). No churn since the brief. **PASS.**
- **AC-TRACK1-6 (Commit discipline):** Commit references FIX-BCTC-BANK-SUMMARY-MAPPING (W5 replacement), the AC-14 dedup note, and the architect brief path. No session UUIDs in the commit body.
- **Files modified:**
  - `scripts/migrations/carry-forward-bctc-orphaned-rows.ts` (new, ~330L) — migration script (`readMigrationSnapshot`/`decideMigration`/`copyOrphanedRows` exported pure functions + CLI entry)
  - `scripts/migrations/__tests__/carry-forward-bctc-orphaned-rows.test.ts` (new, 8 tests) — TDD unit coverage, `:memory:` SQLite, zero live-DB dependency
  - `docs/agents/dev-mcp-server/flow/main.md` — new CANONICAL Script Persistence entry (usage + live-result finding)
  - `docs/handoffs/TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD.md` — this Implementation Record
- **Tests written:** `scripts/migrations/__tests__/carry-forward-bctc-orphaned-rows.test.ts` — 8 tests, 24 `expect()` calls, GREEN (decision-logic refusals ×4, idempotency, copy-fidelity, AC-TRACK1-3 scalar-reflow integration via the real `buildBackfillBctcScalarsHandler`)
- **Type check:** clean (`bun tsc --noEmit`, zero errors)
- **bun test (scoped, financial-reports domain — BEQ-2/BEQ-SECTION-GUARD/FU-BACKFILL-DE-SYNC/LF-SERVE-REFLOW/TSU-DEV-U3):** 39 pass / 0 fail, 162 expect() calls — zero regression (this task did not modify `backfillBctcScalarsTool.ts` or any `apps/mcp-server/src/` file)
- **bun test (full suite, `cd apps/mcp-server && bun test`):** 14426 pass / 40 skip / 59 fail / 5 errors / 45348 expect() calls, 1185 files, 625.98s, then the known Bun 1.3.13 post-summary teardown crash (non-authoritative, same documented signature as this sprint's S22/S23 baseline runs). The 59 fail + 5 errors are pre-existing/unrelated to this task — this task touched **zero** files under `apps/mcp-server/src/`, so the full-suite result is provably identical with or without this change (zero diff overlap with anything the suite imports/executes). Spot-checked top failure: `src/_deprecated/1302-technical-indicators.test.ts` MACD/trend-label assertion — date-dependent live-market fixture in a `_deprecated/` file, unrelated to BCTC/financial-reports.
- **Tool count:** 183 — matches pre-task baseline (script is standalone, zero MCP tool registration, zero import from `apps/mcp-server/src/`)
- **Scheduler count:** unchanged — zero scheduler files touched
- **Gate 2 probes:** `bun tsc --noEmit` clean · live container health `GET /health` → `{"status":"ok","toolCount":183}` · `GET /api/bctc-inspect` → 200 · `GET /dashboards/news-fetch/` → 200 (no rebuild needed — server code untouched)
- **Docs updated:** `docs/agents/dev-mcp-server/flow/main.md` § Script Persistence (new CANONICAL entry, usage + live-result finding)
- **Graphify:** skipped — no architecture/knowledge doc structurally changed (operational script + handoff record only)
- **Simplicity gate:** certified — single guarded copy operation + reuse of the existing production aggregator (zero duplicated aggregation logic); no new abstraction layer; dynamic dual-path module resolution is the minimum needed to support both repo-root and docker-cp execution contexts (documented inline, matches the constraint that this must run against the named-volume DB inside the container).

---

## [QA] Review Record

- **Verdict: APPROVE (technical substance) — HELD at REVIEW (DJ-GATE-1, non-code gap)**
- **AC-TRACK1-1/2/4/5/6 — independently RAW-verified, PASS confirmed (not trusted from self-report):**
  - Read `scripts/migrations/carry-forward-bctc-orphaned-rows.ts` in full — decision gate / copy / reflow logic sound, `Bun.env` (not `process.env`) for `DB_PATH`, no domain/infra import violations, idempotent by construction (`decideMigration` refuses on row-count mismatch, no-ops on already-migrated).
  - `docker exec` (readonly SQLite handle) against the live named-volume DB: target `e497f7d1-...` and source `96e36139-...` both show **451 rows / identical section breakdown** (208 income_statement + 173 cash_flow + 70 notes, **zero balance_sheet**) — exact match to the dev's claim. CTG `financial_reports` row: `total_assets=0`, `net_revenue=3910`, `net_margin_pct≈229157%`, `refine_status=PARTIAL` — confirms AC-TRACK1-3 did NOT resolve, exactly as escalated (not silently swept).
  - VCB (`bac3e1c1-...`): `total_assets=2550963342`, `net_revenue=17420998`, `net_margin_pct≈54.31%`, 0 `bctc_table_rows` — unaffected, matches claim. FPT 2026-Q1 (`e8ea3df5-...`) `refine_status=DONE` matches. VNM rows present/unchanged, no overlap with migration's `report_id IN (source, target)` scope.
  - AC-TRACK1-5: live-reconfirmed CTG=`e497f7d1-...`, VCB=`bac3e1c1-...`, unchanged since the brief.
  - `bun test scripts/migrations/__tests__/carry-forward-bctc-orphaned-rows.test.ts` → 8 pass / 0 fail (matches claim); `bun tsc --noEmit` clean; `mock-guard.sh` → PASS, no fabricated-data patterns. The in-memory integration test proves the reflow codepath is correct when balance-sheet rows ARE present — corroborates the live PARTIAL result is a genuine data-completeness gap, not a script defect.
- **AC-TRACK1-3 escalation — independently corroborated as LEGITIMATE, not deflectable within this ticket's stated scope:** queried every orphaned `bctc_table_rows.report_id` with no matching `financial_reports` row (5 total, incl. the 4 RISK-3 "unidentified" ones). Two (`65a9c724-...`, `31f2a9a9-...`) are VCB — confirmed by reading their `bctc_refined_units.markdown` header text ("Ngân hàng Thương mại Cổ phần Ngoại thương Việt Nam"), matching the architect brief's own VCB attribution. The remaining two (`4316f6d1-...` 94 rows, `d6f1885f-...` 72 rows) DO contain `balance_sheet` rows, but their layout uses a "Tài sản ngắn hạn" (short-term/current-assets) split — the standard **non-bank** corporate balance-sheet format, structurally incompatible with CTG's bank-format balance sheet (no current/non-current split in VN bank BCTC) — these are a different, unidentified ticker, not CTG. **No cheap in-repo rescue exists for CTG's balance-sheet gap; the escalation is real, root-caused correctly, and correctly left unfabricated** (no-fake-data policy).
- **Blocking finding (process gate, not code):** DJ-GATE-1 — grepped every `docs/agent-memory/decisions/sprint-FIX-BCTC-BANK-SUMMARY-MAPPING-*.md` and `sprint-FIX-BCTC-BANK-SCALAR-MAPPING-*.md` file for `task-id:** TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD` — **zero matches**. dev-mcp-server's own flow (`docs/agents/dev-mcp-server/flow/main.md:164`) requires this entry *before* the IN_PROGRESS→REVIEW flip; it was not written for this task-id (the stale `sprint-FIX-BCTC-BANK-SUMMARY-MAPPING-dev-mcp-server.md` file's most recent entry is stamped with a different, earlier task-id). Per QA flow's own DJ-GATE-1 clause, **status held at REVIEW** (not flipped to done_verified) — `status_note: "journal-missing"` written to the board row, `next_agent` routed to `dev-mcp-server`. This is a single missing paperwork entry, not a code defect — once written, no fresh full QA pass is required to close this task.
- **Recommendation to pm (not built here — task breakdown is pm's job):** mint a follow-on backlog task for CTG's balance-sheet agentic-refine (targets the page window never captured in the original refine pass), `blocked_on` the gateway-blind defect (architect brief §1) resolving.
- **Board mutation applied:** `docs/data/orch/orch-state.json` `.task_board.review[TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD]` — added `qa_verify_at`/`qa_verify_by`/`qa_verdict:"APPROVE_HELD_DJGATE1"`/`qa_note`/`status_note:"journal-missing"`, `next_agent: "dev-mcp-server"`; `.head` synced same atomic write (dry-run rehearsed on scratch copy first, 123→123 coherence warnings unchanged, `orch-validate.mjs` Stage 0+1 PASS both times).
- **DJ:** `docs/agent-memory/decisions/sprint-FIX-BCTC-BANK-SUMMARY-MAPPING-qa.md` §qa-S2.
