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
