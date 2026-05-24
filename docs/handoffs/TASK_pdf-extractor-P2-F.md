# TASK_pdf-extractor-P2-F — Dashboard Honesty Implementation

**Date:** 2026-05-24
**Agent:** dev-pdf-extractor
**Phase:** 2 / Task: P2-F
**Status:** DONE

---

## Task Summary

Add 4 missing primitive card HTML slots + 4 TRACE_PATHS JS entries to
`apps/pdf-extractor/dashboard/index.html` so the dashboard renders all 6 primitive
cards (G6) and shows honest RED for failed traces (G8).

---

## Changes Made

### `apps/pdf-extractor/dashboard/index.html`

1. **4 new `<div class="card">` elements** added to `#section-primitives` (`.cards` div):
   - `card-confidence-scorer`
   - `card-low-confidence-gate`
   - `card-ratio-computer`
   - `card-field-extractor`

   Each has the same badge/meta/detail/lastrun sub-element structure as the 2 existing
   cards (`card-validate-financial-figures`, `card-decimal-normalizer`).

2. **4 new entries in `TRACE_PATHS` JS array** (now 8 total):
   - `traces/primitive/confidence_scorer.json`
   - `traces/primitive/low_confidence_gate.json`
   - `traces/primitive/ratio_computer.json`
   - `traces/primitive/field_extractor.json`

3. **Header updated:** "Pilot: Phase 1" → "Pilot: Phase 2"

4. **SI-2 boundary comment intact** (line 2 of HTML).

---

## Verification Evidence

### G6 — 6 primitive card IDs confirmed in HTML

```
grep -n 'id="card-' apps/pdf-extractor/dashboard/index.html
237: card-validate-financial-figures
246: card-decimal-normalizer
255: card-confidence-scorer
264: card-low-confidence-gate
273: card-ratio-computer
282: card-field-extractor
297: card-financial-reports   (module panel)
312: card-pdf-extractor        (microservice panel)
```

Total: 6 primitive + 1 module + 1 microservice = 8 card slots.

### TRACE_PATHS count — 8 entries (6 primitive + module + service)

```
traces/primitive/validate_financial_figures.json
traces/primitive/decimal_normalizer.json
traces/primitive/confidence_scorer.json
traces/primitive/low_confidence_gate.json
traces/primitive/ratio_computer.json
traces/primitive/field_extractor.json
traces/module/financial_reports.json
traces/service/pdf_extractor.json
```

### G8 Honesty Spot-Check

**Known-bad scenario run:**
```
PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/confidence_scorer/known_bad_score_wrong.json
→ trace written: dashboard/traces/primitive/confidence_scorer.json
→ trace.pass = false, exit 1
```

Trace `pass: false` → `setBadge(id, trace.pass === true)` = `setBadge(id, false)` →
`badge.className = "badge badge-fail"`, `badge.textContent = "FAIL"` (RED). CONFIRMED.

**Restored to green:**
```
PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/confidence_scorer/happy_high_conf.json
→ trace.pass = true, exit 0
```

### Trace Generation — All 6 Primitives

All 6 primitive traces written to `dashboard/traces/primitive/`:

| Primitive | Scenario | Result |
|---|---|---|
| validate_financial_figures | happy | PASS |
| decimal_normalizer | happy_normal | PASS |
| confidence_scorer | happy_high_conf | PASS |
| low_confidence_gate | happy_normal | PASS |
| ratio_computer | happy_gross_margin | PASS |
| field_extractor | happy_net_revenue | PASS |

Note: `dashboard/traces/` is git-ignored (runtime artifacts). Traces not committed.

### G12 DoD — All Real Scenarios Green

**Primitive tier (18 real scenarios):**

```
validate_financial_figures/happy: PASS
validate_financial_figures/edge_vnm_val01: PASS
validate_financial_figures/failure_negative_assets: PASS
decimal_normalizer/happy_normal: PASS
decimal_normalizer/edge_decimal_shift_vnm: PASS
decimal_normalizer/failure_non_numeric: PASS
confidence_scorer/happy_high_conf: PASS
confidence_scorer/edge_low_conf_with_tables: PASS
confidence_scorer/failure_zero_conf_no_tables: PASS
low_confidence_gate/happy_normal: PASS
low_confidence_gate/edge_low_confidence_flag: PASS
low_confidence_gate/failure_zero_skip: PASS
ratio_computer/happy_gross_margin: PASS
ratio_computer/edge_zero_denominator: PASS
ratio_computer/failure_negative_equity: PASS
field_extractor/happy_net_revenue: PASS
field_extractor/edge_field_not_found: PASS
field_extractor/failure_malformed_text: PASS
```

**Module tier (1 scenario):**

```
module/multi_primitive_story: PASS
```

All 19 real scenarios GREEN. G12 DoD PASS.

### pytest — 114 passed

```
114 passed in 1.61s
```

### Security Clause (G7)

```
env -i HOME=/Users/admin PYTHONPATH=... /usr/bin/env | grep -E "DB_|API_KEY|SECRET|..."
→ EMPTY (zero credentials in sandbox env)
```

---

## Final Committed State

- All 6 primitive cards honest-green (real happy scenarios)
- Card status is TRACE-DRIVEN via existing `setBadge()`/`renderTrace()` — no hardcoded green
- Default NOT-RUN for cards where no trace file exists (file:// fetch 404 → `renderTrace(null)`)
- SI-2 boundary comment intact
- Zero network calls, zero console errors (file:// compatible)

---

## Next Actor

**qa** — Re-verify G6 (6 primitive cards present) and G8 (honesty trace-driven, not hardcoded).
Then: P2-A1 (G4 DDD fence implementation).

PIPELINE: continue
NEXT: re-verify G6/G8 (qa) then P2-A1 (G4 fence)
