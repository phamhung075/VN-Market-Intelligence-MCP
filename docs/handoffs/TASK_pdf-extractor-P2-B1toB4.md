---
task_ids: [P2-B1, P2-B2, P2-B3, P2-B4]
owner: dev-pdf-extractor
status: DONE
completed: 2026-05-24
pilot: pdf-extractor
phase: 2
milestone: G1-full
---

# TASK P2-B1 through P2-B4 — 4 New Primitives (G1-full milestone)

## Summary

4 pure primitives delivered in atomic commits. G1-full band complete: 6 primitives total, 18 scenario JSONs.

---

## P2-B1 — confidence_scorer

**Commit:** `203a951a` (pdf-extractor files committed via shared index race into commit `459b6912`)
**Files created:**
- `apps/pdf-extractor/domain/primitives/confidence_scorer/__init__.py`
- `apps/pdf-extractor/domain/primitives/confidence_scorer/primitive.py`
- `apps/pdf-extractor/scenarios/primitives/confidence_scorer/happy_high_conf.json`
- `apps/pdf-extractor/scenarios/primitives/confidence_scorer/edge_low_conf_with_tables.json`
- `apps/pdf-extractor/scenarios/primitives/confidence_scorer/failure_zero_conf_no_tables.json`
- `apps/pdf-extractor/__tests__/unit/test_confidence_scorer.py`

**Contract:** `score_confidence(ocr_confidence, table_count) → {"pass": bool, "quality_score": float}`
**Gate rule:** `ocr_confidence < 0.5 AND table_count == 0 → pass=False`

**Sandbox evidence:**
- happy_high_conf (0.85, 2 tables) → pass=true, quality_score=0.85 ✓ exit:0
- edge_low_conf_with_tables (0.3, 3 tables) → pass=true (tables rescue) ✓ exit:0
- failure_zero_conf_no_tables (0.3, 0 tables) → pass=false ✓ exit:0 (pass=true in runner because expected matches actual)

**AC verification:**
1. All 3 scenarios exit 0 ✓
2. Fence-A: zero infra/application/interface imports ✓
3. 12 unit tests PASS ✓
4. Existing test suite: 58 tests PASS ✓
5. Zero mcp-server files in staged diff ✓
6. G12 DoD: sandbox-green ✓

---

## P2-B2 — low_confidence_gate

**Commit:** `a1a7224a` (shared index race — files committed correctly)
**Files created:**
- `apps/pdf-extractor/domain/primitives/low_confidence_gate/__init__.py`
- `apps/pdf-extractor/domain/primitives/low_confidence_gate/primitive.py`
- `apps/pdf-extractor/scenarios/primitives/low_confidence_gate/happy_normal.json`
- `apps/pdf-extractor/scenarios/primitives/low_confidence_gate/edge_low_confidence_flag.json`
- `apps/pdf-extractor/scenarios/primitives/low_confidence_gate/failure_zero_skip.json`
- `apps/pdf-extractor/__tests__/unit/test_low_confidence_gate.py`

**Contract:** `gate_confidence(confidence) → Literal["skip", "low_confidence", "normal"]`
**Canonical boundaries:**
- `confidence == 0.0 → "skip"` (exact zero gate)
- `confidence < 0.2 → "low_confidence"` (strict less-than)
- `confidence >= 0.2 → "normal"`

**Sandbox evidence:**
- happy_normal (0.85) → "normal" ✓ exit:0
- edge_low_confidence_flag (0.15) → "low_confidence" ✓ exit:0
- failure_zero_skip (0.0) → "skip" ✓ exit:0

**AC verification:**
1. All 3 scenarios exit 0 ✓
2. Boundaries encoded: 0.0→skip, <0.2→low_confidence, ≥0.2→normal ✓
3. Fence-A: zero infra imports ✓
4. 10 unit tests PASS ✓
5. Zero mcp-server files in staged diff ✓
6. G12 DoD: sandbox-green ✓

---

## P2-B3 — ratio_computer

**Commit:** `74d84022`
**Files created:**
- `apps/pdf-extractor/domain/primitives/ratio_computer/__init__.py`
- `apps/pdf-extractor/domain/primitives/ratio_computer/primitive.py`
- `apps/pdf-extractor/scenarios/primitives/ratio_computer/happy_gross_margin.json`
- `apps/pdf-extractor/scenarios/primitives/ratio_computer/edge_zero_denominator.json`
- `apps/pdf-extractor/scenarios/primitives/ratio_computer/failure_negative_equity.json`
- `apps/pdf-extractor/__tests__/unit/test_ratio_computer.py`

