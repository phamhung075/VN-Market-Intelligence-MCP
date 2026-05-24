# PO Decision — G9 Dashboard-Trust Evidence (kinh-dich GO reboot, pilot-4) via Playwright Path B

- **Date (UTC):** 2026-05-24T09:11:00Z
- **Task:** P2-I (Phase 2, kinh-dich-service — Go reboot)
- **Plan:** `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-2-task-plan-go.md` (§P2-I, 4 ACs)
- **Decision maker:** PO (full autonomy; no user delegation)
- **Path:** Path B — PO Playwright 1.60.0 + cached headless chromium rev 1223 (Day-0 default per charter §G9 / L6)
- **TS-era precedent:** `docs/po-decisions/2026-05-24-g9-kinh-dich-playwright-trust.md` (P2-KD-L). That run
  was against the TS dashboard and is **superseded** for the Go reboot. This doc is the Go analog.
- **§4.5 binding:** This task produces **G9 EVIDENCE only**. It does NOT flip G9 (terminal Phase-3 only).
  PM-owned SSOT `docs/data/pilot-status-kinh-dich.json` was **NOT edited**. G9 = **EARNED-PENDING**.

---

## Why a Go re-confirm was required

The Go reboot rebuilt `apps/kinh-dich-service/dashboard/index.html` to load REAL sandbox traces
(dev commit `85cabdbe`: `cmd/sandbox -emit-traces` → `dashboard/sandbox-traces.js` →
`<script src="sandbox-traces.js">` loads on cold open). The honest-green contract is now driven by
an auto-generated trace file that reflects an actual `CGO_ENABLED=0` sandbox execution — never
hardcoded. The TS-pilot G9 (P2-KD-L) cannot vouch for this new artefact, so G9 is re-proven here on
the Go dashboard in its **real green** state (post-sandbox-run, not cold-open NOT-RUN).

---

## AC-1 — Real green state regenerated (PASS)

```bash
cd apps/kinh-dich-service && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -scenario=all -emit-traces
```
Output: `Passed: 17/17` · `All scenarios GREEN` · exit 0.
Traces emitted to `dashboard/sandbox-traces.js`:
- `generatedAt: 2026-05-24T09:09:08Z`
- `commitHash: c2ca404a`
- `summary: { total: 17, passed: 17, failed: 0 }` (15 primitive + 2 module)

The regen diff vs the dev-committed trace (`85cabdbe`) is provenance-only (timestamp + commit hash);
the 17-pass status payload is identical. This is the honest-green regeneration the AC requires.

## Method (HONEST, reproducible)

- Target: `file:///.../apps/kinh-dich-service/dashboard/index.html`
- Throwaway CJS runner (NOT committed; **deleted post-run**): `require('playwright')` resolved via
  `NODE_PATH=/Users/admin/.npm/_npx/e41f203b7505f1fb/node_modules`,
  `PLAYWRIGHT_BROWSERS_PATH=/Users/admin/Library/Caches/ms-playwright`.
- The `e41f203…` Playwright 1.60.0 module aligns with cached chromium revision **1223**
  (browserVersion 148.0.7778.96) and launched headless chromium cleanly (same module that worked
  in the TS-pilot G9 run; the `0b9ff77…` module expected an absent rev and was not used).
- **Selectors inspected from the ACTUAL DOM, not assumed.** Real selectors:
  `#primitives-panel-body` / `#module-panel-body` / `#service-panel-body` (panels);
  `.scenario-status-dot.dot-green/.dot-red/.dot-pending` (status dots);
  `#provenance-block` (visible block) with `#prov-timestamp` + `#prov-commit`;
  `text=5 pure Go functions` label; primitive-name code spans.
- 2.5 s settle applied after `networkidle` before DOM query (cards are JS-rendered into the panel
  bodies). `dotClass()` returns `dot-pending` for any non-`pass`/`fail` status, so a false-green
  would surface as a `.dot-green` count not backed by a passing trace.

## Raw Playwright run result (AC-2 / AC-3)

```json
{
  "panels":   { "primitives": 1, "module": 1, "microservice": 1 },
  "cards":    { "primitivesCards": 15, "moduleCards": 12, "serviceCards": 4 },
  "fivePrimitivesLabel": 1,
  "primitiveNames": { "hao_encoder": 3, "hexagram_resolver": 3, "ngu_hanh_classifier": 3,
                      "reading_scorer": 2, "nuclear_hexagram": 3 },
  "dots":     { "green": 17, "red": 0, "pending": 0 },
  "provenance": { "display": "block", "generatedAt": "2026-05-24T09:09:08Z", "commitHash": "c2ca404a" },
  "tsBunResidue": { "language_eq_ts": 0, "runtime_eq_bun": 0, "historical_reboot_note": 1 },
  "errors":   { "consoleErrors": [], "pageErrors": [], "requestFailed": [] }
}
```

