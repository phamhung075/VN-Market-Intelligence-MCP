---
task_id: "P2-X4"
pilot: "macro-indicators"
title: "Dashboard data refresh — sync inline PRIMITIVES_DATA + MODULE_DATA + microservice panel to factory state"
owner: "dev-macro-indicators"
estimate_hours: 0.5
date_authored: "2026-05-23"
charter_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md §G6/G7"
handoff_context: "Path A triage (P2-C1 NO verdict) — dashboard inline data out of sync post-P2-X1/X2 primitives + module expansion"
blocker_signal: "docs/signals/po-p2-c1-macro-NO-20260523T150501Z.json"
po_decision_doc: "docs/po-decisions/2026-05-23-p2-c1-g9-playwright-trust-contract.md"
severity: "MEDIUM — blocks G9 flip until P2-X4 DONE + P2-C1 rerun GREEN"
---

# P2-X4 — Dashboard Data Refresh (dev-macro-indicators)

## Context

PO ran Playwright headless verification of the macro-indicators dashboard (P2-C1, G9 trust contract). Verdict: **NO** — dashboard is technically sound (zero console errors, zero page errors, zero network errors, all 3 panels present, NOT-RUN status honest) but **partially trustworthy** because only 1 of 6 primitives is visible on the dashboard.

**Root cause:** The dashboard's inline `PRIMITIVES_DATA` array (in `apps/macro-indicators/dashboard/index.html` ~line 928) was authored at Phase 1 with only `macro_investment_clock` (3 scenarios). When P2-X1 added 5 new primitives (oil, gold, usdvnd, carry, yield — 15 scenario JSON files total) and P2-X2 expanded the module to compose all 6 primitives, the dashboard's inline data block was never refreshed. The 5 new primitives exist in the backend; they are just not visible in the dashboard UI.

**G9 requirement (Charter §G9 Path B verbatim):**  
"all primitives + module + microservice cards rendered, NOT-RUN status honestly displayed"

1 of 6 ≠ "all primitives" → G9 FAIL under strict charter reading.

## Remediation Scope (P2-X4)

This task syncs the dashboard's inline JSON data blocks to match the current factory state (6 primitives + 1 module + microservice placeholder). **Zero backend logic changes.** No mutations to scenario JSON files themselves. No schema edits. Dashboard HTML inline data only.

## Acceptance Criteria

### AC-1: PRIMITIVES_DATA Contains All 6 Primitives

The inline `PRIMITIVES_DATA` array in `apps/macro-indicators/dashboard/index.html` must include fixture entries for all 6 primitives:
1. `macro_investment_clock` (already present from P1-E1)
2. `macro_oil_impact_classifier` (added by P2-X1)
3. `macro_gold_direction_classifier` (added by P2-X1)
4. `macro_usdvnd_direction_classifier` (added by P2-X1)
5. `macro_carry_trade_signal` (added by P2-X1)
6. `macro_yield_spread_signal` (added by P2-X1)

Verification: `grep -c '"primitive"' apps/macro-indicators/dashboard/index.html | awk '$1 >= 18 {exit 0} {exit 1}'` (≥18 entries for 6 primitives × 3 scenarios).

### AC-2: MODULE_DATA Contains macro-signals Module Entry

The inline `MODULE_DATA` array (or equivalent module panel data block) must include fixture entries for the `macro-signals` module wiring from P2-X2. Minimum 2 entries (golden + edge scenarios).

Verification: `grep -c '"module"' apps/macro-indicators/dashboard/index.html | awk '$1 >= 2 {exit 0} {exit 1}'`

### AC-3: Microservice Panel Body Populated (No "Loading…" Placeholder)

The `#microservice-panel` body currently shows `<p>Loading…</p>`. Replace with a microservice card template showing `macro-indicators` HTTP service status as NOT-RUN (honest, no live data — sandbox trace only).

Verification: `grep -q 'Loading…' apps/macro-indicators/dashboard/index.html && exit 1` (placeholder removed).

### AC-4: Dashboard Headless Render Shows All 6 Primitive Cards + Module Card

