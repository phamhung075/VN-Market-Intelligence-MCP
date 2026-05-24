---
task_id: "P2-K"
title: "G9 PO Playwright dashboard-trust verification (Path B)"
authored_by: "pm"
authored_at: "2026-05-24T02:55:00Z"
pilot: "stock-price"
phase: "2"
owner: "po"
blocked_by: "P2-J (DONE 2026-05-24T01:49:00Z — G8 honest-red proven)"
blocks: "P2-L (G10 bug injection)"
---

# P2-K — G9 PO Playwright Dashboard-Trust Verification (Path B)

## Task Overview

**G-goal:** G9 — Dashboard is the trust contract (Path A user verbal OR Path B PO Playwright)

**Owner:** po

**Charter reference:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §G9

**Rationale:** G9 proof requires demonstration that the per-service dashboard (`apps/stock-price/dashboard/index.html`) is trustworthy as a user-facing contract. This is proven via either:
- **Path A (user verbal confirmation):** User directly examines the dashboard and confirms its honest representation.
- **Path B (PO Playwright default):** PO runs Playwright chromium-headless-shell to verify dashboard structure and cleanliness without requiring synchronous user wait.

Both paths carry equal evidentiary weight. **Path B is the Day-0 default** (L6 lesson baked in) and does NOT require user availability.

---

## Path B Procedure (Default)

Per Charter §G9 and L6 (Lesson 6 — G9 Playwright short-circuit Day-0 default):

### Prerequisites

1. `apps/stock-price/dashboard/index.html` finalized (P2-I completed, stock-price-time: 2026-05-24T01:43:02Z).
2. G8 honest-red proven (P2-J completed, 2026-05-24T01:49:00Z).
3. Playwright and chromium-headless-shell available in PO environment (typically pre-installed; fallback: see Fallback Procedure below).

### Step 1: Run Playwright headless-browser test

**Command (copy into PO terminal or script):**

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP

npx playwright install chromium  # (one-time if not already installed)

npx playwright test --config /dev/null \
  --headed=false \
  --reporter=list \
  -c '{
    "testDir": ".",
    "testMatch": "**/*.spec.js",
    "webServer": null
  }' \
  << 'EOF'
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const context = await browser.createContext();
  const page = await context.newPage();

  // Capture console logs, page errors, and request failures
  const logs = [];
  page.on("console", msg => {
    const level = msg.type();
    if (level === "error" || level === "warning") {
      logs.push({ type: "console", level, message: msg.text() });
    }
  });
  page.on("pageerror", error => {
    logs.push({ type: "pageerror", message: error.message });
  });
  page.on("requestfailed", request => {
    logs.push({ type: "requestfailed", url: request.url() });
  });

  // Load dashboard from file://
  const dashboardPath = `file://${process.cwd()}/apps/stock-price/dashboard/index.html`;
  await page.goto(dashboardPath, { waitUntil: "domcontentloaded" });

  // Wait for dashboard to render
  await page.waitForTimeout(1000);

  // Check DOM for 3 panels + cards
  const primitivePanel = await page.querySelector("[data-panel='primitives']");
  const modulePanel = await page.querySelector("[data-panel='module']");
  const microservicePanel = await page.querySelector("[data-panel='microservice']");

  const primitiveCards = await page.locator("[data-card-type='primitive']").count();
  const moduleCard = await page.querySelector("[data-card-type='module']");
  const microserviceCard = await page.querySelector("[data-card-type='microservice']");

  // Check status display (GREEN vs NOT-RUN honesty)
  const greenCards = await page.locator(".dot-green").count();
  const notRunCards = await page.locator(".status-not-run").count();

  // Compilation results
  const results = {
    path: dashboardPath,
    console_errors: logs.filter(l => l.type === "console" && l.level === "error").length,
    pageerrors: logs.filter(l => l.type === "pageerror").length,
    requestfailed: logs.filter(l => l.type === "requestfailed").length,
    total_issues: logs.length,
    panels_rendered: {
      primitives: !!primitivePanel,
      module: !!modulePanel,
      microservice: !!microservicePanel
    },
    card_counts: {
      primitive_cards: primitiveCards,
      module_card: !!moduleCard,
      microservice_card: !!microserviceCard
    },
    status_honesty: {
      green_cards: greenCards,
      not_run_cards: notRunCards,
      all_cards_count: greenCards + notRunCards
    },
    verdict: logs.length === 0 ? "CLEAN" : "ISSUES"
  };

  console.log(JSON.stringify(results, null, 2));

  await browser.close();
  process.exit(logs.length === 0 ? 0 : 1);
})();
EOF
```

**Expected output (on CLEAN run):**

```json
{
  "path": "file:///.../apps/stock-price/dashboard/index.html",
  "console_errors": 0,
  "pageerrors": 0,
  "requestfailed": 0,
  "total_issues": 0,
  "panels_rendered": {
    "primitives": true,
    "module": true,
    "microservice": true
  },
  "card_counts": {
    "primitive_cards": 3,
    "module_card": true,
    "microservice_card": true
  },
  "status_honesty": {
    "green_cards": 3,
    "not_run_cards": 2,
    "all_cards_count": 5
  },
  "verdict": "CLEAN"
}
```

---

### Step 2: Verify Exit Code

```bash
echo $?  # Should be 0 on CLEAN, 1 on ISSUES
```

**Expected:** Exit code 0.

---

### Step 3: Manual DOM Inspection (Optional, Recommended)

**Alternative to automated Playwright:** Open dashboard in a real browser for visual confirmation:

```bash
# In Terminal.app (macOS):
open apps/stock-price/dashboard/index.html

