# QA — Notebook

## cycle-158 · 2026-05-30 · TRUST-QA-1 — BCTC-TRUST-RED — CHANGES_REQUESTED

**Sprint:** BCTC-TRUST-RED | **Task:** TRUST-QA-1 | **Verdict:** CHANGES_REQUESTED

```
date: 2026-05-30T21:33Z
commit: 15dfc434 (TRUST-RED-sanity-gate.test.ts — 8 cases RED-before-GREEN)
TRUST-RED-sanity-gate.test.ts: 8 pass / 0 fail
bctcSanityValidator.test.ts: 37 pass / 0 fail (dev unit tests)
bctcMagnitudeValidator.test.ts: 20 pass / 0 fail (dev unit tests)
bctcPublishabilityGuard.test.ts: ? pass (not isolated — see regression gap below)
AR-refined-units-idempotency.test.ts: 17 pass / 0 fail (regression)
HCM-DISAMBIG-extraction.test.ts: 19 pass / 0 fail (0-diff, pre-existing whitespace M from dev)
tsc: 0 errors | DDD: PASS (domain services zero infra/interface imports)
security: PASS (no process.env, no hardcoded secrets)

BLOCKING REGRESSION (must fix before APPROVE):
  240-bctc-full.test.ts: 1 pass / 4 fail — pre-existing from dev commit b08ab73a
  Root: checkPublishability queries `refine_status` from financial_reports, but the
  240-bctc-full.test.ts uses makeDb() minimal schema (no refine_status column).
  Error: "no such column: refine_status" → all PUB-guard tests fail in that file.
  Fix: 240-bctc-full.test.ts makeDb() must call initFinancialReportsTables() instead
  of creating minimal schema, OR add refine_status column to its makeDb() helper.
```

**RED-before-GREEN evidence (per case):**

- TR-RED-1 (DT-1): Disabled validateBctcUnit → window_status='DONE' stored (RED observed).
  Enabled: sanity_block=true, window_status='REJECTED_SANITY', flags=['sanity:DIGIT_RUN'] in DB (GREEN confirmed by log + bun:sqlite query).

- TR-RED-2 (DT-2): Disabled detectMagnitudeViolations → ok:true, refine_status='DONE' (RED).
  Enabled: MAGNITUDE_GROSS_EQ_NET BLOCK, refine_status='REJECTED_SANITY', bctc_table_rows COUNT=0 (GREEN).

- TR-RED-3 (DT-3): Disabled detectCrossStatementRevenue → ok:true, refine_status='DONE' (RED).
  Enabled: CROSS_STMT_REVENUE_CONTRADICTION BLOCK (11481 vs 16058 = 28.5% > 20%), REJECTED_SANITY, rows=0 (GREEN).

- TR-RED-4 (PUB-1): Disabled checkPublishability → output contains "Net Revenue :" (RED).
  Enabled: refusal text "Chưa có dữ liệu", no financial data served (GREEN).

- TR-RED-5/5b: Clean data (net=100k gross=30k, realistic revenue) → ok:true, DONE, no false block (GREEN).

- TR-RED-6: Direct bun:sqlite COUNT queries for all assertions; no HTTP echo fields used (protocol compliance).

**Blocking issue (file:line):**
  apps/mcp-server/src/__tests__/240-bctc-full.test.ts:219-285 — makeDb() creates minimal schema without refine_status column; checkPublishability fails at query time ("no such column: refine_status"). 4 tests fail. Must add refine_status column or use initFinancialReportsTables().

## cycle-157 · 2026-05-30 · AIT-QA — BCTC-AI-INPUT-TAB — APPROVED

**Sprint:** BCTC-AI-INPUT-TAB | **Task:** AIT-QA | **Verdict:** APPROVED

