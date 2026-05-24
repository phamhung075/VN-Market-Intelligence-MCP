---
date: "2026-05-24"
decision_id: "g9-stock-price-user-confirmation"
pilot: "stock-price"
phase: "2"
task_id: "P2-K"
g_goal: "G9"
path: "B (PO Playwright headless chromium)"
verdict: "PASS"
verdict_at: "2026-05-24T01:56:55Z"
verdict_by: "po"
g_goal_flips: "NONE — Charter §4.5 binding; G9 stays TBD until 12/12 terminal Phase-3 close"
charter_ref: "docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §G9, §4.5"
---

# G9 Dashboard-Trust Verification — stock-price (P2-K)

**Path:** B (PO Playwright headless chromium — Day-0 default, L6 short-circuit, no user wait required)

**Verdict:** PASS

**Target:** `file:///Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/stock-price/dashboard/index.html`

**Environment:** Playwright 1.60.0, chromium cached at `~/Library/Caches/ms-playwright` (chromium-1223). Runner launched real headless chromium against the `file://` URL. Runner exit code 0.

This was a **real headless-chromium run**, not a Path-A verbal substitute. The router pre-confirmed Playwright + cached chromium were available, so Path B was executed autonomously.

---

## AC-1: All 3 Panels Rendered

| Panel | DOM ID | Present | Rendered content |
|---|---|---|---|
| Primitives | `#primitives-panel-body` | YES | 3 primitive groups, 9 scenario cards |
| Module | `#module-panel-body` | YES | 2 module cards |
| Microservice | `#service-panel-body` | YES | 1 service card |

