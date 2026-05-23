---
task_id: "P1-D"
pilot: "kinh-dich"
phase: "1"
title: "G6 Dashboard: three-level scenario trust layer"
owner: "dev-kinh-dich"
sprint: "2026-05-24"
deadline: "2026-07-05"
status: "READY"
handoff_date: "2026-05-24T01:55:00Z"
handoff_by: "pm"
blocked_by: ["P1-C"]
blocks: ["P1-E"]
zone: "apps/kinh-dich-service"
specialist: "dev-kinh-dich"
language: "TypeScript"
runtime: "bun"
---

# TASK P1-D — G6 Dashboard: three-level scenario trust layer

## Summary

Build a static HTML dashboard (no server, no external fetch, no credentials) that renders the 3-level test pyramid for kinh-dich:
- **Level 1 (Primitives):** 3 primitives × 3 scenarios each = 9 total (hao-encoder, hexagram-resolver, ngu-hanh-classifier)
- **Level 2 (Module):** reading_composer × 2 scenarios (golden, edge)
- **Level 3 (Microservice):** kinh-dich service info (ports, endpoints)

The dashboard is the **trust contract** between the system and the user: it renders scenario results honestly (green for PASS, red for FAIL, grey for NOT-RUN at cold start). All scenario data is embedded inline; users can edit scenario JSON files on disk, re-run the sandbox, and paste output to update results live (P1-E gate will implement the edit-rerun handler).

**G6 Acceptance:** Dashboard renders from static `file://` URL with zero network calls, zero CDN dependencies, zero credentials embedded.

**SI-2 BOUNDARY (hard constraint):** kinh-dich **MUST NOT** create or touch `docs/dashboards/index.html` — that is **stock-price's exclusively** (Decision 3 / Ratification). This task creates **only** `apps/kinh-dich-service/dashboard/index.html`.

---

## Files Touched

**Create:**
- `apps/kinh-dich-service/dashboard/index.html` (3-level trust dashboard, ~2000 lines inline HTML+CSS+JS)
- No new `.ts` files; no new `.json` schema files (all scenario data already exists from P1-C)

---

## Acceptance Criteria

### AC-1: Static file:// — Zero Network, Zero CDN, Zero Credentials

The dashboard **must** open in any modern browser via `file://` URL (no HTTP server required). Evidence:
```bash
open file:///Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/kinh-dich-service/dashboard/index.html
```
(on macOS; Linux: `xdg-open`, Windows: `explorer`)

**Acceptance:** All page elements render. Header visible. Three panels visible (Primitives, Module, Microservice). Zero console errors. No network requests (inspect DevTools Network tab → empty).

---

### AC-2: Three-Level Layout (Primitives + Module + Microservice)

**Panel 1 — Primitives (Level 1):**
- Show all 3 primitives (hao-encoder, hexagram-resolver, ngu-hanh-classifier) as collapsible groups
- Each primitive has 3 scenarios (golden, edge, failure)
- Total: 9 scenario cards visible
- Each card shows: dot (status), scenario name, description excerpt, category badge (golden|edge|failure)
- Summary chip at top: "9 scenarios" + "9 NOT-RUN" (cold start)

**Panel 2 — Module (Level 2):**
- reading_composer — one card per scenario
- 2 scenarios: reading-composer-golden + reading-composer-edge
- Card shows: module name, scenario name, list of composed primitives (3 tags), description, status dot
- Summary chip: "2 scenarios" + "2 NOT-RUN" (cold start)

**Panel 3 — Microservice (Level 3):**
- Service name: kinh-dich-service
- Runtime info: TypeScript / Bun
- Ports: internal 5005 / external 5005 (from `docs/data/system-map.json` — **query via jq, never hardcode**)
- HTTP endpoints listing (GET /readings POST /readings/batch, etc. — reference from src/interface/openapi.yaml or stub as "endpoints TBD" if P1-F handles)
- DDD layer summary (domain / application / infrastructure / interface)