- **consoleErrors=0 · pageErrors=0 · requestFailed=0**
- **3 panels render** (Primitives / Module / Microservice).
- **17 status dots GREEN, 0 RED, 0 PENDING** — honest: the green reflects the real passing sandbox
  run loaded from `sandbox-traces.js` (commit c2ca404a), NOT hardcoded.
- All **5 primitive names** present + "**5 pure Go functions**" label rendered (1).
- **Provenance line present and visible** (`display: block`): generatedAt `2026-05-24T09:09:08Z`
  + commitHash `c2ca404a`.
- **Zero ts/bun residue**: `language=ts`=0, `runtime=bun`=0. The single "TypeScript/Bun" string is
  the **honest historical reboot note** ("Service rebooted from TypeScript/Bun to Go 1.22 per user
  directive 2026-05-24") — truthful provenance, not misleading residue. It is correctly preserved.

## Corroborating independent render proof (dash-check.mjs)

The Go-native headless DOM inspector independently confirms the same state:
```
DASH-CHECK-RESULT: {"service":"kinh-dich","dotsGreen":17,"dotsRed":0,"dotsPending":0,
  "jsErrors":0,"pageErrors":0,
  "categoryChips":{"Valid Input":6,"Edge Case":6,"Bad Input -> Error":5},
  "badLabels":[],"verdict":"PASS"}
[dash-check] PASS — 17 green dots, 0 red, 0 errors, all category labels valid
```
Two independent render engines (PO Playwright 1.60 + dash-check.mjs) agree: 17 GREEN / 0 RED /
0 PENDING / 0 errors / PASS.

---

## AC Verdicts

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| **AC-1** | Real green state regenerated, 17/17 GREEN | **PASS** | `-emit-traces` run exit 0, 17/17 GREEN, traces commit c2ca404a |
| **AC-2** | Zero console errors / page errors / request failures via headless chromium | **PASS** | consoleErrors=0, pageErrors=0, requestFailed=0 |
| **AC-3** | All 3 panels + ≥5 primitive cards + module + microservice; 17 honest GREEN dots; provenance line; "5 pure Go functions"; zero ts/bun residue | **PASS** | panels 1/1/1; 15 primitive + 12 module + 4 service card-class nodes; 5 primitive names; label=1; dots 17G/0R/0P; provenance visible (genAt+commit); language=ts/runtime=bun=0 |
| **AC-4** | Trust-contract proof: a non-technical user can verify "the hexagram engine is working correctly" from the dashboard alone | **PASS** | 17 green dots, honest auditable provenance (timestamp + commit), all 3 panels, zero errors — green is real (sandbox-backed), not cosmetic |

## Overall P2-I / G9 verdict: **PASS (Path B evidence complete — no RED findings)**

The Go-reboot dashboard is an honest user-facing trust contract: it renders fully, throws zero
runtime errors, shows 17 GREEN dots that are auditable back to a real `CGO_ENABLED=0` sandbox run
(provenance: commit c2ca404a, 2026-05-24T09:09:08Z), and carries zero misleading TS/Bun residue.

**G9 = EARNED-PENDING.** No goal flip. Goals flip atomically at the terminal Phase-3 close
(Charter §4.5). `docs/data/pilot-status-kinh-dich.json` was NOT touched.

---

## Boundary discipline

- Committed: **this decision doc + the regenerated `dashboard/sandbox-traces.js`** (AC-1 honest-green
  proof state) ONLY. Pathspec-scoped.
- NOT committed / NOT touched: `/tmp` Playwright runner (deleted), `dashboard/index.html` (read-only),
  `docs/data/pilot-status-kinh-dich.json` (PM SSOT — §4.5 terminal-only), other pilots, SI-2
  (`docs/dashboards/index.html`), `render-check.png` (pre-existing untracked artefact — left alone).
- Explicit per-path staging (L84); no `git add -A`/`.`; no `git reset HEAD` of foreign paths;
  no `--amend`/`--force`/`--no-verify`/`--no-gpg-sign`/`git push`; all on `main`.

## Next

- **next_actor: qa** — verify P2-I (G9 evidence), then sequence **P2-J** (`kinh-dich-pre-inject-go`
  tag + G10 single-literal bug injection into `pkg/primitive/hao_encoder/hao_encoder.go`
  `THIEU_DUONG_THRESHOLD` 0.10→0.25).