Re-run Playwright headless chromium against the dashboard:
```bash
cd /tmp && npx playwright@1.60.0 install && node verify-macro-dashboard.mjs
```

Expected output (counts):
- `primitive_groups_rendered: 6` (one per shipped primitive)
- `module_groups_rendered: 1`
- `microservice_panel_body_state: "Microservice card NOT-RUN"` (not "Loading…")

Paste Playwright output (full JSON or text summary) to the handoff file `## Evidence` section.

### AC-5: Red/Green Honesty Contract Still Holds (Zero False Positives)

Run sandbox with all 3 tiers:
```bash
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
```

Expected: `total=20 pass=20 fail=0 status=OK exit 0`.

Open the dashboard in a browser (or headless) → all 18 primitive cards + 2 module cards should show NOT-RUN (honest, no red or green since sandbox just reports counts — dashboard doesn't auto-fetch trace). G8 honest-red contract (proven in P2-F1) still holds: corrupted scenarios → RED, golden → GREEN (when sandbox runs with real data).

### AC-6: Zero Code Changes Outside `apps/macro-indicators/dashboard/`

Forbidden zones:
- Do NOT modify `apps/macro-indicators/pkg/` (no Go changes)
- Do NOT modify `apps/macro-indicators/cmd/` (no Go changes)
- Do NOT modify `docs/scenarios/macro-indicators/` (JSON fixtures frozen)
- Do NOT modify `.golangci.yml` or other config (G4 fence locked)

Verification: `git diff --name-only HEAD~1 | grep -v "apps/macro-indicators/dashboard/" | wc -l` should be 0.

### AC-7: G12 DoD Gate — Sandbox 20/20 Immediately BEFORE Commit

Run sandbox one final time before committing:
```bash
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
```

Must exit 0 with `total=20 pass=20 fail=0 status=OK`.

Paste output to handoff file `## Evidence` section.

## Implementation Strategy

1. **Extract current PRIMITIVES_DATA structure** from `apps/macro-indicators/dashboard/index.html` (already present for macro-investment-clock).

2. **Read 15 new primitive scenario JSON files** from Phase 2 P2-X1:
   - `docs/scenarios/macro-indicators/primitives/macro-oil-impact-classifier-{golden,edge,failure}.json`
   - `docs/scenarios/macro-indicators/primitives/macro-gold-direction-classifier-{golden,edge,failure}.json`
   - `docs/scenarios/macro-indicators/primitives/macro-usdvnd-direction-classifier-{golden,edge,failure}.json`
   - `docs/scenarios/macro-indicators/primitives/macro-carry-trade-signal-{golden,edge,failure}.json`
   - `docs/scenarios/macro-indicators/primitives/macro-yield-spread-signal-{golden,edge,failure}.json`

3. **Mirror each JSON scenario into PRIMITIVES_DATA** with the same shape as macro-investment-clock entries:
   ```javascript
   {
     "name": "<scenario-name>",
     "primitive": "<primitive-package>",
     "filename": "<filename>",
     "category": "golden|edge|failure",
     "description": "<description-from-json>",
     "input": { /* from JSON */ },
     "expectedOutput": { /* from JSON */ },
     "shouldPass": true|false,
     "status": "NOT-RUN"
   }
   ```

4. **Read P2-X2 module scenario JSON files** (`docs/scenarios/macro-indicators/module/`) and append corresponding objects to `MODULE_DATA`.

5. **Create microservice panel card** in the `#microservice-panel` body:
   ```html
   <div class="card">
     <h4>macro-indicators</h4>
     <p class="status not-run">NOT-RUN</p>
     <p class="detail">HTTP service sandbox — no live data</p>
   </div>
   ```
   (Adapt HTML structure to match existing primitive/module card templates.)

6. **Verify syntax** — ensure all JSON is valid (no trailing commas, proper quote escaping).

7. **Test headless** — run Playwright script to confirm 6 primitive cards + 1 module card + 1 microservice card render.

8. **Sandbox final gate** — `go run ./cmd/sandbox -tier=all...` must exit 0.

## Files to Modify

- **ONLY:** `apps/macro-indicators/dashboard/index.html`
  - Edit inline `PRIMITIVES_DATA` array (append 15 new entries for oil, gold, usdvnd, carry, yield)
  - Edit inline `MODULE_DATA` array (append module entries if not already present from P1-D2)
  - Edit `#microservice-panel` body (replace "Loading…" placeholder with microservice card)

## Files to NOT Modify

- `apps/macro-indicators/pkg/` (zero code changes)
- `apps/macro-indicators/cmd/` (zero code changes)
- `docs/scenarios/macro-indicators/` (JSON fixtures stay frozen)
- `docs/data/pilot-status-macro-indicators.json` (SSOT — PM only)
- `.golangci.yml` or `.github/workflows/` (G4 fence locked)

## Hard Gates (BINDING)

| Gate | Enforcement |
|------|-------------|
| **G12 DoD** | `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all` must exit 0 before DONE |
| **AC-4 Playwright** | Dashboard renders 6 primitive cards + 1 module card + 1 microservice card (Playwright headless chromium verified) |
| **AC-6 zone ban** | Only `apps/macro-indicators/dashboard/index.html` modified; zero changes to pkg/, cmd/, scenarios/, config |
| **L84 staging** | `git add apps/macro-indicators/dashboard/index.html` (explicit path, never `-A` or `.`) |
| **Anchor 1776df8e** | `git log --ancestry-path 1776df8e..HEAD | tail -1` returns non-empty (held throughout) |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` |

## Constraints

- **No logic changes** — dashboard is a dumb renderer. No new logic, no new handlers, no new endpoints.
- **Fixture data only** — all data is frozen JSON from docs/scenarios/ (P1/P2 deliverables).
- **No scenario mutations** — you read scenario JSON files but never modify them.
- **No charter edits** — decisionMatrix stays TBD per §4.5 (PO-only at 12/12 close).
- **No task-plan edits** — this task is inline insertion into Phase 2; no plan rewrite needed.

## Commit Pattern

```
refactor(macro-indicators): P2-X4 — dashboard data refresh (6 primitives + module + microservice)
```

**No `--force`, no `--no-verify`, no `--no-gpg-sign`.**

## After DONE (PM Responsibility)

1. PM closes P2-X4 in SSOT (status DONE, signal ref, timestamp).
2. PM **re-dispatches P2-C1** to PO for Playwright headless re-verify (same P2-C1-macro.md handoff, same 4 ACs, rerun the recipe).
3. On PO's second P2-C1 run: if PASS → PO flips G9 TBD → YES + appends evidence to existing decision doc (no new ceremony).
4. PM flips G9 status in SSOT (6 → 7 goals earned) only after P2-C1 rerun PASS signal received.

## Evidence to Record

### Playwright Output (AC-4)

[Paste Playwright headless chromium output showing 6 primitive cards rendered, 1 module card, 1 microservice card]

### Sandbox Final Gate (AC-7)

[Paste `go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all` output]

```
total=20 pass=20 fail=0 status=OK
```

### File Diff Summary (AC-6)

[Paste output of `git diff --name-only HEAD~1`]

Should show ONLY:
```
apps/macro-indicators/dashboard/index.html
```

---

## RETURN

**Task:** P2-X4 (Dashboard data refresh — PRIMITIVES_DATA + MODULE_DATA + microservice panel sync)  
**Owner:** dev-macro-indicators  
**Estimate:** 30 minutes  
**AC count:** 7 (all primitives, module, microservice, Playwright headless, honesty holds, zone ban, G12 DoD gate)  
**Hard gates:** G12 sandbox 20/20 + Playwright 6 primitive cards rendered + AC-6 zone ban + L84 staging + anchor held  
**Commit:** `refactor(macro-indicators): P2-X4 — dashboard data refresh (6 primitives + module + microservice)`  
**Blocker signal:** P2-C1 NO verdict (PO Playwright, 1/6 primitives rendered)  
**Next:** P2-C1 rerun (PO Playwright verify after P2-X4 DONE + QA GREEN) → G9 flip YES (6 → 7/12 goals)  
**WIP:** 1 (dev-macro-indicators on P2-X4 only)  
**Charter:** Verbatim G9 acceptance = "all primitives + module + microservice cards rendered"
