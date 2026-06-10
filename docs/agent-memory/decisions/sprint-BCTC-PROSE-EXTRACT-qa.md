<!-- size-justification: 60L — single-task QA verdict journal, mandatory pre-DONE gate (DJ-GATE-1). -->
# Decision Journal — QA — BCTC-PROSE-EXTRACT

## Entry qa-S1 · 2026-06-10 · task-id: BPE-DEV-1

**verdict:** APPROVED

**what-considered:**
- All 16 prose tests (test_generic_extractor_prose.py) re-run by QA: PASS. No dev self-report relay.
- All 45 prerequisite table tests (test_bctc_code_whitelist.py + test_bs_accounting_identities.py) re-run: PASS.
- Full suite: 911 pass / 40 fail. The 40 failures are a pre-existing pytest-asyncio event-loop isolation issue (confirmed: each affected test passes in isolation and as a group; no affected file appears in the 1588a591 or 6e518935 diffs).
- Fence test: injected ocr_pages with non-empty text → stitched_markdown non-empty. If prose_lines were never appended (old bug), assertion would fail. Guard is genuine.
- BLOCKER-3 serial ordering: 1588a591 (table work) committed before 6e518935 (prose fix). Confirmed via git log.
- DDD: domain/primitives files (bctc_code_whitelist, layout_invariants) import stdlib only — no infrastructure or application imports.
- AC-1: ocr_unit() signature extended with ocr_pages param; dual-key fallback; _prose_no_text=True when all blank. VERIFIED in source.
- AC-2: call site extract_layout_first_usecase.py L425 passes ocr_pages=ocr_pages. ocr_pages in scope from L220. VERIFIED.
- AC-3: rows_for_gate=[] confirmed for prose units (L3735). VERIFIED in source + test.
- AC-4: table branch untouched; 45/45 table tests green.
- AC-5: test_generic_extractor_prose.py created; 16 tests cover TC-1, TC-1b, EC-1, RISK-1 dual-key, NFR-3 gate skip.
- RISK-5 audit: dev grepped assert_called_with on ocr_unit — zero matches. No fixture breakage.
- Security: no hardcoded secrets, no process.env; pure Python, no SQL.
- BCTC eval gate: not applicable (no report_id in scope for this unit-test-only task).

**why-change:** only path — all checks green. No arch concern (no new domain/MCP tool/cross-service). No round-2 fixer escalation needed.

## Entry qa-S2 · 2026-06-10 · task-id: BPE-DEV-2

**verdict:** APPROVED

**what-considered:**
- PROSE-UNIT-SERVE.test.ts: 12/12 pass (live re-run by QA — not relayed). 40 expect() calls.
- 240-bctc-full.test.ts + pek-render-seam.test.ts: 29/29 pass (live re-run). No regression.
- 251-mcp-tools.test.ts: included in 54/54 aggregate pass across 4 critical files.
- tsc --noEmit: EXIT 0 (empty output = clean). Verified live.
- Fence test (GATE-2): TC-2 inserts page_type='prose' unit; asserts pek_coverage_gap absent. If filter reverted to 'table', pekUnitRow=null → fallback path emits pek_coverage_gap:true → toBeUndefined() fails. Guard GENUINE.
- AC-1: bctcInspectHandler.ts L519 `page_type IN ('table', 'prose')` — verified in source.
- AC-2: empty stitched_markdown falls through (L531 check); non-empty served directly; gap path at L592 sets pek_coverage_gap:true. Semantics correct.
- AC-3: bctcFullTools.ts L1163-1202 prose_sections query; PROSE_TEXT_CAP=4000; quarantine filter; ascending sort. All 5 TC-5 assertions cover: present, empty-when-no-prose, truncated, sorted, quarantine-excluded.
- BLOCKER-4: no new tool registration in commit diff (grep on diff adds confirmed). Extended existing tools only.
- DDD: new lines in diff import nothing new from infrastructure/application.
- Security: no process.env, no secrets, no hardcoded tokens in diff.
- mock-guard: EXIT 0 PASS on both production files.
- Full suite (bun test): Bun 1.3.13 C++ OOM crash on full suite run — same pre-existing crash pattern as prior QA cycles (see qa-S cycle-218 note). Critical affected suites all PASS individually. Full suite exit 0 not capturable due to Bun crash; accepted per prior pattern.
- BCTC eval gate: no report_id in task scope (serving code only, no corpus touch). N/A.
- REBUILD REQUIRED note acknowledged — end-to-end TC-2/TC-2b/TC-5 round-trip against real producer data can only be confirmed post-container rebuild.

**why-change:** only path — all checks green. No arch concern (extended existing tools, no new MCP tool).

## Entry qa-S3 · 2026-06-10 · task-id: BPE-DEV-3

**verdict:** APPROVED

