## Task Report 330

changed: [apps/pdf-extractor/infrastructure/text_table_extractor.py:641-696 (new function), :1628-1633 (call site), apps/pdf-extractor/__tests__/unit/test_text_table_extractor.py:407-578 (7 new tests)]
tests: 927 pass / 6 fail (pre-existing PIL-ABI + page_rasterizer env) | sandbox G12: 5/5 PASS | mock-guard: PASS | ddd: PASS | security: PASS
verdict: APPROVED

### FR-5 Checks

- exact_dup_collapse: PASS — test_exact_dup_collapsed_to_first: len==1, page_number==1 wins
- ocr_variant_passthrough: PASS — test_same_code_different_value_both_emitted: len==2, both values present
- header_rows: PASS — code=None rows always emitted
- fm_hpg2_pattern: PASS — test_fm_hpg2_two_duplicate_codes_both_collapsed: code=140+400 both collapsed to 1st occurrence
- scope_guard: PASS — stateless local dict; two independent calls emit independently
- call_site_ac6: PASS — L1633 before _apply_positional_cutoff at L1639
- nfr4: PASS — grep for per-issuer/ticker branches: empty
- fpt_non_regression: PASS — Stage 4 exact_dup_count=0 (bonus drop from pre-existing 1), Stage 6 GREEN (golden rows preserved)

### WARNING logging note

Both collapse path (L674-681) and OCR-variant path (L686-694) emit WARNING. The OCR-variant path emits WARNING AND appends the row — observability only, not an accidental collapse. Confirmed: the `out.append(row)` is in the `else` branch (L695), never executes on the exact-dup path.
