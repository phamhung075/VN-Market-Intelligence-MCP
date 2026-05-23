---
task_id: P1-D
pilot: stock-price
phase: 1
title: Dashboard stub — apps/stock-price/dashboard/index.html
owner: dev-stock-price
status: READY
priority: BLOCKING
estimated_hours: 2
depends_on: P1-C
blocks: P1-E
goals_advanced: [G6, G8, G9, G12]
date_assigned: 2026-05-24T01:15:00Z
---

# TASK P1-D — Dashboard Stub: apps/stock-price/dashboard/index.html

**Phase 1 deliverable:** Three-panel HTML dashboard serving the G6, G8, G9, G12 contract goals for the stock-price pilot. The dashboard renders from scenario trace JSON output, works via `file://`, and displays the trust state of all primitives, the module, and the microservice composition.

## Background

The P1-C module stub has completed with Fence-B clean and sandbox all-green (11/11 scenarios). P1-D builds the user-facing trust layer — a static HTML dashboard that reveals the state of each primitive, the module composition, and the microservice endpoints.

**Key constraints:**
- Zero network calls — the dashboard opens via `file://` without any web server.
- Zero credentials — no DB_PATH, API keys, or tokens embedded.
- Zero CGO — the sandbox that feeds trace JSON to the dashboard runs under `CGO_ENABLED=0`.
- Honest status — NOT-RUN when sandbox has not been executed. Green only when all scenarios pass.
- **Three-panel layout (SI-2 note below).**

### SI-2 Fleet Dashboard Index — Phase 2 Trigger

stock-price is the **FIRST fleet pilot** to reach G6. This triggers **SI-2: fleet dashboard index creation** (per ratification Decision 3). The fleet index (`docs/dashboards/index.html`) is a **Phase 2 deliverable**, not part of P1-D. P1-D owns only the per-service dashboard (`apps/stock-price/dashboard/index.html`). SI-2 work begins after G6 verification.

## Acceptance Criteria

### AC-1: File opens via file:// without any web server

**Verify:**
```bash
open file://$(pwd)/apps/stock-price/dashboard/index.html
```
The HTML file must load in a browser with zero network errors. No `fetch()` calls to external URLs. Zero CDN dependencies. The dashboard must render from hardcoded JSON trace files only.

**Evidence:** Screenshot or manual verification that the browser opens the file without errors.

---

### AC-2: Three panels visible (3-panel standard)

The HTML document contains three distinct, labeled panels:

1. **Primitives panel** — displays cards for:
   - `price-quote-normalizer`
   - `tier-fallback-selector`
   - `price-staleness-classifier`
   - (Optional 4th: `ohlcv-aggregator`, if P1-F lands before P1-D completion)

   Each card shows:
   - Primitive name
   - Status indicator (NOT-RUN initially; GREEN/RED after sandbox execution)
   - Expected output shape (e.g., "normalizes raw exchange fields → domain.PriceQuote")

2. **Module panel** — displays one card for:
   - `price_resolution`
   
   Shows:
   - Module name
   - Status indicator
   - Composition story (e.g., "3-tier fallback orchestration via TierFetcher port")

3. **Microservice panel** — displays one card for:
   - `stock-price` service
   
   Shows:
   - Service name
   - Port information (5000 internal / 5010 external per system-map.json)
   - Status indicator
   - Expected endpoints (derive from `apps/stock-price/pkg/interface/http/` OpenAPI spec)

**Verify:**
```bash
grep -c "Primitives\|Module\|Microservice\|price-quote-normalizer\|tier-fallback-selector\|price-staleness-classifier\|price_resolution\|stock-price" apps/stock-price/dashboard/index.html
```
Must be ≥ the count of expected card labels.

**Evidence:** Paste the `grep` output showing each panel label and primitive/module/service name.

---

### AC-3: Status display is honest — NOT-RUN when cold

The dashboard must display NOT-RUN state when opened without having executed the sandbox. No false greens. Only after the sandbox has been run and all scenarios pass do the cards show GREEN.

**Verify:**
```bash
# Cold open — no prior sandbox run in this session
open file://$(pwd)/apps/stock-price/dashboard/index.html
# Manually inspect or use headless browser (AC-4 below)
```

The primitives/module/microservice cards must show "NOT-RUN" status in the initial HTML. The card bodies should be neutral (e.g., gray or white, not green).

**Evidence:** Screenshot showing all cards in NOT-RUN state.

---

### AC-4: PO Playwright compatibility (Path B) — zero console errors, all cards rendered

