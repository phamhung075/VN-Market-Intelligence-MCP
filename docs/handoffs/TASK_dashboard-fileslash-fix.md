---
sprint: "P2-REOPEN"
branch: "main"
size: "S"
zone: "apps/pdf-extractor/"
depends_on: []
blocks: []
---

# TASK — Dashboard file:// False-Green Repair

**Owner:** qa
**Blocked by:** nothing (impl committed)
**Est. effort:** 5 minutes
**AC count:** 5

## TLDR

Fix a false-green in the pdf-extractor sandbox dashboard: every card showed NOT-RUN when `index.html` was opened by double-click (`file://`), even though all trace JSONs existed on disk. Root cause: `fetch()` of relative paths is blocked by Chrome/Safari under `file://` (opaque/null origin). Fix switches to a JS sidecar (`dashboard/traces.js`) loaded via `<script src>`, which is not subject to the CORS restriction.

## [Developer] Implementation Summary

**Commit:** `a9fdf056` on `main`

**Files changed (4, all in `apps/pdf-extractor/`):**
- `dashboard/index.html` — removed `fetch()`-based loader; added `<script src="traces.js">` in `<head>` with `onerror` fallback; replaced `loadTrace(entry)` async function with synchronous `loadAllTraces()` that reads `window.__TRACES[entry.id]`; updated rerun panel instructions; updated footer (claim now factually true)
- `dashboard/traces.js` — new auto-generated sidecar: `window.__TRACES = {...}` with all 8 card-id keys in kebab-case
- `sandbox/gen_traces_js.py` — new Python script that reads all `dashboard/traces/<tier>/*.json` and regenerates `dashboard/traces.js`; called by `rerun.sh` after every `runner.py` invocation
- `sandbox/rerun.sh` — appended call to `gen_traces_js.py` after trace JSON write

**SI-2 boundary:** preserved (comment line 2 unchanged, all changes in `apps/pdf-extractor/` only).

**G12 evidence:**
- `python3 -m pytest apps/pdf-extractor/ -q` → 114 passed, 0 failed
- All 7 canonical primitive+module sandbox scenarios GREEN
- Service-tier placeholder: `pass=null` → renders NOT-RUN (honest)
- 6 intentional-RED known_bad fixtures: `pass=false` → render FAIL (honesty preserved)
- Security clause: `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD|VPS_|VINAHOST|PDF_EXTRACTOR_DB"` → empty

## [QA] Acceptance Criteria

### AC-1 — Double-click renders PASS badges

Open `apps/pdf-extractor/dashboard/index.html` by double-clicking it in Finder (Chrome, `file://` URL). All 6 primitive cards and the financial-reports module card must show green PASS badges. The pdf-extractor service card must show NOT-RUN (honest placeholder). No server needed.

**Verify:** `window.__TRACES` exists in DevTools console (type it in Console) → object with 8 keys. All 7 non-service entries have `pass: true`; pdf-extractor entry has `pass: null`.

### AC-2 — Missing traces.js → all NOT-RUN (honest fallback)

Rename `dashboard/traces.js` temporarily to `dashboard/traces.js.bak`, reload the page via double-click. All cards must show NOT-RUN. Restore the file.

**Verify:** The `onerror` handler on `<script src="traces.js">` sets `window.__TRACES = {}`, so no card shows PASS without the sidecar.

### AC-3 — 6 intentional-RED honesty fixtures show FAIL

Using the browser, open any `scenarios/primitives/*/known_bad_*.json` file and confirm `"pass": false`. These traces are NOT in the dashboard sidecar (dashboard only holds the canonical happy-path trace per card). The dashboard card shows the last-run trace (which is the canonical PASS scenario). Honesty fixtures are accessible by running:

```bash
PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py \
  --tier=primitive \
  --scenario=apps/pdf-extractor/scenarios/primitives/confidence_scorer/known_bad_score_wrong.json
```

Expected output: `"pass": false`. Dashboard does not display honesty fixture traces — they are standalone runner evidence only.

### AC-4 — Edit-rerun cycle still works

1. Edit `scenarios/primitives/validate_financial_figures/happy.json` — change `"expected": 1.0` to `"expected": 0.0`.
2. Run from repo root:
   ```bash
   PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh \
     --tier=primitive \
     --scenario=apps/pdf-extractor/scenarios/primitives/validate_financial_figures/happy.json
   ```
3. Reload `index.html` in the browser (Cmd+R or re-open by double-click).
4. The `validate-financial-figures` card must show red FAIL.
5. Restore `"expected": 1.0`, re-run `rerun.sh`, reload → card shows green PASS.

**Verify:** `rerun.sh` writes `dashboard/traces/primitive/validate_financial_figures.json` AND regenerates `dashboard/traces.js`. The regenerated `traces.js` is what the browser reads on reload.

### AC-5 — Footer claim is factually true

In the rendered page, the footer must read (verbatim or equivalent):
> Traces compiled into `dashboard/traces.js` by `sandbox/rerun.sh` (source: `dashboard/traces/<tier>/`). Loaded via `<script src>` — zero network calls, works under `file://` (double-click).

No mention of "fetch" in the footer. Network tab in DevTools must show zero external requests.

## Developer Handoff — Notes for QA

- `dashboard/traces.js` is committed to the repo alongside the trace JSONs. This is intentional: the sidecar is a build artifact of the sandbox runner, not a runtime-generated file. It must be in the repo so double-click works without any prior rerun.
- If QA runs the sandbox in a clean clone and the `traces.js` is absent (e.g. gitignored later), all cards will show NOT-RUN — that is the honest default. Currently `traces.js` is NOT in `.gitignore`.
- The `onerror` attribute on `<script src="traces.js">` sets `window.__TRACES = {}` as fallback if the file is missing — this prevents the main script from crashing on `window.__TRACES` being undefined.
- Playwright G9 contract test (`trust-contract.spec.js`) runs over `http://localhost:9999` and is unaffected — the `<script src>` approach is also compatible with http serving.