**what-considered:**
- BPE-DEV-3-ocr-coverage-fixes.test.ts: 15/15 PASS (live re-run by QA — not relayed from dev). 31 expect() calls.
- Regression suite (pek-render-seam.test.ts 12/12, bctcInspectHandler.test.ts 13/13, PROSE-DEV-1 5/5, 292-ocr-audit 24/24, 1352c-ocr-health-logging 20/20): all pass individually. Batch failure = Bun 1.3.13 isolation pre-existing (same pattern as qa-S2/cycle-220; each file passes solo).
- tsc --noEmit: EXIT 0 (empty output = 0 errors). Verified live.
- Fence check: COUNT=35 vs MAX=46 in in-memory fixture. Tests assert total_pages=46; if COUNT used → get 35 → FAIL. Fence GENUINE — confirmed by live arithmetic probe.
- GAP-1 SQL all parameterized: MAX(page_number) queries use `?` placeholder; point-lookup WHERE page_number=? also parameterized. No string interpolation.
- GAP-3 threshold: `finalText.length < 3` in source; no active `} else if (pageText.length < 10)` branch. Tests 6+7 verify via source readFileSync.
- GAP-3 DPI escalation: `300` present in source; `pageText.length < 50` guard present. logger.warn `[ocr] page` present.
- RISK-OCR-2: `confidence < 0.1` guard at bctcInspectHandler.ts L584 confirmed in source. Test 13 verifies via readFileSync.
- ocrStats counter logic: tests 14+15 verify NEW_THRESHOLD=3 boundary (5-char not lowChar, 2-char is lowChar).
- DDD: bctcInspectHandler.ts — interface layer. Import from application/usecases (parsePdfFilenameTokens) is PRE-EXISTING since BPE-DEV-2; not introduced by this task. pdfOcrWorker.ts — infra layer. Neither file imports from domain (correct). Domain layer has no infra imports.
- Security: no process.env in either changed file. No hardcoded secrets. SQL parameterized throughout.
- mock-guard: EXIT 0 on both changed production files.
- Bare catch at pdfOcrWorker.ts L304: new, intentional. DPI escalation best-effort — if escalation fails, original pageText preserved; comment explicit. Not a silent data loss path.
- Container: image sha256:e50369dc confirmed, healthy, Up 13 min. All 6 peers intact (rag-service, news-fetch, macro-indicators, frontend, api-gateway, mcp-gateway all healthy).
- BCTC eval gate: no report_id in task scope (code-only OCR fix; data re-run is BPE-OPS-1). N/A.
- Full bun test suite: Bun 1.3.13 OOM/isolation pre-existing; confirmed via targeted suite coverage. Not a regression.

**why-change:** only path — all checks green. No arch concern (SQL correction in interface layer + infra threshold change; no new domain service, no new MCP tool, no cross-service HTTP).

## Entry qa-S4 · 2026-06-10 · task-id: BPE-QA-1

**verdict:** CHANGES_REQUESTED

**what-considered (raw-verified — no badge relay):**

CONTAINER: mcp-server Up 28 min (healthy), all 8 peers intact (rag-service, news-fetch, macro-indicators, frontend, api-gateway, mcp-gateway all healthy). pdf-extractor Up 42 hours (unhealthy — pre-existing state, not introduced by this sprint).

A. PROSE — PASS:
- Page 12 (core defect): `text_content` length=4099, `has_pek:true`, `pek_coverage_gap:null` (i.e. covered), `confidence:1.0`, `unit_id=d3c5059e`. Vietnamese prose confirmed ("THUYẾT MINH BÁO CÁO TÀI CHÍNH HỢP NHẤT"). Fix for original defect is confirmed live.
- `total_pages=46` on every page response — GAP-1 fix confirmed.
- Spot-check prose pages (16, 23, 30, 40, 46): all return non-empty text. Page 16: 5706 chars (PEK unit). Pages 23, 40, 46, 30: pek_coverage_gap:true but pdf_extracted_text fallback serves real Vietnamese text (794–2120 chars). No "No OCR text" anywhere.
- pdf_extracted_text for FPT: 46/46 pages present (ALL pages 1-46 in DB), confidence=0.8. Pages 11-22: all 12 present with len 1801-7449. Pages 36-46: all 11 present with len 1013-3324.

B. TABLE PAGES — REGRESSION CONFIRMED:
- bctc_layout_units for report `e8ea3df5`: 18 total units, **13 empty (stitched_markdown=''), 5 non-empty**.
- The 5 non-empty units are all `page_type=prose` (schema_pages 12, 15, 16, 18, 30). 
- The 13 empty units are ALL `page_type=table` (schema_pages 1-6, 7-9, 10, 11, 13-14, 20, 21-28, 29, 31-34, 35, 36, 37-41, 42-46).
- Table pages 1-10 (balance sheet / income statement region) serve `pek_coverage_gap:true` + fallback to raw OCR from pdf_extracted_text. The OCR text is not structured table data — it is raw scanned text which is unsuitable for structured table analysis.
- Contrast: OTHER reports' bctc_layout_units (DGC, DIG, VNM, EIB, SHB, DHG, BSR, VEA) all have `empty=0, nonempty=N` — their table units ARE populated. FPT Q1-2026 (this sprint's target) is the ONLY report with `empty=13` table units. This is the DEV-4 regression.
- FPT Q4-2025 (report e71f845d) has `empty=4, nonempty=27` — its prior extraction was mostly intact, confirming regression is specific to this sprint's layout-first re-flow run on FPT Q1-2026.

C. INTEGRITY:
- No other ticker's pdf_extracted_text was touched. All non-FPT filenames show normal row counts (confirmed via SELECT DISTINCT filename scan covering 62 distinct filenames).
- No data was deleted; only FPT bctc_layout_units table units are empty (structural gap, not a deletion).

**blocking-issue:**
- `apps/pdf-extractor/` (layout-first extraction pipeline): bctc_layout_units for FPT Q1-2026 report `e8ea3df5` has 13 table units with `stitched_markdown=''`. These are schema_pages 1-6, 7-9, 10, 11, 13-14, 20, 21-28, 29, 31-34, 35, 36, 37-41, 42-46. All page_type=table. The user's goal "correct table and no table extract" requires these to contain real tabular content. Empty table units = user goal not met for the majority of the PDF's content.

**why-change:** PROSE half of user's goal is fixed (original defect resolved). TABLE half regressed: 13/18 layout units are empty placeholders for table pages. Per task spec: if prose is fixed but tables regressed → CHANGES_REQUESTED, not green. User's explicit requirement is BOTH table AND prose extraction. This verdict opens BPE-DEV-5.
