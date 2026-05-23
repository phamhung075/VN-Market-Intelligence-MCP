---
task_id: P2-C1
title: "G9 PO Playwright Short-Circuit (Path B Default)"
owner_agent: po
goal_linkage:
  - G9 (Dashboard is the trust contract — Playwright headless verification)
pre_conditions:
  - P2-F1 DONE (G8 honest-red proven, sandbox all-tier 20/20 green, dashboard live)
  - Charter §G9 Path B (PO Playwright) is Day-0 default (L6 lesson baked in; no synchronous user wait)
  - Anchor 1776df8e held as ancestor
critical_path: true
estimate_hours: 0.5
ac_count: 4
---

# TASK P2-C1 — G9 PO Playwright Short-Circuit (Path B Default)

**Goal advancement:** G9 verification via PO Playwright headless chromium (Path B). Prove the dashboard is trustworthy and usable by demonstrating that:
1. All 3 dashboard panels (primitives, module, microservice) render correctly
2. No console errors, page errors, or network failures
3. All status indicators (PASS/FAIL/NOT-RUN) are honestly displayed
4. PO verifies this via Playwright headless-shell (no GUI, CI/CD ready)

**Background:** Charter §G9 inherited from TA pilot (cycle-19 lesson L6). Original G9 required synchronous user verbal confirm, which blocked the pilot for cycles 15-18. User delegated verification to PO via Playwright, and that short-circuit became the Day-0 default for macro-indicators. Path B (PO Playwright) is equal-weight to Path A (user verbal). No user async-wait needed.

**DDD zone:** `apps/macro-indicators/dashboard/index.html` (read-only verification; no source mutations)

---

## Acceptance Criteria

**AC-1: Playwright Headless Execution Against Dashboard File**

