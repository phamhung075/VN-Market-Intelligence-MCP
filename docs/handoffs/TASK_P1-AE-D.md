---
task_id: "P1-AE-D"
task_title: "Dashboard Stub: apps/alert-engine/dashboard/index.html (3-panel)"
pilot: "alert-engine"
phase: "1"
phase_task_plan: "docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md §P1-D"
owner: "dev-alert-engine"
zone: "apps/alert-engine/"
blocked_by: "P1-C DONE (alert_pipeline module stub exists — commit cd56dbd2; all 3 panel tiers can be represented)."
blocks: "P1-E"
goal_track: "B — Dashboard Trust Layer"
goals_advanced: ["G6 — Three-level dashboard renders (GENESIS)", "G8 — Honest-red contract (NOT-RUN honest)", "G9 — Dashboard trust contract (setup)", "G12 — Dev flow requires dashboard-green before done"]
estimated_effort: "2h"
ac_count: 7
wip: 1
---

# P1-D — Dashboard Stub: `apps/alert-engine/dashboard/index.html`

**Dispatched:** 2026-05-24 PM (after P1-C DONE signal verified — commit cd56dbd2; G2 module stub landed, sandbox total=11 pass=11 fail=0 status=OK)
**Owner:** dev-alert-engine
**Zone:** `apps/alert-engine/`
**Scope:** Create the three-panel HTML dashboard — the **G6 GENESIS** for alert-engine. Renders from scenario trace JSON, opens via `file://` with ZERO network calls / ZERO CDN / ZERO live DB / ZERO credentials. Honest NOT-RUN cold-open. SI-2 disavowal HTML comment baked in.

## Background

Three-panel HTML dashboard (the 3-panel standard per charter §G6). Renders from scenario trace JSON. `file://` works with zero network calls, zero CDN, zero live DB.

**SI-2 boundary (MANDATORY):** `apps/alert-engine/dashboard/index.html` is the ONLY dashboard file alert-engine creates. `docs/dashboards/index.html` is **stock-price-EXCLUSIVE** (per fleet ratification Decision 3 and charter §Anti-Scope-Creep Clause). An explicit HTML comment to this effect MUST appear in the dashboard source (see AC-6). alert-engine MUST NOT touch `docs/dashboards/index.html` during ANY phase of this pilot.

**Three panels:**
1. **Primitives panel** — one card per extracted primitive (minimum 3: `signal-classifier`, `dedup-key-builder`, `cooldown-gate`; 4 if P1-B4 shipped — it was SKIPPED, so 3 cards).
2. **Module panel** — one card for `alert_pipeline`.
3. **Microservice panel** — one card for the alert-engine service (port 5006 per system-map.json; displayed as a label, never hardcoded in fetch logic).

---

## Files to Create

1. `apps/alert-engine/dashboard/index.html` (CREATE — only file in this task)

> Do NOT create or modify `docs/dashboards/index.html` (SI-2, stock-price-EXCLUSIVE). Do NOT create or modify any other pilot's files.

---

## Acceptance Criteria (transcribed verbatim from plan §P1-D)

### AC-1: file:// standalone — zero external network
File opens via `file://` in a browser without any web server. Zero external CDN requests (no `<script src="https://...">`, no `<link rel="stylesheet" href="https://">`). Zero fetch calls to port 5006 or any HTTP endpoint. Zero `<img src="...">` to external URLs. Paste evidence to RETURN (grep for `https://`, `fetch(`, `http://` in the HTML = 0 external).

### AC-2: Three panels with correct card set
Three panels visible with the correct card set:
- **Primitives panel:** cards for `signal-classifier`, `dedup-key-builder`, `cooldown-gate` (and `duplicate-checker` if P1-B4 shipped — it was SKIPPED, so 3 cards) — all in NOT-RUN state.
- **Module panel:** card for `alert_pipeline` — NOT-RUN state.
- **Microservice panel:** card for `alert-engine` service, port 5006 cited as sourced from system-map.json.

### AC-3: Honest NOT-RUN cold-open (no false greens)
Status display is honest — NOT-RUN when sandbox has not been executed. No false greens. QA verifies by opening the HTML file cold (no prior sandbox run in the same browser session).

### AC-4: PO Playwright pre-compatibility
Dashboard renders correctly when opened via `file://`:
- ZERO console errors (verified manually or via Playwright dry-run).
- All cards (3 primitive + 1 module + 1 microservice) are present in the DOM.
- NOT-RUN status is displayed honestly.

### AC-5: Zero credentials in dashboard HTML
```bash
grep -c "TELEGRAM\|BOT_TOKEN\|CHAT_ID\|API_KEY\|SECRET\|TOKEN\|PASSWORD\|mattn" \
  apps/alert-engine/dashboard/index.html
```
Must return 0. Paste output to RETURN.

### AC-6: SI-2 disavowal comment baked in
The following HTML comment (verbatim or equivalent) MUST appear in `apps/alert-engine/dashboard/index.html`:
```html
<!-- SI-2 NOTE: This is apps/alert-engine/dashboard/index.html — alert-engine local service dashboard.
     SI-2 fleet index (docs/dashboards/index.html) is stock-price's G6 deliverable and is stock-price-EXCLUSIVE.
     alert-engine MUST NOT create or modify docs/dashboards/index.html. Do NOT merge. -->
```
Paste the rendered comment block from the file to RETURN.