```
date: 2026-05-30T19:45Z
head_commit: b4ed9266 (AIT-DEV-1 + bctcInspectHandler +2 routes, server.ts +2 dispatch, 7th tab)
container: live, 154 tools, freshly rebuilt --no-cache
sentinel_doc_id: e8ea3df5-3f32-413d-a3eb-c71634c0438d (FPT 2026-Q1, pages 6-11 rasterized)
tsc: 0 errors
AIT-DEV-1.test.ts: 59 pass / 0 fail
HC-human-confirm.test.ts: 53 pass / 0 fail (regression)
HC-DEV-7-layout.test.ts: 58 pass / 0 fail (regression)
1198/1206/1322 baseline: 21 pass / 0 fail (regression)
DDD: PASS | security: PASS

GATE 1 — LIVE PNG BYTES: PASS
  curl page=6 → 200 image/png, xxd magic = 89 50 4E 47 (PNG header confirmed)
  Not JSON echo, not base64 wrapper — raw PNG bytes served directly.

GATE 2 — HONEST 404 ON MISS: PASS
  curl page=999 → 404 application/json, body = {error:"png_not_found",doc_id:...,page:999}
  NOT 200 with placeholder; not a generic 404 — exact signal confirmed.

GATE 3 — PAGE-WINDOW ROUTE: PASS
  GET /api/bctc-inspect/page-window/e8ea3df5...?page=6
  → {found:true, doc_id:..., page:6, unit_id:"unit-0003", page_numbers:[6], row_count:1, confidence:0.9}
  JSON with all required fields present.

GATE 4 — UNCOMMITTED FIX RULING: COMMIT NEEDED = YES, TEST NEEDED = NO
  Fix: getBctcPageImageTool.ts line 60-62:
    OLD: join(process.cwd(), "data", "bctc-page-images", reportId, `page_${paddedPage}.png`)
    NEW: join("/data/bctc-page-images", reportId, `page_${paddedPage}.png`)
  Correctness: YES — the live container mounts the named volume at /data/bctc-page-images.
    process.cwd() inside container = /app, so old path would resolve to /app/data/bctc-page-images
    (does not exist). New path matches bctcInspectHandler.ts line 945 which uses the same formula.
    Gate 1 confirms the route serving real PNG bytes works — the rebuild read working tree.
    Without committing, next clean rebuild from HEAD would reintroduce the broken path.
  Test needed: NO — the MCP tool handler is already covered by:
    (a) AIT-DEV-1 test 3 exercises handleBctcInspectPageImage (the sibling HTTP handler) with
        png_not_found branch for /data path miss — same volume-path invariant tested there.
    (b) getBctcPageImageTool.ts uses injected deps (fileExists, readPng) for unit-testability;
        the getPngPath() helper is pure (no I/O) and matches bctcInspectHandler.ts by inspection.
    (c) Gate 1 live smoke proves end-to-end serving at the correct absolute path.
    An additional unit test for getPngPath() would be trivial string assertion, not load-bearing.
  ACTION: dev-mcp-server MUST commit this file with scoped git add before po EXIT sign-off.

GATE 5 — HTML REGRESSION: PASS
  GET http://localhost:3000/api/bctc-inspect → 103579 bytes HTML served live.
  7 tabs present: data-tab=ocr|bang|md|soluyen|danhgia|suatay|aiinput (all confirmed in served HTML)
  7th tab: data-tab="aiinput", id="rtab-aiinput", id="tab-panel-aiinput", label="Đầu vào AI"
  navigateToPage: 16 occurrences in served HTML. switchTab+loadFlags+renderFlaggedCells: 20 occurrences.
  50/50 split: left-pane/right-pane flex:1 pattern confirmed (21 matches).
  All 25 legacy pane IDs present (confirmed by AIT-DEV-1 test suite ran against source HTML file,
    not a fixture — AIT-DEV-1 reads bctc-inspector.html at line 324 via readFileSync with resolve()).
  AIT-DEV-1 59/59 green = HTML assertions all passed against the real source file.

GATE 6 — DB INTEGRITY: PASS
  Direct in-container bun:sqlite read (new Database("/app/data/market.db")):
  FPT financial_reports row e8ea3df5-3f32-413d-a3eb-c71634c0438d:
    confirm_status=PENDING, final_confirmed_at=null — UNCHANGED.
  Rasterization wrote only image files; report row not mutated.

GATE 7 — tsc + AIT-DEV-1 (59) + HC regression (111): PASS
  bun tsc --noEmit: 0 errors
  AIT-DEV-1.test.ts: 59 pass / 0 fail
  HC-human-confirm.test.ts: 53 pass / 0 fail
  HC-DEV-7-layout.test.ts: 58 pass / 0 fail
  1198/1206/1322: 21 pass / 0 fail
  DDD: interface imports application (parsePdfFilenameTokens) — acceptable per DDD rules.
       domain/ imports: no new domain files added.
  Security: getBctcPageImageTool.ts uses Bun.env (not process.env), no hardcoded secrets.
       bctcInspectHandler.ts new routes: no process.env, no SQL (uses existsSync/readFileSync/DB.prepare with parameterized queries).

VERDICT: APPROVED
ALL 7 GATE ITEMS: GREEN
GATE-4-COMMIT-RULING: COMMIT NEEDED Y / TEST NEEDED N
NEXT: dev-mcp-server | scoped commit getBctcPageImageTool.ts fix, then po | EXIT sign-off
```