# Visual checks:
# 1. All 3 panel headers visible (Primitives, Module, Microservice)
# 2. Primitive cards: ≥3, all show GREEN (sandbox run) or NOT-RUN (cold start)
# 3. Module card: 1 card, status GREEN or NOT-RUN
# 4. Microservice card: 1 card, status NOT-RUN (sandbox does NOT run HTTP integration tests)
# 5. Browser console (Cmd+Option+I): ZERO error messages
# 6. No credential leaks in visible text (no DB_PATH, API_KEY, TOKEN, PASSWORD)
```

---

### Fallback Procedure (if headless chromium unavailable)

**Condition:** chromium-headless-shell not available in PO environment, OR Playwright installation fails.

**Action:** Substitute Path A (user verbal confirmation).

**Path A procedure:**

1. **User directly opens dashboard:**
   ```bash
   open apps/stock-price/dashboard/index.html
   ```

2. **User confirms (verbally or in chat):**
   - All 3 panels rendered (Primitives, Module, Microservice)
   - Primitive cards show honest status (GREEN for P1-B1/B2/B3, NOT-RUN for microservice)
   - No console errors visible (open browser DevTools → Console)
   - Dashboard is clean and usable

3. **PO records verdict:**
   - Path = A (user verbal)
   - Verdict = PASS (or FAIL if any check fails)

**Note:** Path A is equally valid per charter. Either path satisfies G9. If user verbal confirmation is more practical in your environment, use Path A.

---

## Acceptance Criteria (AC)

### AC-1: All 3 Panels Rendered

**Criterion:** PO runs Playwright (or opens manually) and confirms all 3 panels (primitives, module, microservice) are rendered in the DOM.

**Verification:**
- Automated: `panels_rendered.primitives === true && panels_rendered.module === true && panels_rendered.microservice === true`
- Manual: All 3 section headers visible in browser

**Status:** PASS if all true; FAIL otherwise.

---

### AC-2: ZERO Console Errors, Page Errors, Request Failures

**Criterion:** Playwright captures ZERO console-error, ZERO pageerror, ZERO requestfailed events.

**Verification:**
- Automated: `total_issues === 0` (sum of console_errors + pageerrors + requestfailed)
- Manual: Browser DevTools Console shows no red error messages

**Status:** PASS if total_issues === 0; FAIL otherwise.

---

### AC-3: Status Displayed Honestly

**Criterion:** All rendered cards show status consistent with their execution state:
- **GREEN:** Items that have been run (P1-B1, P1-B2, P1-B3 primitives, module — all green per sandbox run in P2-I)
- **NOT-RUN:** Items that have NOT been run (microservice card — cold-open, not verified by P2-I sandbox)

**Verification:**
- Automated: `card_counts.primitive_cards >= 3 && card_counts.module_card === true && card_counts.microservice_card === true` + `status_honesty.green_cards > 0 && status_honesty.not_run_cards > 0`
- Manual: All visible cards show either GREEN badge or NOT-RUN badge, no mixing, no false greens

**Status:** PASS if all cards display correct status; FAIL if false greens detected.

---

### AC-4: G9 Verdict Recorded

**Criterion:** PO writes a decision document at `docs/po-decisions/<date>-g9-stock-price-user-confirmation.md` with the following fields:

```yaml
---
date: "2026-05-24"
decision_id: "g9-stock-price-user-confirmation"
pilot: "stock-price"
g_goal: "G9"
path: "B (PO Playwright headless chromium-headless-shell)"
verdict: "PASS"  # or FAIL
verdict_at: "2026-05-24T<ISO>"
verdict_by: "po"
---

