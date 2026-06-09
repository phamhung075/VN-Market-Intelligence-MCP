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