**Evidence:** Screenshot or paste HTML source showing `<div class="level-panel">` × 3 with `level-badge` (Level 1, 2, 3).

---

### AC-3: Embedded Scenario Data — All 11 Scenarios Inline

All 11 scenarios (9 primitive + 2 module) must be embedded in a `<script>` block as JavaScript objects. Zero `fetch()`, zero XMLHttpRequest, zero WebSocket. 

**Location:** Inline `<script>` at bottom of HTML (after closing `</body>`-adjacent, before closing `</html>`).

**Structure:**
```javascript
window.__PRIMITIVES_DATA__ = [
  {
    "primitive": "hao-encoder",
    "category": "golden",
    "scenario": "hao-encoder-golden",
    "description": "...",
    "input": { ... },  // from docs/scenarios/kinh-dich/primitive/hao-encoder-golden.json
    "expectedOutput": { ... },
    "status": "not-run"  // AC-4: cold start
  },
  // ... 8 more primitives
];

window.__MODULE_DATA__ = [
  {
    "module": "reading_composer",
    "primitives": ["hao-encoder", "hexagram-resolver", "ngu-hanh-classifier"],
    "scenario": "reading-composer-golden",
    "category": "golden",
    "description": "...",
    "input": { ... },  // from docs/scenarios/kinh-dich/module/reading-composer-golden.json
    "expectedOutput": { ... },
    "status": "not-run"  // AC-4: cold start
  },
  // ... 1 more module
];
```

**Evidence:** Paste the first 20 lines of the embedded data block showing both `__PRIMITIVES_DATA__` and `__MODULE_DATA__` present.

---

### AC-4: Honest NOT-RUN at Cold Start (G8 Trust Contract)

The dashboard **must NOT** fake green status. At initial load (before any sandbox output is pasted):
- All 11 scenario cards show grey dot + "NOT-RUN" badge
- Summary chips show "11 NOT-RUN" + "0 passed" + "0 failed"
- Microservice panel may show service info (ports, endpoints) with honest "NOT-RUN" or "TBD" status

**Why:** This proves the dashboard is not pre-rendering false success. Users learn to trust the dashboard by seeing it start honestly grey, turn green only after sandbox runs.

**Evidence:** Screenshot of cold-start dashboard showing all dots grey and "NOT-RUN" labels visible.

---

### AC-5: Modal for Scenario Detail (Click to Inspect)

Clicking any scenario card opens a modal showing:
- Scenario name (h3) + category badge
- Description text
- Two-column diff: "Input" (left) and "Expected Output" (right)
- Both rendered as syntax-highlighted JSON (monospace font, dark background)
- Status bar at bottom: current status indicator + note + "Edit & Rerun (P1-E)" button
- Close button (×) top-right

**Evidence:** Show HTML/CSS for `.modal` and `.modal-header` with proper aria attributes (role="dialog", aria-modal="true", aria-labelledby).

---

### AC-6: Microservice Card — Service Composition Info

The Level 3 panel includes a service info card showing:
- Title: "kinh-dich-service"
- Metadata: language (TypeScript), runtime (Bun), DDD layers (domain/application/infrastructure/interface)
- Port block: internal 5005 / external 5005 (read from `docs/data/system-map.json` via **jq query in a comment or hardcode with note**)
- HTTP endpoints (if available from OpenAPI YAML; stub as "Endpoints: TBD (P1-F)" if not yet extracted)
- Composition note: "Microservice composes reading_composer module via HTTP routes"

**G7 constraint:** zero DB credentials, zero API keys in the service card or anywhere in the dashboard.

**Evidence:** Paste the service-card HTML section showing port values and composition description.

---

### AC-7: Rerun Command Block (P1-E Preview)

