---
task_id: "P2-I"
phase: "2"
pilot: "stock-price"
authored_by: "pm"
authored_at: "2026-05-24T01:30:00Z"
previous_task: "P2-H (DONE 2026-05-24T01:29:51Z, composition root + OpenAPI contract)"
next_task: "P2-J (G8 honest-red deliberate-break proof)"

g6_goal_title: "Three-level dashboard renders from JSON traces"
g6_goal_status: "STILL-UNMET (Phase 2 — G6 is EARNED-PENDING from Phase 1, P2-I is finalization task)"
si2_goal_title: "SI-2: Fleet dashboard index genesis"
si2_ownership: "EXCLUSIVE to stock-price per ratification Decision 3 — first pilot to hit G6"

owner: "dev-stock-price"
wip_policy: "WIP=1 sequential; PM dispatches single task; dev-stock-price executes all ACs before DONE signal"

---

# P2-I — G6/SI-2: Dashboard Finalization + SI-2 Fleet Index Genesis

**Pilot:** stock-price (fleet pilot 3)  
**Phase:** 2  
**Blocked by:** P2-H DONE  
**Blocks:** P2-J  
**Sprint deadline:** 2026-07-04  

---

## Goal Background

**G6 — "Three-level dashboard renders from JSON traces"**

The stock-price service dashboard (`apps/stock-price/dashboard/index.html`) was created in Phase 1 task P1-D as a stub with 3 panels in NOT-RUN state (primitives + module + microservice). P2-I finalizes the dashboard:
- Add a "Deprecated" section noting `pkg/domain/_deprecated/services_v1.go` (G5a evidence)
- Link the OpenAPI contract created in P2-H
- Update the microservice panel with real port facts (5000 internal / 5010 external) from system-map.json
- All existing panel cards remain; P2-I is additive only

**SI-2 — "Fleet Dashboard Index Genesis"**

Per ratification Decision 3, stock-price is the FIRST fleet pilot to hit G6. Therefore, dev-stock-price OWNS the exclusive creation of `docs/dashboards/index.html` — the fleet-level dashboard index that links out to each microservice's per-service dashboard.

- Static HTML, `file://` accessible, zero network calls, zero CDN
- One row per microservice from system-map.json
- Each row: service name, zone path, link to per-service dashboard, status badge
- stock-price row: ACTIVE (has a complete dashboard)
- technical-analysis & macro-indicators rows: ARCHIVED-CLOSED (pilot DONE, FROZEN)
- All other services: NOT-YET-ACTIVE (no dashboard yet)
- Zero credentials, zero live API calls, zero CGO references

---

## Charter Context

From `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md` §P2-I:

> **SI-2 ownership:** stock-price is the FIRST fleet pilot to hit G6. Per pilot charter §G6 and ratification Decision 3, `dev-stock-price` OWNS the creation of `docs/dashboards/index.html`. No other pilot may create or modify this file.

---

## Acceptance Criteria (7 total)

### AC-1 — Per-Service Dashboard Finalized

**Assertion:**
```bash
test -f apps/stock-price/dashboard/index.html && echo FOUND
```

**Expected outcome:** Echoes FOUND

**Content requirements:**
- Phase-1 stub remains: 3 panels (primitives, module, microservice) with original cards
- **NEW**: Add a "Deprecated" section listing `apps/stock-price/pkg/domain/_deprecated/services_v1.go` (trust layer evidence of G5a)
- **UPDATED**: Microservice panel now shows port facts: 5000 (internal) / 5010 (external) — cite `docs/data/system-map.json` as source, NOT hardcoded HTML prose
- **UPDATED**: Link to OpenAPI contract created in P2-H: `../api/openapi.yaml` or full relative path to `apps/stock-price/api/openapi.yaml`

**Rationale:** Dashboard finalization proves the microservice facts are concrete (real ports from system-map) and the G5a deprecation is visible (honest about what was replaced).

**Failure mode:** If file missing or content incomplete, dev-stock-price must add the missing sections before DONE.

---

### AC-2 — SI-2 Fleet Index Created

**Assertion:**
```bash
test -f docs/dashboards/index.html && echo FOUND
```

**Expected outcome:** Echoes FOUND

**Fleet index specification:**
- Static HTML, `file://` accessible
- Zero external CDN, zero network calls, zero `<script src="http">` tags
- One row per microservice in the fleet (query from `docs/data/system-map.json` OR use the canonical list below)

| Microservice | Zone Path | Per-Service Dashboard Link | Status Badge |
|---|---|---|---|
| stock-price | apps/stock-price | `../../apps/stock-price/dashboard/index.html` | ACTIVE |
| technical-analysis | apps/technical-analysis | `../../apps/technical-analysis/dashboard/index.html` | ARCHIVED-CLOSED |
| macro-indicators | apps/macro-indicators | `../../apps/macro-indicators/dashboard/index.html` | ARCHIVED-CLOSED |
| kinh-dich-service | apps/kinh-dich-service | (not yet active) | NOT-YET-ACTIVE |
| alert-engine | apps/alert-engine | (not yet active) | NOT-YET-ACTIVE |
| news-fetch | apps/news-fetch | (not yet active) | NOT-YET-ACTIVE |
| pdf-extractor | apps/pdf-extractor | (not yet active) | NOT-YET-ACTIVE |
| rag-service | apps/rag-service | (not yet active) | NOT-YET-ACTIVE |

