---
title: "TASK_P1-E1 — Dashboard Stub HTML (macro-indicators pilot, Phase 1 streak #3)"
date: "2026-05-23T113400Z"
author: "pm (c282 cycle-38)"
task_id: "P1-E1"
pilot: "macro-indicators"
phase: "1"
phase_stage: "E-bucket (dashboard stub + edit-rerun)"
cycle: "c282"
cycle_number: 38
owner: "dev-macro-indicators"
estimate: "2.0 hours"
priority: "HIGH"
goals: ["G6", "G8", "G9", "G12"]
blocked_by: ["P1-C1", "P1-D2"]
blocks: ["P1-E2"]
handoff_date: "2026-05-23T113400Z"
dispatch_signal_ref: "docs/signals/pm-dispatch-dev-macro-p1-e1-<UTC>.json"
qa_signal_expected: "docs/signals/qa-macro-p1-e1-green-<UTC>.json"
status: "DISPATCH"
---

# TASK_P1-E1 — Dashboard Stub HTML

**G12 Streak Task #3 (CRITICAL PATH TO PHASE 1 COMPLETION)**

## Summary

Create `apps/macro-indicators/dashboard/index.html` — a static HTML5 dashboard that renders 3 panels (Primitives, Module, Microservice) with honest NOT-RUN status display. This task is **Phase 1 streak task #3 of 3** for G12 grading; sandbox must be GREEN before commit.

