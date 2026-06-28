## Task Report 331

changed: [apps/pdf-extractor/application/extract_tables_usecase.py (~85 LOC added, 20 LOC modified), apps/pdf-extractor/__tests__/unit/test_extract_tables_usecase.py (~100 LOC added, 14 new tests)]
tests: 14/14 FR-4 PASS; unit: 941 pass / 6 fail (pre-existing); full pytest: 1080 pass / 11 fail (pre-existing); sandbox G12: 29+1 PASS | tsc: n/a (Python zone) | ddd: PASS | security: PASS
verdict: APPROVED

### DDD purity
- `infrastructure/text_table_extractor.py`: ZERO changes in commit 892c9efb
- `_detect_section_start` + `_filter_pages_to_section`: module-level pure functions in application layer
- Application → domain import only (L90 `from domain.primitives.select_balance_sheet_section import select_balance_sheet_section`)
- No per-issuer/form branches (NFR-4 PASS)

### VCB section-routing effect
- VCB Q4-2025 recompute: `cross_section_dup_count: 0` (FM-VCB-1 resolved)
- Remaining Stage 4 red: code_coverage=0.393 (FR-6/TASK_332 dependency) — expected

### Non-regression
- FPT: exact_dup_count=0, cross_section_dup_count=1 (≤1), Stage 6 GREEN