1. Install Playwright (if not present): `npm install --save-dev @playwright/test`
2. Create a simple Playwright test script that:
   - Loads `file://apps/macro-indicators/dashboard/index.html` (via file:// protocol, no localhost server needed)
   - Navigates to the page
   - Waits for DOM to stabilize (e.g., `waitForLoadState('domcontentloaded')`)
3. Run the test via Playwright headless-shell: `npx playwright test --reporter=json`
4. Verify the test completes without crash or timeout

**Proof required:**
- Playwright test file path and command invoked
- Playwright JSON report showing test status (PASS or FAIL)
- If FAIL, include error message (should be PASS for dashboard)

---

**AC-2: Zero Console Errors, Zero Page Errors, Zero Network Failures**

The Playwright test must capture and assert:
- `page.on('console', ...)` — log all console messages
- `page.on('pageerror', ...)` — log any uncaught exceptions
- `page.on('requestfailed', ...)` — log any failed network requests

Assertions:
- No error-level console messages
- No pageerror events fired
- No requestfailed events (file:// protocol should have zero network calls anyway)

**Proof required:**
- Playwright console/pageerror/requestfailed logs pasted to evidence (should be empty or info-only, zero errors)
- Screenshot or terminal output of Playwright test result showing "0 errors"

---

**AC-3: All Dashboard Panels Rendered + Status Honestly Displayed**

The Playwright test must locate and verify DOM elements:

1. **Primitives panel:** Locate all 6 primitive cards:
   - `#macro-investment-clock`, `#macro-oil-impact-classifier`, `#macro-gold-direction-classifier`, `#macro-usdvnd-direction-classifier`, `#macro-carry-trade-signal`, `#macro-yield-spread-signal`
   - Assert each card element exists in the DOM (not hidden)
   - Assert each has a status indicator (PASS, FAIL, or NOT-RUN)

2. **Module panel:** Locate module card:
   - `#macro-signals` (the composition module)
   - Assert it exists and has a status indicator

3. **Microservice panel:** Locate microservice card:
   - `#macro-indicators-service` (or equivalent naming)
   - Assert it exists and has a status indicator

4. **Status honesty:** For each card:
   - If status is NOT-RUN (dashboard not yet polled sandbox), card class should NOT include 'green' (no false greens)
   - If status is PASS (sandbox executed and passed), card should have 'dot-green' class or equivalent
   - If status is FAIL (sandbox executed and failed), card should have 'dot-red' class or equivalent

**Proof required:**
- Playwright test code showing DOM element selectors and assertions
- Console output showing all 8 cards located and status verified (format: "macro-investment-clock: NOT-RUN [not green] OK" or similar)
- Screenshot of dashboard rendering all 3 panels (optional but recommended)

---

**AC-4: PO Verdict Recorded in Decision Doc**

PO writes a decision document `docs/po-decisions/<date>-g9-macro-user-confirmation.md` (following TA cycle-19 pattern).

**Template:**
```markdown
---
decision_id: g9-macro-user-confirmation
pilot: macro-indicators
date: <ISO8601>
decision_type: playwright_headless_verification
verdict: YES
path: Path B (PO Playwright short-circuit — no synchronous user wait)
---

# G9 User Confirmation — macro-indicators Dashboard Trust

**Decision:** G9 PASS via Path B (PO Playwright headless verification).

**Evidence:**
- Playwright test executed on file://apps/macro-indicators/dashboard/index.html
- All 3 panels rendered (primitives 6, module 1, microservice 1)
- Zero console errors, zero page errors, zero network failures
- All status indicators displayed honestly (NOT-RUN not green, PASS green, FAIL red)
- Test result: PASS

**Verdict:** Dashboard is trustworthy and usable by end users. G9 = YES.

**Recommendation for closure:** G9 ready to flip YES.
```

**Proof required:**
- Decision doc file created at `docs/po-decisions/<date>-g9-macro-user-confirmation.md`
- Verdict line reads "verdict: YES"
- Playwright evidence embedded or linked in the doc

---

## Hard Gates (PO must verify all before PASS)

1. **Anchor held:** `git merge-base --is-ancestor 1776df8e HEAD && echo 0` (must return 0)
2. **Dashboard file exists:** `test -f apps/macro-indicators/dashboard/index.html && echo 0` (must return 0)
3. **Playwright executable:** `npx playwright --version` returns a version (or npm package exists)
4. **Sandbox operational:** `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -scenario=all` exits 0 (dashboard should have fresh data to render)
5. **No code changes:** This is verification-only. Zero source code mutations to pkg/, cmd/, interface/, or dashboard HTML. PO may add test files (`playwright.test.ts` or equivalent in a temporary location for CI/CD proof), but dashboard HTML itself is read-only.

---

## Out-of-Scope (PO must NOT modify)

- Any `.go` source files in apps/macro-indicators/pkg/ or cmd/
- `apps/macro-indicators/dashboard/index.html` HTML logic (read-only inspection)
- Any Charter or architecture brief documents
- Other applications or services
- Sandbox invocation or Go build process (PO runs it to verify, does not modify)

---

## Acceptance Evidence to Record

In the completion signal (docs/signals/po-p2-c1-macro-<verdict>-<UTC>.json), provide:

1. **AC-1 output:**
   - Playwright test file path and content
   - Command invoked: `npx playwright test --reporter=json`
   - Test result: PASS or FAIL (should be PASS)

2. **AC-2 output:**
   - Console log output (should be empty or info-only)
   - Page error log output (should be empty)
   - Request failed log output (should be empty)

3. **AC-3 output:**
   - DOM element selectors verified for all 8 cards
   - Status indicators checked (NOT-RUN, PASS, FAIL logic verified)
   - Dashboard screenshot or terminal rendering output (optional)

4. **AC-4 output:**
   - Decision doc file path: `docs/po-decisions/<date>-g9-macro-user-confirmation.md`
   - Verdict line: `verdict: YES`
   - Playwright evidence summary

5. **All hard gates results:**
   - Anchor 1776df8e held (exit 0)
   - Dashboard file exists (exit 0)
   - Playwright executable available
   - Sandbox exits 0 at submission
   - No code changes (read-only verification)

---

## Signal Output (PO Responsibility)

**On PASS:** Create signal file `docs/signals/po-p2-c1-macro-YES-<UTC>.json`

**Required fields:**
```json
{
  "task_id": "P2-C1",
  "cycle": "c282-cycle-51 (post-dispatch)",
  "verdict": "YES",
  "timestamp_utc": "<ISO8601>",
  "po_agent": "po",
  "po_method": "Playwright headless chromium verification — file://apps/macro-indicators/dashboard/index.html",
  "ac_results": {
    "ac1": { "verdict": "PASS", "playwright_test_status": "PASS", "test_file": "<path>" },
    "ac2": { "verdict": "PASS", "console_errors": 0, "page_errors": 0, "request_failures": 0 },
    "ac3": { "verdict": "PASS", "primitives_count": 6, "module_count": 1, "microservice_count": 1, "status_honesty": "verified" },
    "ac4": { "verdict": "PASS", "decision_doc": "docs/po-decisions/<date>-g9-macro-user-confirmation.md", "verdict_line": "YES" }
  },
  "hard_gates": {
    "anchor_held": { "verdict": "PASS", "exit_code": 0 },
    "dashboard_file_exists": { "verdict": "PASS", "exit_code": 0 },
    "playwright_executable": { "verdict": "PASS", "version": "<version>" },
    "sandbox_operational": { "verdict": "PASS", "exit_code": 0, "total": 20, "pass": 20, "fail": 0 },
    "no_code_changes": { "verdict": "PASS", "note": "verification-only, read-only inspection" }
  },
  "g9_path": "Path B (PO Playwright headless — no user synchronous wait)",
  "g9_terminal_ready": true,
  "g9_recommendation": "Dashboard is trustworthy. All panels render. Zero errors. Status indicators honest. G9 ready to flip YES.",
  "decision_doc": "docs/po-decisions/<date>-g9-macro-user-confirmation.md",
  "notes": "PO verified: Playwright headless chromium loaded dashboard file://. All 8 cards rendered, all status indicators displayed honestly. Zero console/page/network errors. Decision doc recorded. G9 terminal complete."
}
```

**On FAIL:** Create signal file `docs/signals/po-p2-c1-macro-NO-<UTC>.json` with specific failed AC.

---

## Commit (PO)

**Commit subject:**
```
chore(po): P2-C1 macro-indicators G9 Playwright Path B verification — YES (6/12 goals)
```

**Files to stage explicitly (L84):**
- `docs/po-decisions/<date>-g9-macro-user-confirmation.md`
- `docs/signals/po-p2-c1-macro-YES-<UTC>.json` (or NO variant)

**NO `git add -A`, NO `git add .`, NO `--force`, NO `--no-verify`, NO `--no-gpg-sign`, NO `git push`.**

---

## Reference Documents

- Charter: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` §G9 (Path B default, lesson L6 from TA cycle-19)
- Phase 2 task plan: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md` §P2-C1
- P2-F1 handoff (prerequisite): `docs/handoffs/TASK_P2-F1-macro.md`
- P2-F1 QA signal (prerequisite): `docs/signals/qa-p2-f1-macro-GREEN-20260523T164502Z.json`
- TA cycle-19 Playwright precedent: `docs/po-decisions/2026-05-23-g9-user-confirmation.md` (Path B adoption decision)
- SSOT: `docs/data/pilot-status-macro-indicators.json` (PM to update post-PO PASS)

---

## Next Task (Unblocked by This)

After P2-C1 PASS signal lands and PM cycles-51+ atomic commits:

**P2-D1:** Bug Injection Pre-Tag + Deliberate Bug Injection — 20m estimate
- Blocked by: P2-C1 PASS
- Owner: qa
- Prepare for G10 AI-fixability proof (deliberate bug injection in carry-trade-signal primitive)

---

## Charter Reference

**Goal G9 (Dashboard is the trust contract — short-circuit via PO Playwright, Day-0 escape hatch):**

Path B (PO Playwright headless chromium) is the Day-0 default. User issues directive delegating verification to PO. PO runs Playwright + chromium-headless-shell against `file://apps/macro-indicators/dashboard/index.html` (TCC-staged via Terminal.app per L87). Acceptance: ZERO console errors, ZERO pageerrors, ZERO requestfailed, all primitives + module + microservice cards rendered, NOT-RUN status honestly displayed. PO records verdict in decision doc. Verdict has SAME WEIGHT as user verbal confirm per cycle-19 precedent.
