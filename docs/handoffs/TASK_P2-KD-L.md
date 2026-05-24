---
task_id: P2-KD-L
title: "G9 Dashboard Trust Contract — PO Playwright Path B (Headless Chromium)"
owner: po
phase: 2
goal_advanced: ["G9"]
date_created: 2026-05-24
blocked_by: P2-KD-K
blocks: P2-KD-M
est_hours: 0.5
ac_count: 4
---

# TASK_P2-KD-L: G9 Dashboard Trust Contract via PO Playwright Path B

**Owner:** po  
**Blocked by:** P2-KD-K DONE (G8 honest-red proof complete — dashboard is ready for G9 verification)  
**Blocks:** P2-KD-M  
**Est:** 30m  
**ACs:** 4

---

## Background

G9 is the user trust confirmation gate for the dashboard. **Path B (default, Day-0 locked per L6):**
PO invokes Playwright + chromium-headless-shell against the kinh-dich dashboard file.

**Path:** `file://apps/kinh-dich-service/dashboard/index.html` opened via Playwright 1.60.0 with cached
chromium binary (Chromium already present in Claude Code environment via Bun; no download step needed).

**TCC staging:** Terminal.app application-context role staging (documented per L87 / TA cycle-19).

**Acceptance criteria flow:**
1. Open dashboard via Playwright headless chromium
2. Wait for all 3-panel DOM to stabilize
3. Confirm zero console errors / page errors / request failed
4. Verify all 6 card groups render (5 primitives + 1 module + 1 microservice = 3 panels, 7 cards total)
5. Confirm NOT-RUN status is honestly displayed (no false green on untested items)

---

## Acceptance Criteria

### AC-1 — Dashboard Opens via Playwright + Chromium-Headless-Shell

**Setup:**

```bash
# Playwright 1.60.0 + cached chromium already available via Bun environment
# NO install step required; NO npm install needed for Playwright

# Script to verify Playwright + open dashboard:
cd apps/kinh-dich-service && \
  npx playwright --version && \
  npx playwright install-deps --with-deps chromium
```

**Procedure:**

1. PO creates a simple Playwright script (TypeScript or JavaScript) that:
   - Imports `Browser`, `Page` from `@playwright/test`
   - Launches chromium in headless mode
   - Navigates to `file://$(pwd)/apps/kinh-dich-service/dashboard/index.html`
   - Waits for DOM stability (2s settle time)

2. Run the script:
   ```bash
   npx playwright test <script> --headed=false
   ```
   Or inline Playwright execution via Terminal.app.

3. Confirm browser opens and navigates successfully.

**Verdict:** Dashboard HTML file loads without network errors; browser window opens (headless mode, invisible but functional).

**Evidence:** Capture terminal output showing Playwright launch success + navigation complete.

---

### AC-2 — Zero Console Errors / Page Errors / Request Failed

**Procedure:**

1. Instrument the Playwright script to capture:
   ```javascript
   page.on('console', msg => {
     if (msg.type() === 'error') {
       console.error(`[PAGE-ERROR] ${msg.text()}`);
       process.exit(1); // Fail on console error
     }
   });
   page.on('pageerror', err => {
     console.error(`[PAGE-ERROR] ${err.message}`);
     process.exit(1);
   });
   page.on('requestfailed', req => {
     // Note: file:// URLs do NOT make HTTP requests; this guard is defensive
     console.error(`[REQUEST-FAILED] ${req.url()}`);
     process.exit(1);
   });
   ```

2. Run the instrumented script.

3. Confirm process exits 0 (no console errors, no page errors, no request failures).

**Verdict:** Browser console is clean. No uncaught exceptions, no failed async loads.

**Evidence:** Paste terminal output showing zero error listeners fired; process exit code 0.

---

### AC-3 — All 3-Panel Card Groups Render (7 Cards Total)

**Procedure:**

1. Query DOM for all card elements:
   ```javascript
   const allCards = await page.locator('[data-testid~="card"]').count();
   console.log(`Rendered cards: ${allCards}`);
   
   // Expect 7 total:
   // - Primitives panel: 5 cards (hexagram-resolver, ngu-hanh-classifier, hao-encoder, reading-scorer, nuclear-hexagram-computer)
   // - Module panel: 1 card (reading_composer)
   // - Microservice panel: 1 card (composition root + OpenAPI + 4 G5b endpoints)
   ```