### AC-7: G12 DoD Gate (green only after sandbox runs)
Sandbox all-green (all scenarios: B1+B2+B3 primitives + C module = 11) before any primitive card is allowed to show GREEN status in the HTML. Dashboard stub shows NOT-RUN for all cards — green state is only shown AFTER the sandbox runs and produces trace output. Confirm the green-card path is gated on real trace input, never hardcoded.

---

## Constraints & Gates

**SI-2 exclusion (HARD):**
- Only `apps/alert-engine/dashboard/index.html` is created. `docs/dashboards/index.html` (SI-2) is stock-price-EXCLUSIVE — alert-engine MUST NOT create or modify it. AC-6 bakes the disavowal comment.

**ZERO-CREDS / ZERO-NETWORK (HARD):**
- AC-1 (zero external network) + AC-5 (zero creds grep) enforce. No CDN, no fetch, no external img, no credential-shaped string.

**G8 honest-red:**
- AC-3 — NOT-RUN cold-open is honest. No false greens. Green only from real sandbox trace (AC-7).

**G9 setup:**
- AC-4 — PO Playwright pre-compat (zero console errors, all cards in DOM). Full G9 grade is Phase 2 PO Playwright (P2-K). This task only sets up renderability.

**G12 DoD Gate:**
- AC-7 — green-card path gated on real sandbox trace, never hardcoded. (P1-D is NOT a streak member — streak #1/#2/#3 = P1-B1/P1-B2/P1-B3 — but the DoD sandbox-green-before-green rule still binds.)

**Charter binding (Charter §4.5 + §ZERO-CREDS + §Anti-Scope-Creep + L-series):**
- §G6 calibration: 3-panel standard; this is the G6 GENESIS deliverable for alert-engine. SI-2 is NOT a G6 deliverable for alert-engine.
- §4.5 matrix authorship: `goalsEarned` stays 0; decisionMatrix untouched by dev. **NO goal flips.** dm-TBD.
- L84 explicit-file staging — `git add <path>` per file, NEVER `-A` or `.`.
- No `--force`/`--no-verify`/`--no-gpg-sign`/`git push`; no destructive git; all work on `main`, NO branches.
- Frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` must remain ancestor of HEAD.
- Do NOT touch other pilots, SI-2 (`docs/dashboards/index.html`), or DORMANT/CLOSED zones (apps/technical-analysis/**, apps/macro-indicators/**, apps/stock-price/**).
- Fleet-wide single-committer serialization active — verify `git diff --cached --name-only` clear of foreign paths before staging.

---

## RETURN Block

When dev-alert-engine marks this task DONE, include:

```
[TASK_P1-AE-D RETURN]
AC-1: file:// standalone, zero external network (grep https://|fetch(|http:// = 0 external) ✓
AC-2: Three panels — primitives (3 cards: signal-classifier/dedup-key-builder/cooldown-gate) + module (alert_pipeline) + microservice (alert-engine port 5006 label) ✓
AC-3: Honest NOT-RUN cold-open, no false greens ✓
AC-4: PO Playwright pre-compat — zero console errors, all cards in DOM, NOT-RUN honest ✓
AC-5: Zero-creds grep = 0 ✓
AC-6: SI-2 disavowal HTML comment baked in ✓
AC-7: G12 DoD — green-card path gated on real sandbox trace, never hardcoded ✓

Zero-network evidence:
<paste grep for https://, fetch(, http:// — 0 external>

Zero-creds grep output:
<paste grep -c ... = 0>

SI-2 disavowal comment (as rendered in file):
<paste the comment block>

Panel/card inventory:
<list panels + cards confirmed present in DOM>
```

---

## Signal

After DONE, emit `docs/signals/dev-alert-engine-P1-D-done-<UTCstamp>.json`:
```json
{
  "signal": "P1-D-done",
  "agent": "dev-alert-engine",
  "task": "P1-AE-D",
  "timestamp": "<ISO8601 UTC>",
  "commit": "<SHA first 7>",
  "anchor_intact": "debba8eaff0724d1fb32fc9d28640201cc32d1cc",
  "gates": {
    "AC1_file_standalone_zero_network": "PASS",
    "AC2_three_panels_correct_cards": "PASS",
    "AC3_honest_not_run_cold_open": "PASS",
    "AC4_po_playwright_precompat": "PASS",
    "AC5_zero_creds_grep_0": "PASS",
    "AC6_si2_disavowal_baked": "PASS",
    "AC7_g12_green_gated_on_trace": "PASS"
  },
  "next_actor": "pm",
  "next_action": "verify P1-D (dashboard stub 3-panel, G6 genesis + SI-2 disavowal), then sequence P1-E (edit-rerun handler + full G7 env audit)"
}
```

---

## Dependencies

- **Charter:** docs/architecture-briefs/2026-05-24-alert-engine-factory/pilot-charter.md
- **Phase 1 Task Plan:** docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md §P1-D
- **Previous task DONE signal:** docs/signals/dev-alert-engine-P1-C-done-20260524T055413Z.json (commit cd56dbd2)
- **SSOT:** docs/data/pilot-status-alert-engine.json (phase1.current_task = P1-D)
- **system-map.json:** port 5006 (internal==external) — query via jq, never hardcode