---

## cycle-156 · 2026-05-30 · HC-QA-3 — BCTC-HUMAN-CONFIRM Gate-3 live re-gate — APPROVED

**Sprint:** BCTC-HUMAN-CONFIRM | **Task:** HC-QA-3 | **Verdict:** APPROVED

```
date: 2026-05-30T18:30Z
head_commit: 441f8e18 (HC-FIX-2 — DELETE-before-reAnchor swap)
container: dd904d63 (HC-OPS-REBUILD-3, toolCount=154, uptime ~4min)
test_suite: HC-human-confirm.test.ts=53pass / 0fail
tsc: 0 errors
178-price-history: 7 fail (pre-existing baseline, unchanged)
baseline-1198/1206/1322: 21 pass / 0 fail
DDD: PASS | security: PASS (no new files, fix was order-swap only)

GATE 3 LIVE RE-GATE — PASS (GREEN, all 3 idempotency runs)
  Throwaway report: 99999999-8888-7777-6666-000000001111 (QA-GATE, NOT FPT/ACB)
  Correction: QA-GATE-Tien-Run3, old_value=1000 → new_value=2500, row_id=21580
  RUN 1: rows_parsed=2, QA-GATE-Tien-Run3 COUNT=1, value_current=2500,
         source_confidence=1.0, anchor_status=ok, corrections_count=1 — PASS
  RUN 2: rows_parsed=2, COUNT=1, value_current=2500, sc=1.0, anchor_status=ok — PASS
  RUN 3: rows_parsed=2, COUNT=1, value_current=2500, sc=1.0, anchor_status=ok — PASS
  Idempotent ×3: COUNT stays 1, anchor_status stays 'ok' every run — NO GROWTH, NO FLIP
  Cleanup: reports=0, rows=0, corrections=0 for throwaway UUID — no orphan rows
  FPT=2, ACB=1 reports intact (untouched read-only confirmed)

GATE 4 NON-REGRESSION — PASS
  DV-HC-14 in HC-human-confirm.test.ts (53pass/0fail):
  genuine parser duplicate (label=Khác ×2 same stable key) → anchor_ambiguous + COUNT==2
  swap does NOT regress genuine-ambiguous safe-fail — CONFIRMED GREEN

GATE 7 NON-REGRESSION — PASS
  HC-human-confirm.test.ts: 53 pass / 0 fail (incl DV-HC-8 anchor_status=ok + DV-HC-14)
  baseline 1198/1206/1322: 21 pass / 0 fail
  178-price-history: 7 fail (pre-existing, unchanged — no new failures)
  tsc: 0 errors

VERDICT: APPROVED
SUMMARY: Gate 3 fully resolved — DELETE-old-pinned-rows BEFORE reAnchorCorrections (HC-FIX-2).
  reAnchor now sees exactly 1 row per non-ambiguous corrected label → anchor_status=ok.
  Idempotent ×3 confirmed. No regression on gates 4/7.
NEXT: po | HC-EXIT sprint sign-off
```

---

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