In the modal status bar (AC-5) or in a footer section, display the sandbox rerun command that the user will execute:
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```

This command must be visible and copy-able (optional: add a "Copy" button). The footer notes that P1-E will add the edit-rerun handler (pasting NDJSON output to update results live).

**Evidence:** Paste the rerun-cmd-block HTML showing the exact command with `--tier=all` and `--module=kinh-dich`.

---

### AC-8: Legend and Footer (Trust Contract Callouts)

At the bottom of the dashboard, include:
- **Legend:** Dot colors (green=PASS, red=FAIL, grey=NOT-RUN) + category badges (golden, edge, failure)
- **Footer:** 1-2 sentences explaining the dashboard's role:
  - "P1-D + P1-E — Three-Level Scenario Trust Dashboard"
  - "All data embedded inline, zero production credentials"
  - "Open with `file://` in any browser — no server required"
  - "Click Edit & Rerun to invoke sandbox and update results live (P1-E gate)"
  - Service fact: "Ports: internal 5005 / external 5005 per docs/data/system-map.json"
  - Next step: "P1-E (edit-rerun handler)" + "P1-F (OpenAPI endpoints)" + "P1-G (QA close-gate)"

**Evidence:** Paste the footer section showing at least 3 of the callouts above.

---

### AC-9: HTML Structure Validation

```bash
bun run -e "import fs from 'fs'; const html = fs.readFileSync('apps/kinh-dich-service/dashboard/index.html', 'utf-8'); 
console.log('Lines:', html.split('\\n').length); 
console.log('Has DOCTYPE:', html.includes('<!DOCTYPE html>')); 
console.log('Has inline <script>:', html.includes('<script>') && !html.match(/src\s*=\s*[\"'].*[\"']/)); 
console.log('No fetch():', !html.includes('fetch(')); 
console.log('No XMLHttpRequest:', !html.includes('XMLHttpRequest')); 
console.log('No CDN link:', !html.match(/<link[^>]*href\s*=\s*[\"']https?:\/\//)); 
console.log('__PRIMITIVES_DATA__ embedded:', html.includes('window.__PRIMITIVES_DATA__')); 
console.log('__MODULE_DATA__ embedded:', html.includes('window.__MODULE_DATA__'));"
```

**Acceptance:** All checks pass (true).

---

### AC-10: G12 DoD Gate — Sandbox All-Green Before RETURN

The dashboard **display** logic is pure JavaScript rendering. To verify the dashboard **can render results**, re-run the sandbox and paste one example NDJSON output before this RETURN block:

```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all 2>&1 | grep "PASS\|FAIL\|sandbox"
```

Example output:
```
[PASS] hao-encoder-golden.json
[PASS] reading-composer-golden.json
[sandbox] PASS 11/11 scenarios (0 failed, 0 skipped)
```

This confirms that the data structures embedded in the dashboard match the actual sandbox output format. The dashboard JavaScript will parse this and update the cards from NOT-RUN → PASS.

**Evidence:** Paste the summary line showing `[sandbox] PASS 11/11`.

---

## Brownfield Source Pointers

**stock-price G6 reference dashboard:** `apps/stock-price/dashboard/index.html` (lines 1–1854, Go version). Use as layout template but adapt for TypeScript/Bun content.

**Scenario JSONs (embedded data):**
- Primitives: `docs/scenarios/kinh-dich/primitive/hao-encoder-{golden,edge,failure}.json` + hexagram-resolver + ngu-hanh-classifier (same pattern)
- Module: `docs/scenarios/kinh-dich/module/reading-composer-{golden,edge}.json`

**Service metadata:** `docs/data/system-map.json` (query kinh-dich service entry for port, language, zone)

**OpenAPI reference (if needed for AC-6):** `apps/kinh-dich-service/src/interface/openapi.yaml` (or stub as TBD if not yet written)

---

## Key Architecture Decisions

### Decision 1: Dashboard Ownership (SI-2 BOUNDARY)

**Kinh-dich creates ONLY `apps/kinh-dich-service/dashboard/index.html`**

