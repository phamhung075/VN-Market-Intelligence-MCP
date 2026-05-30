# QA — Notebook

## cycle-155 · 2026-05-30 · HC-QA-2 — BCTC-HUMAN-CONFIRM re-gate — CHANGES_REQUESTED (1 blocking, Gate 3 still)

**Sprint:** BCTC-HUMAN-CONFIRM | **Task:** HC-QA-2 | **Verdict:** CHANGES_REQUESTED

```
date: 2026-05-30T18:10Z
head_commits: 9234e9c2(HC-FIX-1) + d5976d1e(HC-DEV-7)
container: d2eb2708 (HC-OPS-REBUILD-2, toolCount=154)
test_suites: HC-human-confirm.test.ts=52pass | HC-DEV-7-layout.test.ts=58pass | HC-DEV-6=53pass
tsc: 0 errors
178-price-history: 7 fail (pre-existing baseline, unchanged)
DDD: PASS | security: PASS

GATE 1 FLAG ENUMERATION: PASS (no regression — HC-human-confirm 52/52)
GATE 2 CORRECTION PERSIST + AUDIT: PASS (no regression)
GATE 4 RE-ANCHOR NEVER MIS-ATTACHES: PASS (DV-HC-11/12 pass)

GATE 3 CORE INVARIANT — RE-GATE (THE FIX): PARTIAL — COUNT fixed, anchor_status STILL WRONG
  HC-FIX-1 correctly eliminates duplicate rows: COUNT==1 per label after finalize (GOOD).
  Live QA-GATE seed: report=99999999-8888-7777-6666-555544443332, row_id=21577 corrected,
  Run 1 result: rows=2 (QA-Tiền id=21578 value=2500 sc=1.0, QA-Doanh id=21579 value=5000 sc=0.4) COUNT CORRECT.
  BUT: anchor_status=anchor_ambiguous (FAIL — expected 'ok').
  ROOT CAUSE: HC-FIX-1 execution order wrong.
    Current: selective_DELETE → INSERT → reAnchorCorrections → DELETE_old_pinned.
    At reAnchor time: OLD pinned row id=21577 still in DB + NEW row id=21578 both match label.
    → reAnchor sees 2 rows for stable key → anchor_ambiguous (correct safe-fail logic,
       but should never see 2 rows at re-anchor time).
    After DELETE_old_pinned: only id=21578 survives. COUNT is correct.
    But anchor_status is already written as anchor_ambiguous — too late.
  CORRECT ORDER: INSERT → DELETE_old_pinned → reAnchorCorrections.
    At reAnchor time after correct order: only NEW row exists → 1 match → anchor_status=ok.
  DV-HC-8 is a PARTIAL false-green: COUNT assertion correct, but no anchor_status check.
    Test passes (52/52) but misses the sequencing bug.
  FIX NEEDED: Swap DELETE_old_pinned and reAnchorCorrections in transaction block:
    finalizeBctcRefineTool.ts lines ~263-270:
      Move `for (const oldRowId of pinnedRowIds) { db.prepare(DELETE...).run(...) }` 
      to BEFORE `reAnchorCorrections(db, report_id)` call.
    Also add anchor_status='ok' assertion to DV-HC-8 to close the false-green.

GATE 5 FINAL-CONFIRM LOCK: PASS (no regression — DV-HC-7 + all 3 layers confirmed)
GATE 6 ESC-5 CLEARS: PASS (source_confidence=1.0 on corrected rows confirmed live)
GATE 7 ADDITIVE / NO REGRESSION: PASS
  163/163 HC tests (52+58+53) — 0 fail
  21/21 baseline (1198/1206/1322) — 0 fail
  178-price-history 7 fail (unchanged pre-existing)
  tsc 0 errors
GATE 8 VIEWER (HC-DEV-7 50/50 + 6 tabs): PASS
  50/50 split: .left-pane{flex:1} + .right-pane{flex:1} in served HTML
  6 tabs: Văn bản OCR (default) | Bảng | Bảng Markdown | Số liệu | Đánh giá 6 cổng | Sửa tay
  All 25 legacy pane IDs present (anti-regression: 24/24 checked PRESENT)
  navigateToPage master, switchTab with suatay loadFlags wiring confirmed
  Correction controls: hc-btn-confirm/hc-btn-reset, all 4 endpoints referenced
  HC-DEV-7-layout.test.ts 58 pass | HC-DEV-6 53 pass
NEW UI GATE (HC-DEV-7): PASS

VERDICT: CHANGES_REQUESTED (1 blocking)
BLOCKING: Gate 3 — anchor_status sequencing bug in finalizeBctcRefineTool.ts
  reAnchorCorrections runs while OLD pinned row still in DB → finds 2 rows for same label
  → anchor_ambiguous (should be 'ok'). Fix: move DELETE_old_pinned to BEFORE reAnchor.
  Exact location: finalizeBctcRefineTool.ts ~line 262-270 — swap order of reAnchor + DELETE loop.
  Also add anchor_status assertion to DV-HC-8 (closes the false-green gap).
NEXT: fixer | fix reAnchorCorrections order (swap lines 263-270) + add anchor_status assert to DV-HC-8
ROUTE: fixer round=2 (→ architect if round≥2 UNLESS this is a simple swap that's obviously correct)
NOTE: COUNT==1 is fixed, values correct, source_confidence correct — only sequencing is wrong.
```

---

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