**Rationale:** Fleet index is the entry point for users to explore all pilot dashboards. stock-price is the only operational pilot at this point; others are either closed (TA, macro) or not yet reached G6 (all others).

**Failure mode:** If file missing or rows incomplete, dev-stock-price must create/fix it before DONE.

---

### AC-3 — Fleet Index Row Count and Badge Coverage

**Assertion:**
```bash
grep -c "ACTIVE\|NOT-YET-ACTIVE\|ARCHIVED-CLOSED" docs/dashboards/index.html
```

**Expected outcome:** Returns ≥ 8 (one status badge per microservice in scope)

**Rationale:** Verifies all microservices are represented in the index.

**Failure mode:** If count < 8, dev-stock-price must add missing service rows before DONE.

---

### AC-4 — PO Playwright Compatibility (Path B Pre-Check for P2-K)

**Assertion (manual or headless dry-run):**

Per-service dashboard AND fleet index both render correctly in chromium-headless-shell preview (cold open, no network):

- ZERO console errors in Playwright log
- ZERO pageerrors
- ZERO requestfailed
- All primitive + module + microservice cards visible in DOM for per-service dashboard
- All fleet service rows visible in DOM for fleet index

**Rationale:** P2-K (G9 PO Playwright task) will run the formal Playwright test. P2-I AC-4 is a pre-check to ensure both dashboards are Playwright-ready before QA hands off to PO.

**Paste to handoff evidence section:** Description of dry-run (manual browser open or headless preview command + output summary). Evidence that all cards/rows are visible and no console errors.

**Failure mode:** If console errors or missing cards, dev-stock-price must fix the HTML before DONE.

---

### AC-5 — Zero Credentials in Both HTML Files

**Assertion:**
```bash
grep -c "DB_PATH\|STOCK_PRICE_DB\|API_KEY\|SECRET\|TOKEN\|PASSWORD\|mattn" \
  apps/stock-price/dashboard/index.html \
  docs/dashboards/index.html
```

**Expected outcome:** Returns 0 total matches across both files

**Rationale:** Both dashboards are served via `file://` to untrusted users. Zero credentials must leak into HTML source.

**Failure mode:** If count > 0, dev-stock-price must remove all credential references before DONE.

---

### AC-6 — SI-2 Exclusivity Confirmed

**Assertion:**
```bash
git log --oneline docs/dashboards/index.html
```

**Expected outcome:** Returns ONLY the P2-I commit (stock-price is the sole author of this file)

**Rationale:** Per Decision 3 ratification, no other pilot may touch `docs/dashboards/index.html`. This assertion proves stock-price is the exclusive creator.

**Failure mode:** If git log shows commits from other pilots or other tasks, the file was modified outside P2-I scope — STOP and investigate.

---

### AC-7 — G12 DoD Gate (Dashboard Green Before DONE)

**Assertion:**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```

**Expected outcome:** Exits 0

**Evidence:** Paste full sandbox output to the `§Evidence` section below (all scenario verdicts visible).

**Rationale:** No task can be marked DONE without sandbox all-green (G12 DoD rule baked into dev-stock-price flow). Dashboard finalization must not break existing scenarios.

**Failure mode:** If exit non-zero, dev-stock-price must debug sandbox failures before re-running.

---

## Implementation Notes

**Files to modify:**

| File | Action | Notes |
|------|--------|-------|
| `apps/stock-price/dashboard/index.html` | MODIFY | Add G5a _deprecated note; link OpenAPI; update microservice panel port facts from Phase-1 stub |

**Files to create:**

| File | Action | Notes |
|------|--------|-------|
| `docs/dashboards/index.html` | CREATE | SI-2 fleet dashboard index; **stock-price OWNS this file exclusively** (Decision 3 ratification) |

**Not touched (frozen):**
- All other pilots' zones (`apps/technical-analysis/`, `apps/macro-indicators/`, `apps/kinh-dich-service/`)
- `docs/data/pilot-status-stock-price.json` (PM-owned SSOT)
- `docs/data/system-map.json` (frozen, query-only for microservice facts)

**Port wiring guidance for microservice panel:**

Do NOT hardcode port numbers in HTML prose. Instead:

Option A: Query system-map.json at build/authoring time
```
Example in HTML comment/source:
<!-- Port facts sourced from docs/data/system-map.json: stock-price 5000 (internal) / 5010 (external) -->
```

Option B: Reference the file name in dashboard prose
```
Example in HTML:
<p>Internal port: 5000 (per docs/data/system-map.json)</p>
<p>External port: 5010 (per docs/data/system-map.json)</p>
```

Recommended: Option B (cite the SSOT file, do not embed literal values in panel content).

**OpenAPI link guidance:**

Link to the OpenAPI YAML contract created in P2-H:
```html
<p><a href="../api/openapi.yaml">OpenAPI Contract (3.0.x)</a></p>
```

Adjust the relative path based on the dashboard location.

---

## Evidence

### AC-1 Output (Per-Service Dashboard Finalized)

```
[dev-stock-price: paste output of `test -f apps/stock-price/dashboard/index.html && echo FOUND`]
Expected: FOUND
```

File content inspection (paste first 50 lines of apps/stock-price/dashboard/index.html):
```html
[dev-stock-price: paste first 50 lines of the finalized dashboard]
```

### AC-2 Output (SI-2 Fleet Index Created)

```
[dev-stock-price: paste output of `test -f docs/dashboards/index.html && echo FOUND`]
Expected: FOUND
```

File content (paste first 50 lines of docs/dashboards/index.html):
```html
[dev-stock-price: paste first 50 lines of the fleet index]
```

### AC-3 Badge Count

```
[dev-stock-price: paste output of `grep -c "ACTIVE\|NOT-YET-ACTIVE\|ARCHIVED-CLOSED" docs/dashboards/index.html`]
Expected: ≥ 8
```

### AC-4 Playwright Dry-Run

```
[dev-stock-price: paste dry-run verification output]