The fleet-wide SI-2 dashboard index (`docs/dashboards/index.html`) is **stock-price's exclusive deliverable** (Decision 3 Ratification, charter §SI-2 Ownership). It will link to all three pilot dashboards (stock-price, macro-indicators, kinh-dich) once all three are live in Phase 2. This task does **NOT** touch `docs/dashboards/`.

---

### Decision 2: Embedded vs. Fetched Data

**All scenario data embedded inline** (no fetch, no HTTP, no credentials)

Rationale: `file://` URLs cannot use `fetch()` (CORS origin restriction) and should not require a server. Embedding all 11 scenario JSON objects directly in the `<script>` block keeps the dashboard self-contained and trustworthy (user can inspect source, verify no credentials leaked).

---

### Decision 3: Rerun Panel (P1-E Scope)

This task creates a **preview** of the rerun command in AC-7 (footer or modal). The full **edit-rerun handler** (parsing NDJSON output, updating DOM, re-rendering cards) is **P1-E scope** (next task). P1-D is read-only display; P1-E adds the interactive update loop.

---

## Notes

1. **Three panels are responsive:** On desktop (>1100px), show 3 columns. On tablet (700–1100px), show 2 columns. On mobile (<700px), show 1 column stacked.

2. **Primitives panel grouping:** Group the 9 primitive scenarios by their primitive name (3 groups of 3). Each group has a collapsible header showing the group status (NOT-RUN|PASS|FAIL).

3. **Color scheme:** Use stock-price dashboard color scheme for consistency:
   - Green (`#1a7f3c`): PASS
   - Red (`#b91c1c`): FAIL
   - Grey (`#9ca3af`): NOT-RUN
   - Badges: golden=green-bg, edge=yellow-bg, failure=orange-bg

4. **Zero credentials constraint:** Env audit note in AC-6: `env | grep -E 'DB_|API_KEY|SECRET|TOKEN|PASSWORD'` must return empty when the dashboard is opened.

5. **G7 trust contract:** The dashboard is a **living document** — not a static screenshot. Users trust it because they can:
   - See all 11 test scenarios defined and described
   - Understand exactly what each primitive/module/service does
   - Edit scenario input, rerun, and see results update
   - Verify no credentials are embedded (zero fetch, zero network)

6. **G9 user trust:** The dashboard serves as the **artifact** for G9 verification. User can see "Can I tell from this dashboard whether kinh-dich is working?" Answer: yes, by looking at the color of the dots and reading the scenario descriptions.

---

## SSOT Update

In `docs/data/pilot-status-kinh-dich.json`:
- `phase1.current_task` = "P1-D"
- `phase1.current_task_status` = "READY"
- `phase1.current_task_handoff` = "docs/handoffs/TASK_P1-KD-D.md"
- Progress note added: P1-C DONE, G6 dashboard handoff sequenced

---

## Return Checklist

Before writing RETURN block, confirm:

- [ ] AC-1: Dashboard opens via `file://` with zero console errors
- [ ] AC-2: Three panels (Primitives, Module, Microservice) render with proper layout badges
- [ ] AC-3: All 11 scenario objects embedded in `window.__PRIMITIVES_DATA__` + `window.__MODULE_DATA__`
- [ ] AC-4: Cold-start shows all "NOT-RUN" (no fake green)
- [ ] AC-5: Modal opens on click, shows input ↔ output JSON diff
- [ ] AC-6: Microservice panel shows service name, ports, DDD layers, composition info (zero creds)
- [ ] AC-7: Rerun command visible (cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all)
- [ ] AC-8: Legend + footer callouts present
- [ ] AC-9: HTML structure validation: all checks pass
- [ ] AC-10: G12 DoD gate — sandbox all-green evidence pasted ([sandbox] PASS 11/11)
- [ ] SI-2 boundary enforced: `docs/dashboards/index.html` NOT touched

---

## Return

Document completion date and status below:

**To be completed by dev-kinh-dich.**

---

*Handoff authored 2026-05-24T01:55:00Z by pm for kinh-dich pilot-4 Phase 1, P1-D G6 Dashboard.*
