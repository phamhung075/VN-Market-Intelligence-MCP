---
task: "P2-K"
pilot: "alert-engine"
phase: "2"
goal: "G9"
goal_title: "Dashboard is the trust contract — short-circuit via PO Playwright (Day-0 default, L6)"
owner: "po"
blocked_by: "P2-J DONE"
blocks: "P2-L"
status: "SEQUENCED"
sequenced_at: "2026-05-24T080002Z"
ac_count: 4
---

# TASK P2-K — G9 PO Playwright Path B (Chromium-Headless-Shell, TCC-Staged)

**Pilot:** alert-engine (fleet pilot 5)  
**Phase:** 2  
**Owner:** po  
**Blocked by:** P2-J DONE (dashboard honest-red proven — trust contract can now be verified)  
**Acceptance criteria count:** 4  

---

## Background

Charter §G9 Path B is the Day-0 default (L6 lesson). No synchronous user wait required. PO runs Playwright chromium-headless-shell against the per-service dashboard (`apps/alert-engine/dashboard/index.html`). Path B carries equal weight to Path A (user verbal YES). If user is available at this point, PO may substitute Path A — either path satisfies G9.

---

## Acceptance Criteria (Transcribed Verbatim from phase-2-task-plan-go.md §P2-K)

### AC-1: PO runs Playwright headless chromium against file://

PO runs Playwright headless chromium against `file://apps/alert-engine/dashboard/index.html` (TCC-staged via Terminal.app per L87 precedent). All 3 panels (primitives, module, microservice) are rendered in the DOM.

**Evidence placeholder:**
```
[PO to paste: Playwright script output showing file:// load succeeded, 3 panels found in DOM]
```

---

### AC-2: Zero console errors, zero pageerrors, zero requestfailed

ZERO console errors, ZERO pageerrors, ZERO requestfailed in Playwright log.

**Evidence placeholder:**
```
[PO to paste: Playwright browser log excerpt — console, pageerrors, requestfailed counts all zero]
```

---

### AC-3: All primitive cards + module card + microservice card visible

All primitive cards (≥3: signal-classifier, dedup-key-builder, cooldown-gate) + module card (alert_pipeline) + microservice card (alert-engine) are visible in the DOM. Status displayed honestly (cards show state from last sandbox run; NOT-RUN cards do not show false GREEN).

**Evidence placeholder:**
```
[PO to paste: DOM query results showing all 6 cards present (3 primitive + 1 module + 1 microservice + system info)]
[PO to paste: screenshot or DOM state description confirming NOT-RUN honesty (no false-green)]
```

---

### AC-4: PO records verdict in po-decisions + emits signal

PO records verdict in `docs/po-decisions/<date>-g9-alert-engine-user-confirmation.md` per charter §G9 Path B template. Fields: `pilot: alert-engine`, `path: B (PO Playwright)`, `verdict: PASS` (or FAIL if any AC fails). Emits `docs/signals/po-ae-P2-K-g9-done-<UTC>.json`.

**Expected files:**
- `docs/po-decisions/2026-05-24-g9-alert-engine-user-confirmation.md` (verdict doc)
- `docs/signals/po-ae-P2-K-g9-done-<UTC>.json` (signal with AC verdicts)

**Verdict doc template:**
```markdown
---
pilot: alert-engine
path: B (PO Playwright)
verdict: PASS
verified_at: <UTC timestamp>
verified_by: po
dashboard_file: apps/alert-engine/dashboard/index.html
playwright_version: <version used>
---

# G9 Verification — alert-engine Dashboard Trust Contract

**Playwright Run Results:**
- File load: file://apps/alert-engine/dashboard/index.html opened successfully
- DOM panels: 3 panels rendered (primitives, module, microservice)
- Console errors: 0
- Page errors: 0
- Request failures: 0
- All cards visible and status honest (no false-green)

**Verdict:** PASS

**Notes:**
[PO to include any observations, e.g., which scenario cards showed from last sandbox run]
```

**Signal JSON template:**
```json
{
  "signal": "po-ae-P2-K-g9-done",
  "task": "P2-K",
  "pilot": "alert-engine",
  "phase": "2",
  "goal": "G9",
  "status": "DONE",
  "timestamp": "<UTC>",
  "path": "B (PO Playwright)",
  "ac_verdicts": {
    "AC-1": "PASS — 3 panels rendered in DOM",
    "AC-2": "PASS — zero console/page/request errors",
    "AC-3": "PASS — all 6 cards visible (3 primitive + 1 module + 1 microservice) with honest status",
    "AC-4": "PASS — verdict doc + signal emitted"
  },
  "dashboard_url": "file://apps/alert-engine/dashboard/index.html",
  "playwright_log": "[PO to paste excerpt of key log lines]",
  "g9_goal_status": "EARNED-PENDING (evidence complete; PO flips at Phase-3 terminal 12/12 close)",
  "next_actor": "pm",
  "next_task": "P2-L — G10 bug injection"
}
```

---

## Execution Notes

1. **TCC-staged via Terminal.app:** If using Playwright headless mode, launch via Terminal.app to ensure chromium-headless-shell binary is available. If binary unavailable, fall back to `playwright install chromium` and retry.
2. **File:// load safety:** The dashboard is self-contained (zero CDN/fetch). File:// load should work immediately.
3. **Path A override:** If user is synchronously available, PO may substitute Path A (user verbal YES) for Path B — both paths are equivalent for G9 gate.
4. **Honest NOT-RUN state:** If no sandbox run has executed since last dashboard open, scenario cards will show "NOT-RUN". This is honest and acceptable. Do NOT force-green these cards.
5. **No goal flips:** This task produces NO goal state changes. §4.5 SSOT fields remain frozen. G9 evidence completes but does NOT flip to YES; PO flips at Phase-3 terminal 12/12 atomic close only.

---

## Key Constraints (Inherited from Phase 2)

| Constraint | Rule |
|---|---|
| **G9 Path B is Day-0 default** | L6 lesson; Path A (user verbal) is substitute only |
| **File:// only** | No external CDN/fetch/image URLs — dashboard is standalone |
| **Honest status display** | Cards show state from last sandbox run; NOT-RUN ≠ false-green |
| **Zero credentials** | No TELEGRAM_, BOT_TOKEN, API_KEY, etc. in HTML source |
| **SI-2 boundary** | Dashboard file is `apps/alert-engine/dashboard/index.html` ONLY; `docs/dashboards/index.html` is stock-price-EXCLUSIVE |
| **No goal flips** | G9 evidence completes; PO flips verdict at Phase-3 12/12 terminal only. §4.5 SSOT freeze remains binding. |
| **Anchor frozen** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` must remain ancestor of all commits in this task |

---

## Handoff Signal Fields (for PM automated dispatch confirmation)

After completing all 4 ACs, PO emits a signal with these fields:
- `task`: `P2-K`
- `pilot`: `alert-engine`
- `phase`: `2`
- `status`: `DONE`
- `path`: `B (PO Playwright)`
- `verdict`: `PASS` or `FAIL`
- `ac_verdicts`: all 4 ACs with PASS/FAIL
- `next_actor`: `pm`
- `next_task`: `P2-L`

---

## Summary

P2-K is the G9 "trust contract" verification gate for alert-engine. PO runs a headless Playwright test against the per-service dashboard, confirms all 3 panel types render, confirms zero console/page/request errors, and confirms all cards display their actual state honestly (no false-green). Path B (headless Playwright) is the Day-0 default and carries equal weight to Path A (user verbal); either satisfies G9. Once verdict is recorded, PM dispatches P2-L (G10 bug injection).
