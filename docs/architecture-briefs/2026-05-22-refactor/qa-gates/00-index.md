# QA Gate Checklists — Index

**Parent brief:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Version:** 1.0  **Date:** 2026-05-22  **Author:** Architect

---

## Purpose

These checklists are run by QA to mechanically verify that an artifact (primitive /
module / microservice) has reached a claimed maturity level before the next level is
unblocked. Every item is either a yes/no question or a shell command with an expected
result. No interpretation required.

---

## SSOT for Level State

`docs/data/metric-ladder.json` is the single source of truth for the current level of
every artifact across all 25 metrics.

- **QA updates it on PASS** — immediately after all checklist items in a gate are YES.
- **system-auditor reads it nightly** — flags any drift (artifact file changed without
  level advancing, or level downgraded by a new violation).
- **PM reads it at sprint planning** — to determine which metrics are unblocked for
  the next sprint.

QA must not advance a level without updating this file.

---

## File Map

| File | Contents | Checklists |
|---|---|---|
| `primitive-gates-P1-P3.md` | P-1 SRP, P-2 Port-Driven, P-3 Reusability | 12 checklists |
| `primitive-gates-P4-P7.md` | P-4 Scenario Coverage, P-5 Shape, P-6 Docs, P-7 Dashboard | 16 checklists |
| `module-gates-M1-M4.md` | M-1 Cohesion, M-2 Composition, M-3 No Cross-Module, M-4 Scenario | 16 checklists |
| `module-gates-M5-M7.md` | M-5 Shape, M-6 Docs, M-7 Dashboard | 12 checklists |
| `microservice-gates-S1-S3.md` | S-1 Composition Root, S-2 Module Composition, S-3 E2E Coverage | 12 checklists |
| `microservice-gates-S4-S6.md` | S-4 Deployment Health, S-5 No Leakage, S-6 Dashboard | 12 checklists |
| `cross-cutting-gates-X1-X3.md` | X-1 Bug Count, X-2 Tech Debt, X-3 Doc Freshness | 12 checklists |
| `cross-cutting-gates-X4-X5.md` | X-4 Sandbox Uptime, X-5 Architectural Fence | 8 checklists |
| `phase-exit-gates.md` | Phase 0 → Phase 6 exit gates + Phase 1→2 go/no-go | 9 gate blocks |
| `standing-rules-checks.md` | Capacity reservation, module-freeze, scenario-refresh, fence enforcement | 4 rule blocks |

**Total gate checklists:** 100 metric gates + 9 phase exit gates + 4 standing-rule checks.

---

## How QA Uses These Checklists

1. Owner (developer or Architect) claims an artifact reached level Lx.
2. PM raises a gate request: "Verify `packages/primitives/ta-rsi-calculator/` at P-1 L2."
3. QA opens the relevant file (e.g., `primitive-gates-P1-P3.md`), locates the
   `P-1 L1 → L2 Gate` section.
4. QA runs each `Verify:` command exactly as written, substituting the artifact name.
5. Each item marked `[x]` when it produces the expected result.
6. If ALL items pass → QA writes `PASS` in the PR comment and updates
   `docs/data/metric-ladder.json` entry for this artifact + metric to the new level.
7. If ANY item fails → see escalation rules below.

---

## Escalation Rules

### 1 item failing
- Dispatch a `fixer` signal to the dev-* zone owner with the exact failing item text.
- Do not reject the entire gate.
- Re-run that single item after fix; if it passes, proceed to PASS.

### 2+ items failing
- Reject gate entirely.
- Comment on PR: "Gate REJECTED — N items failing. Artifact must re-cycle through
  dev-* zone. Re-submit gate request after all items are fixed."
- Do NOT update `metric-ladder.json`.

### ⚠️ NEEDS SHARPENING items
- These are metrics that cannot be mechanically verified as currently defined.
- QA cannot pass or fail these items — they need metric refinement.
- Escalate to Architect: "Metric X at level Y has a NEEDS SHARPENING flag — cannot
  run QA gate until metric definition is tightened."
- PM blocks the level transition until Architect sharpens the definition.

### Level regression (artifact drops below claimed level)
- If a nightly system-auditor scan shows `metric-ladder.json` claims L2 but a
  violation now exists → open a bug signal to dev-* zone owner.
- Do NOT silently update `metric-ladder.json` backward without PM notification.

---

## Notation

- `<name>` = artifact name (e.g., `ta-rsi-calculator`, `kinh-dich`, `mcp-server`)
- `<service>` = microservice app folder name (e.g., `mcp-server`, `kinh-dich-service`)
- All shell commands assume `cwd = project root` unless otherwise stated.
- `→ exit 0` means the command must exit with code 0 (no error).
- `→ empty` means the command must produce no output.
- `→ N` means the numeric output must equal N (or satisfy the stated comparison).