All three panels present in the DOM AND populated with rendered content (the panels are filled at runtime by the dashboard's `init()` renderer; cold body innerHTML is non-empty for all three).

**Note on selectors:** The original handoff template probed `[data-panel='...']` / `[data-card-type='...']` attribute selectors. The finalized dashboard (P2-I) does NOT use those attributes — it renders into the three `*-panel-body` element IDs (`primitives-panel-body`, `module-panel-body`, `service-panel-body`) and builds cards dynamically via JS. The runner was written against the actual DOM IDs (QA-confirmed) so the panel census reflects the real rendered tree, not a false negative from a stale selector. This is documented here for PM audit trail.

**AC-1 verdict: PASS**

---

## AC-2: ZERO Console Errors, Page Errors, Request Failures

| Signal | Count |
|---|---|
| console_errors | 0 |
| console_warnings | 0 |
| pageerrors | 0 |
| requestfailed | 0 |
| **total_issues** | **0** |

The dashboard is a self-contained `file://` asset (zero CDN, zero external fetch, all scenario data embedded inline). Zero failed network requests confirms the self-containment claim — there were no network requests to fail. No thrown exceptions, no console errors during render or after the 800ms post-init settle window.

**AC-2 verdict: PASS**

---

## AC-3: Honest Status Display (cold-open NOT-RUN, NO false greens)

The trust contract: a freshly-opened dashboard must NOT fabricate green. All scenarios initialize with `status: "not-run"` and the dashboard renders honest NOT-RUN state on cold open.

Cold-open status census (Playwright DOM query):

| Indicator | Count | Interpretation |
|---|---|---|
| `.dot-green` (green status dots) | **0** | No false-green scenario dots |
| `.dot-red` (red status dots) | **0** | No fabricated reds |
| `.dot-pending` (NOT-RUN dots) | 11 | 9 primitive + 2 module scenario dots — all honest NOT-RUN |
| `.status-green-label` (group GREEN) | **0** | No false-green group headers |
| `.status-red-label` (group FAIL) | **0** | — |
| `.status-pending-label` (group NOT-RUN) | 5 | 3 primitive groups + 2 module cards — all NOT-RUN |
| `.group-status` text values | `["NOT-RUN","NOT-RUN","NOT-RUN","NOT-RUN","NOT-RUN"]` | Every group reads NOT-RUN |
| `.not-run-badge` (service NOT-RUN) | 1 | Microservice card honestly NOT-RUN (sandbox runs no HTTP integration tests) |
| visible `.chip-green` summary | **0** | "passed" summary chips hidden on cold open |
| visible `.chip-red` summary | **0** | "failed" summary chips hidden |
| visible `.chip-notrun` summary | 2 | "9 NOT-RUN" + "2 NOT-RUN" chips shown |

**Zero false greens.** Every card and group displays NOT-RUN consistent with its cold-start execution state. The microservice card is correctly NOT-RUN (the P2-I sandbox does not run HTTP integration tests). This is exactly the G8/G9 honest-cold-start contract: the dashboard tells the truth about what has and has not been run.

**AC-3 verdict: PASS**

---

## AC-4: Verdict Recorded + Signal Emitted

- Decision doc: **this file** (`docs/po-decisions/2026-05-24-g9-stock-price-user-confirmation.md`).
- Signal: `docs/signals/po-sp-P2-K-g9-done-20260524T015655Z.json` with `next_actor: pm`.

**AC-4 verdict: PASS**

---

## Evidence — full Playwright runner output (verbatim)

Runner: throwaway CommonJS script at `/tmp/pw-g9-stockprice.cjs` (NOT committed — lives outside the repo). Invocation:
`cd /tmp && NODE_PATH=<npx-playwright-cache> node /tmp/pw-g9-stockprice.cjs` → exit code 0.

```json
{
  "path": "file:///Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/stock-price/dashboard/index.html",
  "console_errors": 0,
  "console_warnings": 0,
  "pageerrors": 0,
  "requestfailed": 0,
  "total_issues": 0,
  "panels_rendered": { "primitives": true, "module": true, "microservice": true },
  "census": {
    "primitiveGroups": 3,
    "primitiveScenarioCards": 9,
    "moduleCards": 2,
    "serviceCards": 1,
    "dotGreen": 0,
    "dotRed": 0,
    "dotPending": 11,
    "labelGreen": 0,
    "labelRed": 0,
    "labelPending": 5,
    "notRunBadges": 1,
    "notRunChipsVisible": 2,
    "greenChipsVisible": 0,
    "redChipsVisible": 0,
    "groupStatusTexts": ["NOT-RUN","NOT-RUN","NOT-RUN","NOT-RUN","NOT-RUN"]
  },
  "verdicts": {
    "AC-1_all_three_panels": true,
    "AC-2_zero_errors": true,
    "AC-3_honest_cold_open_no_false_green": true
  }
}
```

---

## Overall G9 Verdict: PASS

| AC | Verdict |
|---|---|
| AC-1 — all 3 panels rendered | PASS |
| AC-2 — zero console/page/request errors | PASS |
| AC-3 — honest cold-open NOT-RUN, no false greens | PASS |
| AC-4 — verdict recorded + signal emitted | PASS |

---

## G-Goal Posture (Charter §4.5 — BINDING)

P2-K produces the **G9 EVIDENCE/attestation only**. It does NOT flip G9.

- `goals[G9].status` stays **TBD**.
- `goalsEarned` stays **0**.
- `decisionMatrix` stays **all-TBD**.
- PO flips all 12 G-goals **atomically** at the terminal 12/12 Phase-3 close.

This decision does NOT mutate the PM-owned SSOT `docs/data/pilot-status-stock-price.json`. The PM updates the SSOT (mark P2-K DONE) on receipt of the emitted signal.

---

## Ratification

This decision attests that **G9 (dashboard trust contract) is verified via Path B (PO Playwright headless chromium)** for the stock-price pilot. The dashboard renders all three panels without any console error, page error, or failed request, and displays honest NOT-RUN status across every card and group on cold open — zero false greens. The G9 evidence verdict is **PASS**, which unblocks P2-L (G10 bug injection). No G-goal is flipped here per Charter §4.5.

**Verified by:** po · **at:** 2026-05-24T01:56:55Z
