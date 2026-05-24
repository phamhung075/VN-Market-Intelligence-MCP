# TASK P2-G — G9 Playwright Headless Trust Contract

**Pilot:** pdf-extractor  
**Phase:** 2  
**Task:** P2-G  
**Goal:** G9  
**Owner:** qa  
**Date:** 2026-05-24  
**Status:** DONE — G9 VERIFIED

---

## [QA] Implementation Record

### Method
Playwright headless Path B — `@playwright/test` v1.53.x, Chromium, local http-server.
3 test cases covering all 7 ACs.

### Pre-work

**Step 1 — Fresh traces generated (all-green):**
```
PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh --tier=primitive --scenario=apps/pdf-extractor/scenarios/primitives/validate_financial_figures/happy.json
PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh --tier=primitive --scenario=apps/pdf-extractor/scenarios/primitives/decimal_normalizer/happy_normal.json
PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh --tier=primitive --scenario=apps/pdf-extractor/scenarios/primitives/confidence_scorer/happy_high_conf.json
PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh --tier=primitive --scenario=apps/pdf-extractor/scenarios/primitives/low_confidence_gate/happy_normal.json
PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh --tier=primitive --scenario=apps/pdf-extractor/scenarios/primitives/ratio_computer/happy_gross_margin.json
PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh --tier=primitive --scenario=apps/pdf-extractor/scenarios/primitives/field_extractor/happy_net_revenue.json
PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh --tier=module --scenario=apps/pdf-extractor/scenarios/modules/financial_reports/multi_primitive_story.json
```
All 7 traces: pass=true (6 primitive + 1 module).

**Step 2 — Dashboard JS fix:**  
`apps/pdf-extractor/dashboard/index.html` — `setBadge(id, trace.pass === null ? null : trace.pass === true)`  
Ensures pass=null renders as NOT-RUN (honest service-tier placeholder).

**Step 3 — Service trace placeholder:**  
Created `apps/pdf-extractor/dashboard/traces/service/pdf_extractor.json` with `pass: null` (NOT-RUN honest).  
Eliminates 404 console error for unimplemented service tier.

### Playwright Test Results

```
npx playwright test apps/pdf-extractor/dashboard/trust-contract.spec.js \
  --config=apps/pdf-extractor/dashboard/playwright.config.js

Running 3 tests using 1 worker

  ✓  AC-2+AC-3+AC-5+AC-6: all 3 panels, 6 primitive cards, 0 console errors, 0 HTTP requests (1.9s)
  ✓  AC-4: honest-red — inject pass=false trace, card shows FAIL badge (1.7s)
  ✓  AC-2 screenshot: trust-contract screenshot in all-green state (1.9s)

3 passed (8.6s)
exit code: 0
```

### AC Verdicts

| AC | Description | Verdict |
|----|-------------|---------|
| AC-1 | `npx playwright test` exits 0 | PASS |
| AC-2 | All 3 panels visible (primitives, module, service) | PASS |
| AC-3 | Exactly 6 primitive cards rendered | PASS |
| AC-4 | Honest RED: decimal_normalizer pass=false → FAIL badge; isolated (others PASS) | PASS |
| AC-5 | Zero console errors | PASS |
| AC-6 | Zero external HTTP requests (localhost served only) | PASS |
| AC-7 | trust-contract-verdict.json written and committed | PASS |

### VERDICT Fields

```
panels_present: [primitives, module, service]
primitive_cards: 6 (validate-financial-figures, decimal-normalizer, confidence-scorer, low-confidence-gate, ratio-computer, field-extractor)
honest_red_proven: true (decimal_normalizer pass=false → FAIL badge; restored → PASS)
console_errors: 0
external_network_calls: 0
screenshot_path: apps/pdf-extractor/dashboard/g9-trust-contract.png
playwright_exit: 0 (3/3 pass)
```

### Committed Artifacts

- `apps/pdf-extractor/dashboard/playwright.config.js` — Playwright config (http-server + chromium)
- `apps/pdf-extractor/dashboard/trust-contract.spec.js` — 3 test cases covering all 7 ACs
- `apps/pdf-extractor/dashboard/trust-contract-verdict.json` — VERDICT: PASS
- `apps/pdf-extractor/dashboard/g9-trust-contract.png` — Screenshot: all-green state
- `apps/pdf-extractor/dashboard/traces/service/pdf_extractor.json` — NOT-RUN honest placeholder
- `apps/pdf-extractor/dashboard/index.html` — patch: pass=null → NOT-RUN badge (line 422)

### G9 Goal Verdict

**G9: VERIFIED — EARNED-PENDING**

Dashboard is a trustworthy contract. Playwright headless automation confirms:
- 3 panels render correctly
- 6 primitive cards show honest pass/fail state from trace JSON
- Dashboard does not false-green (pass=false → FAIL badge proven)
- Zero console errors, zero external network calls

---

## RETURN

```
DONE: P2-G G9 Playwright trust contract PASS — 3/3 tests exit 0
NEXT: qa — P2-J0 (G10 preflight: bug-inventory baseline confirmation)
SIGNAL: docs/signals/qa-pdf-extractor-P2-G-g9-20260524T113900Z.json
HANDOFF: docs/handoffs/TASK_pdf-extractor-P2-G.md
PIPELINE: continue
```