2. Alternatively, query by panel headers:
   ```javascript
   const primitivesPanel = await page.locator('h2:has-text("Primitives")').count();
   const modulePanel = await page.locator('h2:has-text("Module")').count();
   const microservicePanel = await page.locator('h2:has-text("Microservice")').count();
   
   if (primitivesPanel !== 1 || modulePanel !== 1 || microservicePanel !== 1) {
     throw new Error('Not all panels rendered');
   }
   ```

3. Confirm all card groups are visible in DOM (not hidden, not display:none).

**Verdict:** All 3 panels render with all cards visible.

**Evidence:** Paste DOM query results showing 7 cards total OR 3 panel headers with count=1 each.

---

### AC-4 — NOT-RUN Status Honestly Displayed (No False Green)

**Procedure:**

1. Inspect dashboard state for each card:
   - **Golden scenarios:** Must show GREEN status (sandbox PASS)
   - **NOT-RUN scenarios (if any):** Must NOT show GREEN; must show GRAY or "NOT-RUN" label
   - **Failed scenarios (from G8 test):** If any revert residue exists, must show RED

2. Query card status elements:
   ```javascript
   const cards = await page.locator('[data-testid~="card"]').all();
   for (const card of cards) {
     const status = await card.locator('[data-testid="status"]').textContent();
     const color = await card.evaluate(el => 
       window.getComputedStyle(el).backgroundColor
     );
     
     if (status === 'NOT-RUN' && color.includes('green')) {
       throw new Error(`Card ${card} shows GREEN for NOT-RUN status`);
     }
   }
   ```

3. Verify dashboard reflects honest G12 DoD state: 17/17 sandbox scenarios PASS.

**Verdict:** No false greens. Only GREEN where sandbox confirms PASS. NOT-RUN or GRAY for untested items.

**Evidence:** Screenshot of dashboard with all card statuses visible + paste validation output confirming no false greens.

---

## Files to Touch

- `apps/kinh-dich-service/dashboard/index.html` (READ-ONLY — no modifications)
- Playwright test script (CREATE temporarily in PO's working session — not committed)
- `docs/signals/po-kd-P2-KD-L-g9-playwright-done-<UTC>.json` (CREATE — signal emit)

---

## Playwright Setup Notes

**Playwright 1.60.0 + Chromium availability:**
- Playwright is available in Claude Code / Bun environment
- Chromium binary is cached (no install required)
- Headless mode: process runs invisible, captures DOM/console output via API

**TCC (Terminal.app) staging:**
- Playwright launches via Terminal.app subprocess
- No user interaction required; all verification is programmatic
- Per L87: Playwright invocation is TCC-staged and autonomous

**Path B (chosen over Path A):**
- Path A: user verbal confirmation (not selected for Phase 2)
- Path B (Day-0 default): PO Playwright headless chromium automated proof

---

## G-Goal Posture

**NO goal flips.** §4.5 SSOT untouched. G9 evidence is complete (Path B PASS) but PO flips G9 only at
12/12 terminal Phase-3 close.

---

## Commit Pattern

**Signal emit only.** No commit. PO creates `docs/signals/po-kd-P2-KD-L-g9-playwright-done-<UTC>.json`
with fields:

```json
{
  "task_id": "P2-KD-L",
  "timestamp": "<ISO-UTC>",
  "path_chosen": "Path B (PO Playwright headless chromium)",
  "dashboard_file": "file://apps/kinh-dich-service/dashboard/index.html",
  "ac1_browser_launch": "PASS",
  "ac2_zero_console_errors": "PASS",
  "ac3_all_panels_render": "PASS (7 cards: 5 primitives + 1 module + 1 microservice)",
  "ac4_no_false_greens": "PASS (honest NOT-RUN status displayed)",
  "g9_ready_to_grade": "YES",
  "next_actor": "pm",
  "next_action": "verify P2-KD-L (G9 Playwright Path B), then sequence P2-KD-M (G10 bug injection)"
}
```

---

## Notes

- **Autonomous:** PO runs Playwright directly without user delegation
- **No external network:** file:// protocol = zero network calls required
- **Trust layer:** G9 proves the dashboard is the user-facing trust contract
- **Phase-2 §4.5:** Never flip decisionMatrix or goalsEarned. All goal flips happen atomically in Phase-3 close by PO only