**Contract:** `compute_ratio(numerator, denominator, ratio_type) → Optional[float]`
**Supported types:** "gross_margin", "debt_equity", "roe"
**Zero-denominator:** returns None (no exception)

**Sandbox evidence:**
- happy_gross_margin (300/1000, gross_margin) → 0.3 ✓ exit:0
- edge_zero_denominator (100/0, debt_equity) → null ✓ exit:0
- failure_negative_equity (500/-50, debt_equity) → -10.0 ✓ exit:0 (valid arithmetic)

**AC verification:**
1. All 3 scenarios exit 0 ✓
2. Zero-denominator → null (no crash) ✓
3. Fence-A: zero infra imports ✓
4. 12 unit tests PASS ✓
5. Full suite: 80 tests PASS ✓
6. Zero mcp-server files in staged diff ✓
7. G12 DoD: sandbox-green ✓

---

## P2-B4 — field_extractor

**Commit:** `865493a1`
**Files created:**
- `apps/pdf-extractor/domain/primitives/field_extractor/__init__.py`
- `apps/pdf-extractor/domain/primitives/field_extractor/primitive.py`
- `apps/pdf-extractor/scenarios/primitives/field_extractor/happy_net_revenue.json`
- `apps/pdf-extractor/scenarios/primitives/field_extractor/edge_field_not_found.json`
- `apps/pdf-extractor/scenarios/primitives/field_extractor/failure_malformed_text.json`
- `apps/pdf-extractor/__tests__/unit/test_field_extractor.py`

**Contract:** `extract_field(text, field_name) → Optional[str]`
**Supported fields:** "net_revenue", "net_profit", "total_assets", "equity"
**Pattern source:** READ-ONLY archaeology from `apps/mcp-server/src/domain/services/financial-reports/` (incomeStatementExtractor.ts + balanceSheetExtractor.ts) — ZERO mcp-server writes.

**Sandbox evidence:**
- happy_net_revenue ("Doanh thu thuần: 1,234.5", "net_revenue") → "1,234.5" ✓ exit:0
- edge_field_not_found (text without net_profit, "net_profit") → null ✓ exit:0
- failure_malformed_text ("", "net_revenue") → null ✓ exit:0

**AC verification:**
1. Runner exits 0 on happy scenario ✓
2. edge and failure scenarios exit 0 (expected=null, actual=null → pass=true) ✓
3. Fence-A: zero infra/application/interface imports ✓
4. ≥3 scenarios ✓
5. ZERO mcp-server files in staged diff ✓ (FREEZE ENFORCEMENT confirmed)
6. Existing tests pass: 95 tests PASS ✓
7. G12 DoD: sandbox-green ✓
8. Regex patterns documented in primitive.py with READ-ONLY reference comment ✓

---

## G12 DoD Gate Evidence — All Tiers GREEN

### Primitive tier (all real primitives):
```
validate_financial_figures: happy/edge/failure → all PASS
decimal_normalizer: happy/edge/failure → all PASS
confidence_scorer: happy/edge/failure → all PASS
low_confidence_gate: happy/edge/failure → all PASS
ratio_computer: happy/edge/failure → all PASS
field_extractor: happy/edge/failure → all PASS
```

### Module tier:
```
financial_reports: multi_primitive_story → pass=true, exit:0
```

### Unit tests:
```
95 tests PASS (full suite)
```

---

## Goal Status After P2-B1 through P2-B4

| Goal | Status |
|------|--------|
| G1-full | PENDING verification (6 primitives × ≥3 scenarios = 18 ✓) |
| Zero mcp-server files in any commit | CONFIRMED ✓ |
| Primitive purity (zero infra imports) | CONFIRMED ✓ for all 4 new primitives |
| Total primitives | 6 (validate_financial_figures, decimal_normalizer, confidence_scorer, low_confidence_gate, ratio_computer, field_extractor) |
| Total scenario JSONs | 18 real (6 × 3) + 3 echo_identity scaffold = 21 total |

**NEXT:** P2-C — G2 re-verify: `financial_reports` module composes all 6 primitives via ports