## G9 User Confirmation — stock-price

**Path:** B (PO Playwright headless)

**Verdict:** PASS

## AC-1: Panels Rendered
- Primitives panel: YES
- Module panel: YES
- Microservice panel: YES

## AC-2: Zero Errors
- console_errors: 0
- pageerrors: 0
- requestfailed: 0
- **Total issues: 0**

## AC-3: Honest Status Display
- Primitive cards (≥3): All GREEN (sandbox-run)
- Module card: GREEN (sandbox-run)
- Microservice card: NOT-RUN (cold-open, correct)
- False greens: NONE

## AC-4: Evidence Path
- Playwright output: [paste full JSON or manual checklist]
- Browser console: [clean / no errors]
- Dashboard visual: [description or screenshot reference]

## Notes
[Optional: Any observations, environment details, known limitations]

## Ratification
This decision attests that G9 (Dashboard trust contract) has been verified via Path B (PO Playwright). The dashboard renders honestly without errors and displays status correctly.
```

**Emission:** PO emits a signal file:
```bash
docs/signals/po-sp-P2-K-g9-done-<UTC>.json
```

**Signal template:**
```json
{
  "signal": "po-sp-P2-K-g9-done",
  "task": "P2-K",
  "pilot": "stock-price",
  "phase": "2",
  "emitted_by": "po",
  "emitted_at": "<ISO-UTC>",
  "g9_path": "B (PO Playwright headless)",
  "g9_verdict": "PASS",
  "ac_verdicts": {
    "AC-1": "PASS (all 3 panels rendered)",
    "AC-2": "PASS (zero errors)",
    "AC-3": "PASS (honest status display)",
    "AC-4": "PASS (verdict recorded in po-decisions)"
  },
  "decision_doc": "docs/po-decisions/2026-05-24-g9-stock-price-user-confirmation.md",
  "g_goal_flips": "NONE (Charter §4.5 — G9 stays TBD; PO flips at 12/12 terminal Phase-3 close)",
  "next_actor": "pm",
  "next_action": "verify P2-K, transition SSOT, dispatch P2-L (G10 bug injection)"
}
```

**Status:** PASS if verdict recorded and signal emitted; FAIL if verdict is FAIL.

---

## G-Goal Posture

**Per Charter §4.5 (BINDING):**
- **NO goal flips in Phase 2.** P2-K produces G9 evidence/attestation but does NOT change `goals[G9].status` from TBD to YES.
- **`goalsEarned` stays 0** throughout Phase 2.
- **`decisionMatrix` stays all-TBD** throughout Phase 2.
- **PO flips all G-goals atomically at Phase 3 terminal close** (12/12 simultaneous transition).

This handoff completes G9 evidence. The verdict (PASS/FAIL) gates P2-L dispatch, but does NOT mutate the SSOT goal state.

---

## Summary

| Item | Value |
|---|---|
| Task ID | P2-K |
| Title | G9 PO Playwright dashboard-trust verification (Path B) |
| Owner | po |
| Blocked by | P2-J (DONE) |
| Blocks | P2-L (G10 bug injection) |
| AC count | 4 |
| Est effort | 30 min |
| Path A alternative | User verbal confirm (equal weight) |
| Path B automation | Playwright chromium-headless-shell |
| Exit criteria | AC-1..AC-4 all PASS, verdict recorded, signal emitted |
| Charter binding | §G9, §4.5 (NO goal flips) |

---

## Next Step (PM)

After PO signals P2-K DONE with verdict=PASS:
1. Verify signal + decision doc.
2. Mark P2-K DONE in SSOT.
3. Dispatch P2-L (QA — create stock-price-pre-inject tag + G10 bug injection).

**If verdict=FAIL:** Escalate to architect (dashboard rendering issue blocks further progress).