Example:
- Opened file://apps/stock-price/dashboard/index.html in chromium-headless-shell
- Verified: all 3 panels visible (primitives, module, microservice)
- Verified: all cards rendered in DOM
- Verified: zero console errors, zero pageerrors, zero requestfailed
- Opened file://docs/dashboards/index.html
- Verified: all 8 service rows visible
- Verified: zero console errors
```

### AC-5 Credentials Grep

```
[dev-stock-price: paste output of the credentials grep across both HTML files]
Expected: 0
```

### AC-6 SI-2 Exclusivity

```
[dev-stock-price: paste output of `git log --oneline docs/dashboards/index.html`]
Expected: Single P2-I commit (no prior commits on this file from other pilots)
```

### AC-7 G12 DoD Sandbox Output

```
[dev-stock-price: paste full output of:
  cd apps/stock-price
  go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
]

Expected: Exit 0, all scenario verdicts PASS/OK
```

---

## Commit Guidance

**Pattern:**
```
feat(stock-price): P2-I — dashboard finalization + SI-2 fleet index genesis (G6)
```

**Files in commit:**
- `apps/stock-price/dashboard/index.html` (modified)
- `docs/dashboards/index.html` (created)

**Pre-commit checks (dev-stock-price):**
1. All 7 ACs pass locally
2. Sandbox all-green (AC-7)
3. No foreign files staged (`git diff --cached --name-only` shows only stock-price paths + dashboards/)
4. Anchor still intact: `git merge-base --is-ancestor debba8eaff0724d1fb32fc9d28640201cc32d1cc HEAD` → exit 0

**L84 explicit-file staging:**
```bash
git add apps/stock-price/dashboard/index.html
git add docs/dashboards/index.html
```

NEVER use `git add -A` or `git add .` (rule L84).

---

## G-Goal Posture

**NO goal flips.** Per Charter §4.5:
- `goalsEarned` stays 0 throughout Phase 2
- `decisionMatrix` (speed, trust, scale) stays all-TBD
- Goal state changes are PO-only, atomic with 12/12 terminal close in Phase 3

This task finalizes G6 evidence but does NOT flip G6 status to YES. PO flips all G-goals together at Phase 3 close.

---

## Constraints & Discipline

| Constraint | Rule |
|-----------|------|
| **WIP=1** | No parallel tasks. Dev-stock-price completes P2-I before PM dispatches P2-J |
| **No branches** | All work on `main` |
| **No destructive git** | No `--force`, no `--amend`, no `--no-verify`, no `git push` of source files |
| **Anchor INTACT** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor of HEAD |
| **SSOT frozen** | PM-owned `docs/data/pilot-status-stock-price.json` not modified by dev |
| **Zone isolation** | Do NOT modify `apps/kinh-dich-service/`, `apps/technical-analysis/`, `apps/macro-indicators/`, or other pilots' zones |
| **SI-2 exclusive** | Only stock-price (P2-I) creates `docs/dashboards/index.html`. No other pilot touches that file. |
| **G12 DoD gate** | Sandbox all-green before DONE; no dashboard-ready-to-grade without green sandbox |

---

## Next Task

**P2-J** — G8 honest-red deliberate-break proof

Blocked by: P2-I DONE (dashboard finalized — honest-red test requires a working dashboard to show RED when scenarios are corrupted)

---

## References

- **Phase 2 Task Plan:** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md` §P2-I
- **Charter:** `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md`
- **SSOT:** `docs/data/pilot-status-stock-price.json`
- **System facts:** `docs/data/system-map.json` (query for fleet microservices + stock-price port)
- **G6 calibration:** Charter §Goal G6 — defines the 3-level dashboard specification
- **SI-2 decision:** `docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md` Decision 3 — stock-price owns SI-2 fleet index genesis

---

**Authored by:** pm  
**Authored at:** 2026-05-24T01:30:00Z  
**Charter §4.5 binding:** NO goal flips in Phase 2. PO flips goals only at 12/12 terminal close.
