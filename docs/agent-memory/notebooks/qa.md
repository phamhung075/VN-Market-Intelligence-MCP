# QA — Notebook

## cycle-154 · 2026-05-30 · HC-QA — BCTC-HUMAN-CONFIRM — CHANGES_REQUESTED (1 blocking)

**Sprint:** BCTC-HUMAN-CONFIRM | **Task:** HC-QA | **Verdict:** CHANGES_REQUESTED

```
date: 2026-05-30T13:00Z
type: live end-to-end gate (8 gate items)
head_commit: bed05d9c
commits_in_scope: 4c40939c(foundation) 89100e07(guards+source_confidence) ae3c5039(HTTP handlers) dca93898(tools#145/#146) 7a3734ed(viewer) 204344ec(flow guard)
toolCount: 154 (confirmed HC-OPS-REBUILD)
test_db: bun:sqlite new Database(':memory:') DI — 52 HC tests + 53 HC-DEV-6 tests = 105 PASS / 0 FAIL
tsc: 0 errors
178-price-history: 7 fail (pre-existing baseline, unchanged)
DDD: PASS | security: PASS

TARGETS: FPT e8ea3df5 (confirm_status=PENDING, flag_count=0) | ACB fea19bae (confirm_status=PENDING, flag_count=0)
NOTE: Both live reports have flag_count=0 (clean OCR). QA gate uses seeded test report
      (UUID aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee, QA-GATE throwaway, cleaned up after gate).

GATE 1 FLAG ENUMERATION: PASS
  GET /flags/{uuid} → flag_count=2 (1 red, 1 yellow)
  red: ocr_value="1.234", image_value="1.500" (exact markdown match)
  yellow: ocr_value=null, image_value=null (PASS)
  Matches bctc_refined_units trust prefixes in markdown.

GATE 2 CORRECTION PERSIST + AUDIT: PASS
  POST /correct/{uuid} {row_id:21571, new_value:1500} → ok:true, source_confidence:1
  Direct DB read — bctc_human_corrections: id=1, old_value=1234, new_value=1500,
    ocr_value_snapshot="1.234", image_value_snapshot="1.500", anchor_status="ok"
  Direct DB read — bctc_table_rows id=21571: value_current=1500, source_confidence=1.0

GATE 3 CORE INVARIANT — CORRECTIONS SURVIVE CRON RE-RUN: FAIL (BLOCKING)
  finalize_bctc_refine on PENDING report with 2 corrections:
  - Selective DELETE preserves corrected rows (id=21571, 21572 survive — CORRECT)
  - INSERT from parser adds NEW rows (id=21573, 21574 — DUPLICATE)
  - Result: 4 rows for 2 labels. Same label appears twice.
  - reAnchorCorrections sees 2 rows with identical stable key → anchor_ambiguous (WRONG)
  - Corrected VALUES survive (1500 and 600 — PASS on value), but:
  - DUPLICATE ROWS = table doubled; anchor_ambiguous = correction no longer tracked correctly
  ROOT CAUSE: Layer 2 selective DELETE preserves old rows AND finalize INSERTs new rows
              from the same parsed markdown → duplicates. Architecture says old corrected row
              must be REPLACED by the new parser row (with correction applied), not ADDED.
  FIX NEEDED: After INSERT, DELETE the old pinned row (the one whose ID is in bctc_human_corrections)
              if a new row with the same stable key was successfully inserted.
              OR: use INSERT OR REPLACE with stable key constraint.
  DV-HC-8 test is a FALSE-GREEN: uses find() on rows, not COUNT check — passes with duplicates.

GATE 4 RE-ANCHOR NEVER MIS-ATTACHES: PASS (safe-fail behavior PROVEN)
  anchor_ambiguous is set when >1 rows match stable key — CORRECT behavior.
  No correction mis-applied. Safe-fail proven.
  NOTE: Gate 4 anchor_ambiguous was triggered by Gate 3 duplicate-row bug, not genuine
        duplicate labels in the report. Genuine duplicate-label test (DV-HC-11/12) passes.

GATE 5 FINAL-CONFIRM LOCK: PASS (all 3 layers)
  Layer 1: POST /confirm → confirm_status=CONFIRMED; direct DB: confirmed_at set
  Layer 1: CONFIRMED report excluded from get_bctc_pending_refine (found=NO, 11 others present)
  Layer 2: finalize on CONFIRMED → {ok:true,skipped:true,reason:"confirmed"}; row_count unchanged=4
  Layer 3: HC-AF-1 Step 3b guard present in refine_bctc_md/flow/main.md (grep verified)
  POST correct on CONFIRMED → 409 {error:"report_confirmed"} PASS
  POST /reset → confirm_status=PENDING, final_confirmed_at=null, corrections=2 (intact) PASS

GATE 6 ESC-5 CLEARS: PASS
  All corrected rows (old 21571/21572 + new 21573/21574) have source_confidence=1.0
  ESC-5 (threshold <0.50) would not fire on corrected rows.

GATE 7 ADDITIVE / NO REGRESSION: PASS (conditional)
  HC tests: 105/105 PASS (52 HC-human-confirm + 53 HC-DEV-6-inspector-panel)
  AR baseline: 82/82 PASS (no regression in prior sprint)
  Pre-existing: 178-price-history 7 fail (same as pre-HC baseline — no new failures)
  HCM tests: 29/29 PASS
  Full bun test OOM/crash (host memory — not a regression, pre-existing fleet limitation)
  tsc 0 errors

GATE 8 VIEWER: PASS
  bctc-inspector.html has "Sửa tay / Xác nhận cuối" tab (grep: 6 occurrences)
  loadFlags/renderFlaggedCells/hcBtnConf/hcConfirmStatus functions present
  All endpoints referenced: /flags, /correct, /confirm, /confirm/.../reset
  Vietnamese labels: "Giá trị OCR", "Giá trị ảnh", "ĐÃ XÁC NHẬN", "Chờ xác nhận" present
  File: apps/mcp-server/src/interface/bctc-inspector.html

VERDICT: CHANGES_REQUESTED (1 blocking issue)
BLOCKING: Gate 3 — Layer 2 duplicate-row bug in finalizeBctcRefineTool.ts
  After selective DELETE + INSERT, corrected row IDs are kept AND new parser rows added
  → duplicates + anchor_ambiguous on re-anchor. DV-HC-8 is a false-green (uses find(), not COUNT).
  Exact file:line: finalizeBctcRefineTool.ts — the selective DELETE block + DV-HC-8 test assertion
NEXT: dev-mcp-server | fix Layer 2 duplicate-row: after INSERT, DELETE old pinned rows whose
      stable key now has a newly-inserted counterpart. Add COUNT assertion to DV-HC-8.
ROUTE: fixer round=1 (round < 2)
```

---

## cycle-153 · 2026-05-30 · AR-QA bake-off — APPROVED (GATE GREEN)

**Sprint:** BCTC-AGENTIC-REFINE | **Task:** AR-QA (bake-off phase) | **Verdict:** APPROVED (all 7 gate items GREEN)
Head: 3b4c62a2. FPT 24 rows / ACB 114 rows. tsc 0 errors. 100 pass/0 fail.

## cycle-152 · 2026-05-30 · AR-QA — CHANGES_REQUESTED → AR-OPS fix applied. See cycle-153.

---

## Archive (cycles ≤153)

Historical QA cycle logs (cycle-153 and earlier) archived here for reference.
Full session history available via git log `docs/agent-memory/notebooks/qa.md`.

---

**Binding:** Active cycle only (≤200L). Historical detail pruned 2026-05-30.
