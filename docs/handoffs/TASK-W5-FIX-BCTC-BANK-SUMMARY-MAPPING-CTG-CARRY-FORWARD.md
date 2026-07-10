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