The dashboard must render correctly in chromium-headless-shell (PO's verification path):

```bash
cd apps/stock-price
npx playwright test --project=chromium --headed=false \
  --config=../../.playwright/playwright.config.ts \
  tests/dashboard.e2e.spec.ts
```

Or manual verification with dev tools / headless runner showing:

- ZERO console errors (no `console.error()` logs)
- ZERO page errors (no JavaScript exceptions)
- ZERO request failures (no failed HTTP/file:// loads)
- All 5 cards (3 primitives + 1 module + 1 microservice) rendered in the DOM
- NOT-RUN status displayed honestly

**Evidence:** Paste the Playwright test output or headless browser inspection showing all cards rendered and no errors.

---

### AC-5: Zero credentials in dashboard HTML

The HTML file and any embedded JavaScript must NOT contain any credential placeholders or API keys:

```bash
grep -c "DB_PATH\|STOCK_PRICE_DB\|API_KEY\|SECRET\|TOKEN\|PASSWORD\|mattn" apps/stock-price/dashboard/index.html
```

Must return 0. The dashboard is a trust artifact — credentials anywhere would break the sandbox's reproducibility guarantee.

**Verify:**
```bash
grep "DB_\|API_KEY\|SECRET\|TOKEN\|PASSWORD\|mattn" apps/stock-price/dashboard/index.html || echo "PASS — no credentials found"
```

**Evidence:** Paste the grep output (should be empty or show only "PASS").

---

### AC-6: Layout clones TA + macro dashboard standards

The dashboard HTML structure and CSS style must follow the 3-panel pattern established by the TA and macro pilots:

- Color scheme: consistent with `apps/technical-analysis/dashboard/index.html` and `apps/macro-indicators/dashboard/index.html`
- Card layout: flexbox or grid, 3 equal or similar-sized columns (if horizontal) or stacked rows (if vertical)
- Typography: readable sans-serif font, ≥14px body, ≥16px headings
- Spacing: consistent padding/margin between cards
- Status badges: green/red/gray color coding (green = PASS scenario, red = FAIL scenario, gray = NOT-RUN)

**Verify:**
```bash
# Compare structure with prior dashboards
head -20 apps/stock-price/dashboard/index.html | grep -E "<div|<section|<article" | wc -l
head -20 apps/technical-analysis/dashboard/index.html | grep -E "<div|<section|<article" | wc -l
```

Gross structure should be similar (both using semantic HTML containers).

**Evidence:** Screenshot comparison showing the 3-panel layout matches the style of TA/macro dashboards. Or paste a few lines of the HTML showing the card structure.

---

### AC-7: G12 DoD Gate — sandbox all-green before GREEN status shown

The dashboard must NOT show GREEN status for any card until the sandbox has been executed and all scenarios pass:

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```

All three commands must exit 0 and show all scenarios PASS before any card is allowed to display GREEN in the HTML.

**Implementation note:** The dashboard's card-coloring logic should read from a trace JSON file or localStorage value that is only populated after a successful sandbox run. The rerun handler (P1-E) will populate this state.

**Verify before marking P1-D DONE:**
- Run the full sandbox suite with `CGO_ENABLED=0`.
- Manually reload the dashboard in the browser.
- Confirm all cards show PASS/GREEN status.
- Close the browser and reopen the file via `file://` (cold start).
- Confirm all cards show NOT-RUN again (state is not persisted across sessions by default).

**Evidence:** Paste the sandbox output showing all 11 scenarios PASS, then a screenshot of the dashboard showing all cards GREEN. Paste a second screenshot of the cold-reload dashboard showing NOT-RUN.

---

## Files to Create/Modify

- **CREATE:** `apps/stock-price/dashboard/index.html`

## Files NOT in Scope

- SI-2 fleet dashboard index (`docs/dashboards/index.html`) — Phase 2 deliverable, triggered at G6 close.
- kinh-dich dashboard (pilot 4) — no touchpoints with stock-price dashboard.

## Blockers / Risk

**None** — P1-C (module) is DONE with Fence-B clean and sandbox green. All scenario JSON files and module code are finalized.

## Next Task

**P1-E — Edit-Rerun Handler + Env Audit** — modifies `apps/stock-price/dashboard/index.html` to add the rerun handler, enabling the user to edit scenario JSON and see the dashboard update.

## QA Checklist (for reviewer)

- [ ] AC-1: HTML opens via `file://` without web server
- [ ] AC-2: All 3 panels visible with expected primitive/module/service names
- [ ] AC-3: Cold open shows NOT-RUN state (honest status)
- [ ] AC-4: Playwright/headless browser shows zero console errors, all cards rendered
- [ ] AC-5: `grep` confirms zero credentials in HTML
- [ ] AC-6: Layout matches TA/macro dashboard style (3-panel, readable, consistent)
- [ ] AC-7: Sandbox all-green (11/11 pass), then dashboard shows all cards GREEN; cold reload shows NOT-RUN

---

**Signal on completion:** Emit `docs/signals/dev-stock-price-p1-d-done-<UTC>.json` with all 7 AC verdicts and a screenshot of the dashboard in GREEN state after sandbox execution.