**Streak context:** P1-B1 (#1), P1-C1 (#2), P1-E1 (#3). All three must achieve sandbox-green before DONE to qualify for G12 grade.

---

## Acceptance Criteria

### AC-1 — Static HTML opens without server

**Requirement:** Dashboard file must open via `file://` protocol in browser (no HTTP server required). Zero network calls on open.

**Verification:**
```bash
# Smoke test: file opens in headless
google-chrome --headless --no-sandbox \
  file:///Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/macro-indicators/dashboard/index.html
# Expect: Clean exit, no ECONNREFUSED, no hanging
```

**Gate:** If dashboard makes any `fetch()` / `XMLHttpRequest` on load, AC-1 FAILS.

---

### AC-2 — Three panels rendered correctly

**Requirement:** Dashboard displays exactly 3 cards:
1. **Primitives panel** — shows 1 card for "macro-investment-clock" primitive with status = NOT-RUN
2. **Module panel** — shows 1 card for "macro-signals" module with status = NOT-RUN
3. **Microservice panel** — shows 1 card for "macro-indicators" service info (name, port 5004, language Go)

**Verification:**
```bash
# Manual check: open in browser, visually confirm 3 panels visible
# OR automated: parse DOM
grep -c 'macro-investment-clock\|Primitives' apps/macro-indicators/dashboard/index.html
# Expect: ≥1
grep -c 'macro-signals\|Module' apps/macro-indicators/dashboard/index.html
# Expect: ≥1
grep -c 'macro-indicators\|Microservice' apps/macro-indicators/dashboard/index.html
# Expect: ≥1
```

---

### AC-3 — Status display is honest (NOT-RUN before sandbox executes)

**Requirement:** Cards display "NOT-RUN" status when sandbox has not yet executed. Do NOT hardcode any GREEN status. Status must be updated ONLY after sandbox rerun (P1-E2).

**Verification:**
```bash
# Inspect dashboard source: search for status="NOT-RUN" or similar
grep 'NOT-RUN' apps/macro-indicators/dashboard/index.html
# Expect: Present ≥3 times (once per card)
# Fail if: Any hardcoded GREEN status found for primitives or module before rerun
```

---

### AC-4 — Renders in chromium-headless-shell (Playwright compatible)

**Requirement:** Dashboard must render without console errors when invoked via chromium-headless-shell (PO's Playwright path B for G9 verification). Zero console errors, page errors, or request failures.

**Verification:**
```bash
# PO will run via Playwright (actual implementation deferred to P1-E2)
# Dev baseline: ensure no obvious JS errors in HTML (balanced tags, etc.)
# Linter check (optional): htmlhint or similar validates structure
```

**Gate:** If dashboard has unbalanced tags, syntax errors, or obvious JS issues, AC-4 FAILS.

---

### AC-5 — Zero secrets in HTML source

**Requirement:** Dashboard must NOT contain FRED_API_KEY, DB_PASSWORD, or other secrets.

**Verification:**
```bash
grep -c "FRED_API_KEY\|DB_PASSWORD\|SECRET\|TOKEN" apps/macro-indicators/dashboard/index.html
# Expect: 0 (exit 1)
```

---

### AC-6 — Clone TA technical-analysis dashboard layout and color scheme

**Requirement:** Reuse TA's proven layout pattern from `apps/technical-analysis/dashboard/index.html`. Copy color scheme, card structure, header/footer sections. Substitute macro-indicators content (names, descriptions, port numbers).

**Reference:** `apps/technical-analysis/dashboard/index.html` (anchor commit `1776df8e`)

**Implementation notes:**
- Clone HTML structure (header, panels, footer)
- Clone CSS (color palette, card styling, fonts)
- Replace all "technical-analysis" references with "macro-indicators"
- Replace primitive/module names with macro-specific ones
- Substitute port (TA=5003 → macro=5004)
- Keep response-friendly layout (scales to mobile if applicable)

---

### AC-7 — G12 DoD GATE (HARD RULE — BLOCKS COMMIT)

**Requirement:** Sandbox must exit 0 with ALL scenarios GREEN before P1-E1 is marked DONE.

**Correct invocation:**
```bash
cd apps/macro-indicators

# Primitive-tier test (P1-B1 output)
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
# Expect: exit 0, 3/3 PASS (golden, edge, failure)

# Module-tier test (P1-C1 + P1-D2 output)
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
# Expect: exit 0, 2/2 PASS (golden, edge)

# All-tier regression (entire pipeline)
go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
# Expect: exit 0, 5/5 PASS (3 primitive + 2 module)
```

**CRITICAL NOTE — Sandbox CLI Flag Requirement:**
QA observation cycle-38: sandbox CLI REQUIRES `-module` flag with `-tier=all`. Without it, sandbox errors. The **correct** invocation syntax:
```
go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
```
NOT ~~`go run ./cmd/sandbox -tier=all -scenario=all`~~ (missing -module flag).

**Evidence requirement:** Paste sandbox output summary (all 3 tiers) into RETURN block before marking DONE. If ANY scenario is RED, task is NOT done. Fix, re-run.

**Failure mode:** If sandbox exits non-zero, P1-E1 BLOCKS and returns to dev for fix.

---

## Forward Risks & Constraints

### R-1 — Deterministic Rendering (Inherited from P1-B1)

**Constraint:** Dashboard HTML rendering must be deterministic. No `Math.random()` for IDs, no timestamps in initial load. If any ID/state is randomized, tests become flaky.

**Verification:**
```bash
grep -E 'Math\.random|Date\.now|random|Math\.' apps/macro-indicators/dashboard/index.html
# Expect: 0 matches (or only in comments)
# UUID libraries OK only if initialized deterministically (not per-render)
```

**Gate:** R-1 is non-blocking for AC verification but **gating evidence** for G12 grading.

### R-3 — Phase 2 MCP Tool Handler HTTP Rewires (Forward-flagged)

P1-E1 does NOT modify MCP tools. Phase 2 P2-B (TA pilot pattern) will rewire 4 macro-indicators MCP tools to use HTTP instead of direct imports.

Tools to rewire in Phase 2:
- `get_macro_snapshot`
- `get_carry_trade_signal`
- `get_yield_spread_signal`
- `get_macro_calendar`

Do NOT attempt rewires in Phase 1.

### L84 — Explicit File Staging (Hard Rule)

**Constraint:** Only 1 file per commit. Use explicit `git add <file>` — never `-A` or `.`.

**Staging:**
```bash
git add apps/macro-indicators/dashboard/index.html
```

---

## Defensive Gates

| Gate | Status | Evidence | Blocking |
|---|---|---|---|
| **G12 DoD** | BINDING | Sandbox all-tiers exit 0 (5/5 PASS) | YES — blocks DONE |
| **R-1 determinism** | BINDING-GATING | grep -E Math.random → 0 (non-blocking audit) | NO — evidence only |
| **Anchor 1776df8e** | BINDING | `git merge-base --is-ancestor 1776df8e HEAD` = 0 | YES |
| **L84 compliance** | BINDING | 1 file per commit (explicit paths) | YES |
| **Forbidden zones** | BINDING | No apps/technical-analysis/, .golangci.yml, .github/workflows/ | YES |

---

## Implementation Guidance

### Step 1: Clone TA dashboard structure

Reference: `apps/technical-analysis/dashboard/index.html` (anchor `1776df8e`)

```bash
# Copy TA dashboard as starting point
cp apps/technical-analysis/dashboard/index.html \
   apps/macro-indicators/dashboard/index.html
```

### Step 2: Substitute macro-indicators content

Replace all TA-specific references:

| Replace | With |
|---|---|
| `technical-analysis` | `macro-indicators` |
| `TA primitives` | `macro-indicators primitives` |
| Port 5003 | Port 5004 |
| TA card descriptions | Macro card descriptions |
| `get_technical_analysis_*` tool names | Macro tool names (or leave as placeholder for P1-E2) |

### Step 3: Add 3-panel structure

Ensure dashboard HTML includes:

```html
<div id="primitives-panel">
  <h2>Primitives</h2>
  <div class="card">
    <h3>macro-investment-clock</h3>
    <div class="status">NOT-RUN</div>
  </div>
</div>

<div id="module-panel">
  <h2>Module</h2>
  <div class="card">
    <h3>macro-signals</h3>
    <div class="status">NOT-RUN</div>
  </div>
</div>

<div id="microservice-panel">
  <h2>Microservice</h2>
  <div class="card">
    <h3>macro-indicators</h3>
    <p>Port: 5004 | Language: Go</p>
  </div>
</div>
```

### Step 4: Verify no network calls on load

Ensure no `<script>` tags that fetch external resources. All assets (CSS, JS) must be inline or local.

### Step 5: Smoke checks

```bash
cd apps/macro-indicators

# Build check
go build ./...
# Expected: exit 0

# Go vet
go vet ./...
# Expected: exit 0

# Sandbox primitive-tier (inherited from P1-B1)
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
# Expected: exit 0, 3/3 PASS

# Sandbox module-tier (inherited from P1-C1 + P1-D2)
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
# Expected: exit 0, 2/2 PASS

# Sandbox all-tier (regression)
go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
# Expected: exit 0, 5/5 PASS

# Secrets check
grep -c "FRED_API_KEY\|DB_PASSWORD\|SECRET" apps/macro-indicators/dashboard/index.html
# Expected: 0 (exit 1)

# Open in browser
file:///Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/macro-indicators/dashboard/index.html
# Expected: Renders cleanly, 3 panels visible, NOT-RUN status on all cards
```

---

## Commit Message Template

```
feat(macro-indicators): P1-E1 — dashboard stub HTML (3 panels, NOT-RUN state, TA pattern clone)

Advances G6 (dashboard exists), G8 (honest status), G9 (Playwright renders), G12 (sandbox GREEN streak #3).

- apps/macro-indicators/dashboard/index.html (NEW)

Content: 3 panels (Primitives, Module, Microservice) with honest NOT-RUN status display.
Layout cloned from TA pilot apps/technical-analysis/dashboard/index.html.
All macro-indicators branding, port 5004, Go language info.

G12 DoD verification: All 3 sandbox tiers GREEN before commit.
- go run ./cmd/sandbox -tier=primitive ... → 3/3 PASS
- go run ./cmd/sandbox -tier=module ... → 2/2 PASS
- go run ./cmd/sandbox -tier=all ... → 5/5 PASS

R-1 determinism check: Zero Math.random in HTML (inherited P1-B1 standard).
L84 discipline: Single file, explicit staging.
Anchor 1776df8e held.
```

---

## RETURN Block (Dev → QA)

```
## DEV COMPLETION SUMMARY

**Task:** P1-E1 (Dashboard stub HTML)
**Owner:** dev-macro-indicators
**Status:** READY FOR QA

### Files Modified
- apps/macro-indicators/dashboard/index.html (CREATE, NEW)

### Commits
- <impl_commit_sha> — P1-E1 dashboard stub implementation
- <signal_commit_sha> — dev completion signal

### Sandbox Verification (G12 DoD)

All 3 tiers executed and passing:

**Primitive-tier (3/3 PASS):**
```
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
[output pasted here]
total=3 pass=3 fail=0 status=OK
```

**Module-tier (2/2 PASS):**
```
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
[output pasted here]
total=2 pass=2 fail=0 status=OK
```

**All-tier regression (5/5 PASS):**
```
go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
[output pasted here]
total=5 pass=5 fail=0 status=OK
```

### Smoke Checks

- [x] HTML file created at `apps/macro-indicators/dashboard/index.html`
- [x] Opens via `file://` protocol (no HTTP server required)
- [x] 3 panels rendered: Primitives, Module, Microservice
- [x] All cards show NOT-RUN status (honest state before rerun)
- [x] Zero console errors in chromium-headless-shell (manual check)
- [x] Zero secrets in HTML: `grep -c FRED_API_KEY|DB_PASSWORD|SECRET` → 0
- [x] Layout cloned from TA dashboard (apps/technical-analysis/dashboard/index.html)
- [x] Port 5004, Go language info substituted correctly
- [x] Anchor 1776df8e held: `git merge-base --is-ancestor 1776df8e HEAD` = 0
- [x] L84 compliance: 1 file per commit, explicit staging

### Critical Notes

**G12 Streak Task #3/3:** This is the final streak task. P1-B1 (#1) and P1-C1 (#2) both achieved sandbox-green before DONE. P1-E1 (#3) now completes the 3-task streak requirement for G12 grade certification.

**Dashboard Status Display:** Cards show NOT-RUN initially. Edit-rerun capability (P1-E2) will wire up the rerun handler to update status to GREEN/RED after scenario execution.

**No Network Calls on Load:** Dashboard is fully static; no fetch() or external API calls on page open.

### Deviations (if any)

[List any deviations from AC acceptance criteria here, with PM/QA concurrence]

### Backward Compatibility

N/A — new file only.

---

**Ready for QA verification:** AC-1 through AC-7.
**Expected QA signal:** docs/signals/qa-macro-p1-e1-green-<UTC>.json
```

---

## QA Verification Checklist

### AC-1 — Static HTML opens without server
- [ ] File opens via `file://` in browser
- [ ] Zero network errors on open
- [ ] Go build + go vet both exit 0 (regression check)

### AC-2 — Three panels rendered
- [ ] Primitives panel visible with macro-investment-clock card
- [ ] Module panel visible with macro-signals card
- [ ] Microservice panel visible with service info (port 5004, Go)

### AC-3 — Honest NOT-RUN status
- [ ] All 3 cards show "NOT-RUN" status (not GREEN)
- [ ] Status text visible in HTML source or DOM

### AC-4 — Playwright compatible
- [ ] No console errors in headless render
- [ ] No page errors or request failures

### AC-5 — Zero secrets
- [ ] `grep -c FRED_API_KEY|DB_PASSWORD|SECRET` → 0 (exit 1)

### AC-6 — TA pattern clone
- [ ] Layout structure mirrors TA dashboard
- [ ] Color scheme consistent with TA
- [ ] Macro-indicators branding applied

### AC-7 — G12 DoD GATE (HARD)
- [ ] Sandbox primitive-tier: exit 0, 3/3 PASS
- [ ] Sandbox module-tier: exit 0, 2/2 PASS
- [ ] Sandbox all-tier: exit 0, 5/5 PASS
- [ ] All three output summaries pasted in RETURN block
- [ ] **If ANY sandbox tier is RED:** task returns to dev for fix (non-blocking does not apply)

### Defensive Gates
- [ ] R-1 determinism: `grep -E Math.random|rand` → 0 matches (gating evidence)
- [ ] Anchor 1776df8e: `git merge-base --is-ancestor 1776df8e HEAD` = 0
- [ ] L84 compliance: 1 file per commit, explicit `git add` used
- [ ] Forbidden zones clear: no TA, .golangci.yml, .github/workflows/ touched

---

## Related Documentation

- **Architecture brief:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` (§P1-E1, §G12 DoD Gate)
- **Pilot charter:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` (G6, G8, G9, G12)
- **TA dashboard pattern:** `apps/technical-analysis/dashboard/index.html` (anchor `1776df8e`)
- **PM notebook:** `docs/agent-memory/notebooks/pm.md` (cycle-38 notes)
- **Pilot status SSOT:** `docs/data/pilot-status-macro-indicators.json`

---

## Critical Reminders

1. **G12 DoD GATE IS HARD.** Sandbox must be green on all 3 tiers (primitive, module, all) before commit. No exceptions.
2. **Sandbox CLI syntax:** `-tier=all -module=macro-indicators -scenario=all` (the `-module` flag is required).
3. **NOT-RUN is honest.** Dashboard cards must show NOT-RUN status until P1-E2 wires the rerun handler.
4. **Anchor 1776df8e held.** Every commit must be reachable from this anchor.
5. **L84 discipline:** 1 file, explicit `git add`, no `-A` or `.`.
6. **No network calls on load.** Dashboard is fully static HTML.
7. **P1-E1 is streak task #3/3.** This closes the G12 consecutive-task requirement.

---

**Status:** DISPATCH
**Date:** 2026-05-23T113400Z
**Next:** After P1-E1 DONE + QA GREEN, dispatch P1-E2 (edit-rerun handler + env audit)
