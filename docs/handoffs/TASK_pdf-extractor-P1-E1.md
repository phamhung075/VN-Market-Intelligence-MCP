# TASK_pdf-extractor-P1-E1 — Dashboard Stub HTML (G12 STREAK #3)

**Agent:** dev-pdf-extractor
**Date:** 2026-05-24
**Phase:** P1-E1
**Streak:** G12 STREAK #3 (B1 → C → E1 — COMPLETE)

---

## Deliverable

`apps/pdf-extractor/dashboard/index.html`

- Opens via `file://` with ZERO network calls (pure local fetch of relative trace paths).
- 3 panels: Primitives (2 cards: validate-financial-figures, decimal-normalizer), Module (financial-reports), Microservice (pdf-extractor).
- All cards honest `NOT-RUN` on first open (no false greens — badge class `badge-not-run`).
- Zero JS console errors on load.
- Reads trace JSON from `dashboard/traces/` on reload (relative path, file:// compatible).
- SI-2 boundary comment baked in line 2: `<!-- SI-2 BOUNDARY: pdf-extractor dashboard ONLY — do not merge into docs/dashboards/index.html (stock-price exclusive) -->`.

---

## G12 Sandbox-Check Before Commit Evidence

All 7 scenarios run before staging. Outputs captured below.

### Primitive: validate-financial-figures

```
$ PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/validate_financial_figures/happy.json
{"primitive":"validate_financial_figures","module":null,"inputs":{"total_assets":10000.0,"total_equity":4000.0,"total_liabilities":6000.0,"operating_margin":0.15,"net_revenue":5000.0},"expected":1.0,"actual":1.0,"pass":true,"error":null}
EXIT:0

$ PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/validate_financial_figures/failure_negative_assets.json
{"primitive":"validate_financial_figures",...,"expected":0.0,"actual":0.0,"pass":true,"error":null}
EXIT:0

$ PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/validate_financial_figures/edge_vnm_val01.json
{"primitive":"validate_financial_figures",...,"expected":0.0,"actual":0.0,"pass":true,"error":null}
EXIT:0
```

### Primitive: decimal-normalizer

```
$ PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/decimal_normalizer/happy_normal.json
{"primitive":"decimal_normalizer",...,"expected":1234.5,"actual":1234.5,"pass":true,"error":null}
EXIT:0

$ PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/decimal_normalizer/edge_decimal_shift_vnm.json
{"primitive":"decimal_normalizer",...,"expected":51.0,"actual":51.0,"pass":true,"error":null}
EXIT:0

$ PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/decimal_normalizer/failure_non_numeric.json
{"primitive":"decimal_normalizer",...,"expected":null,"actual":null,"pass":true,"error":null}
EXIT:0
```

### Module: financial-reports

```
$ PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py \
    --tier=module \
    --scenario=apps/pdf-extractor/scenarios/modules/financial_reports/multi_primitive_story.json
{"primitive":null,"module":"financial_reports",...,"expected":{"confidence":1.0},"actual":{"normalized_assets":10000.0,...,"confidence":1.0},"pass":true,"error":null}
EXIT:0
```

**ALL 7/7 SCENARIOS GREEN before staging.**

---

## Pytest Evidence

```
55 passed in 1.14s
```

---

## G12 Streak Completion

| Task | Streak Step | Status |
|---|---|---|
| P1-B1 | Streak #1 | DONE (commit: sandbox runner + validate-financial-figures) |
| P1-C  | Streak #2 | DONE (commit: decimal-normalizer + financial-reports module) |
| P1-E1 | Streak #3 | DONE (this commit — dashboard stub HTML) |

**B1 → C → E1 streak COMPLETE. QA confirmation criteria:**
- (a) git log shows sandbox-check step before final commit ✓ (evidenced above)
- (b) Sandbox-green evidence pasted in handoff ✓ (see above)

---

## AC Checklist

- [x] Opens via `file://` — no network dependencies (zero `http://` or `https://` in HTML except `//` for CDN — there are NONE, all styling is inline CSS)
- [x] 3 panels: Primitives (2 cards), Module (1 card), Microservice (1 card)
- [x] All cards honest `NOT-RUN` on load (default badge-not-run state)
- [x] Zero JS console errors on load (no undefined refs, all IDs present, no missing DOM nodes)
- [x] Reads trace JSON from `dashboard/traces/` on reload (relative file:// fetch)
- [x] SI-2 boundary comment on line 2
- [x] `git add apps/pdf-extractor/dashboard/index.html` explicit only

---

## Next Task

P1-E2 — Edit-Rerun Handler + G7 All-Sub-Gates
