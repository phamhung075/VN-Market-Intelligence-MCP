---
title: "Pilot Charter — technical-analysis microservice refactor"
date: "2026-05-22"
author: "architect"
status: "ACTIVE"
pilot: "technical-analysis"
deadline_sprints: 6
version: "1.0"
---

# Pilot Charter — `technical-analysis` Microservice Refactor

**Binding contract for the three-tier architecture pilot.**
**Scope:** `technical-analysis` only. No other microservice is in scope during this pilot.

---

## Why This Pilot Exists

User pain point (verbatim):
> "AI agents cannot fix bugs complete, they turn around multiple times. I need something I can trust at low level then build to high level. If something not good, we can fix it because we have separate like lego. I need AI write code but quality can easy recheck (using dashboard module idea)."

This pilot is the proof point that the three-tier architecture (primitives → modules → microservices) solves this problem. It proves the claim before the full 14-18 sprint refactor is approved.

**Pilot gate:** if all 12 goals pass the decision matrix → scale to next microservice. See §Decision Matrix.

---

## Kickoff Prerequisites

All of the following must be true before Phase 0 work begins on this pilot:

1. Master brief `docs/architecture-briefs/2026-05-22-deep-module-ddd-with-dashboards.md` is PO-approved (Q-1 through Q-10 signed off or defaulted).
2. `packages/primitives/sandbox-kit/` (narrator + renderer) is extracted and at L3+ — dogfood gate from `07-phases.md` §Phase 1 dogfood ordering applies here too.
3. Baseline metric snapshot exists: all 25 metrics measured at current L-level (Phase 0 of master plan). Required so G10 and G11 have a "before" to compare against.
4. `docs/data/bug-inventory.json` created (see §Baseline Metric Capture). If file does not exist at pilot kickoff, capturing the baseline is the first Phase 0 deliverable.
5. `apps/technical-analysis/` brownfield scan complete — verify which of the 6 DDD layers are already clean vs. need rewiring.

---

## Baseline Metric Capture

Bug-fix cycle baseline is required for G10 (AI-fixability proof). Source: `docs/data/bug-inventory.json`.

**If file does not exist at pilot kickoff:** creating it is a Phase 0 deliverable. Minimum schema:
```json
{
  "generatedAt": "<ISO timestamp>",
  "bugs": [
    {
      "id": "BUG-NNN",
      "module": "<module name>",
      "fixCycles": <integer>,
      "status": "open | resolved"
    }
  ],
  "baselineCycleCount": <average fix cycles for technical-analysis bugs>
}
```
The `baselineCycleCount` field is the number this pilot must beat for G10. If no TA-specific bugs are in inventory, use the system-wide average from `06-metrics-cross-cutting.md` §X-1 baseline (currently 4-6 cycles per the brief).

---

## Anti-Scope-Creep Clause

**This pilot covers `technical-analysis` only.** The following are forbidden while the pilot is active:

- Extracting primitives for any other bounded context (macro, alerts, news, portfolio, sector, etc.)
- Rebuilding modules for any other bounded context
- Rewiring composition roots for any service other than `apps/technical-analysis/`
- Adding goals to this charter mid-pilot

The pilot is a controlled experiment, not a rolling refactor. Creep invalidates the measurement.

**If a compelling opportunity arises in another module during the pilot:** PM creates a backlog task tagged `post-pilot`. It does not start until the 12-goal review is complete.

---

## Hard Deadline

**6 sprints from kickoff.** Kickoff date = first sprint where Phase 0 work begins on this pilot.

No silent extension. At sprint 6 end, PO calls the decision matrix regardless of goal state. If goals are incomplete, the pilot is assessed on what was achieved, not on what was planned.

---

## Security Clause

The sandbox process (used in G7 and throughout Track B) **MUST have zero DB credentials and zero external API keys** at all times. This is not optional.

Enforcement:
- G7 verification includes an env audit: run the sandbox process and confirm `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` returns empty in the sandbox process environment.
- If any credential leaks into the sandbox env, G7 is blocked — it does not pass.
- This clause applies to all scenario JSON execution paths, not just the explicit G7 check.

Rationale: the sandbox is a pure-function environment (JSON in → trace JSON out). Any credential in that environment means the sandbox is not sandbox-isolated, which destroys the security and reproducibility guarantee.

---

## 12 Completion Goals

### Track A — Trust Foundation

---

**G1. Primitives ship with scenarios**

5-8 primitives extracted (`calculate-rsi`, `calculate-macd`, `calculate-bollinger`, `detect-cross`, `classify-zone`, …). Each primitive has ≥3 scenario JSON files (happy + edge + failure). All scenarios pass.

Verification method: Run `bun run sandbox --tier=primitive --module=technical-analysis`. All scenario files execute without error. QA counts scenario files: minimum 3 per primitive × 5 primitives = 15 files. QA checks that at least 1 file is a failure scenario (input produces expected error/null, not an exception).

Owner agent: `dev-technical-analysis`

---

**G2. Module composes primitives via ports**

`packages/modules/technical-analysis/` exists. Imports primitives via interface, never reaches into other modules. Has its own multi-primitive scenarios.

Verification method: QA runs `grep -r "from.*packages/modules/" packages/modules/technical-analysis/src/` — must return 0 results (no cross-module imports). QA runs `grep -r "from.*packages/primitives/" packages/modules/technical-analysis/src/` — must return results pointing only to `technical-analysis` primitives, not primitives from other domains. QA runs the module-level sandbox and verifies ≥1 multi-primitive scenario (one story that exercises ≥2 primitives in sequence).

Owner agent: `dev-technical-analysis`

---

**G3. Microservice has clean composition root**

`apps/technical-analysis/composition-root.ts` wires module + adapters. No business logic in composition root. HTTP interface contract documented.

Verification method: QA reads `apps/technical-analysis/composition-root.ts` — file must contain only: import statements, interface wiring (DI bindings), and server startup. No `if` conditions on data values, no calculations, no domain logic. QA checks that `apps/technical-analysis/src/interface/` contains an HTTP contract document (OpenAPI YAML or equivalent). QA runs `grep -r "calculateRSI\|calculateMACD\|detectCross\|classifyZone" apps/technical-analysis/composition-root.ts` — must return 0 (domain operations must not appear in composition root).

Owner agent: `dev-technical-analysis`

---

**G4. Architecture fence enforced in CI**

Lint blocks primitive→module imports, module→module direct imports, service wiring outside composition root. CI fails on violation (proven by 1 deliberate violation in PR).

Verification method: QA introduces 1 deliberate violation (e.g., adds `import { something } from "../../packages/modules/kinh-dich"` inside a technical-analysis primitive), opens a PR, and confirms CI fails on the ESLint fence rule. QA removes the violation, confirms CI passes. Evidence: PR link with the deliberate-violation CI failure screenshot or log.

Owner agent: `dev-technical-analysis` (fence implementation) + `qa` (violation proof)

---

**G5. Old TA code deleted**

`services/mcp-server/src/.../technical-analysis/` removed. All callers point to new microservice. No "TODO: migrate" comments.

Verification method: QA runs `find apps/mcp-server/src -path "*technical*" -name "*.ts"` — must return 0 results. QA runs `grep -r "TODO.*migrat" apps/mcp-server/src/ apps/technical-analysis/src/` — must return 0 results. QA verifies all MCP tool handlers that previously called `technicalIndicators.ts` now route via HTTP to `apps/technical-analysis/`. Integration test for the TA MCP tool passes end-to-end.

Owner agent: `dev-technical-analysis`

---

### Track B — Dashboard Trust Layer

---

**G6. Three-level dashboard renders from JSON traces**

Primitive / module / service level. All three open from one HTML index.

Verification method: QA opens `apps/technical-analysis/dashboard/index.html` in a browser (no server required — file:// URL). Three panels visible: Primitives, Module, Microservice. QA clicks one card in each panel and verifies a detail view renders. No JavaScript console errors. Evidence: QA screenshot of all three panels open.

Owner agent: `dev-technical-analysis`

---

**G7. Edit-JSON-and-rerun works**

User edits scenario JSON, refreshes dashboard, sees new result. ZERO DB credentials in sandbox process. ZERO external API keys.

Verification method: QA opens a primitive scenario JSON file, changes one input value (e.g., changes an RSI input price array), saves the file, runs `bun run sandbox --tier=primitive --scenario=<file>`, refreshes the dashboard, and confirms the new output is reflected. QA runs env audit: `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` in the sandbox process environment returns empty. Evidence: before/after dashboard screenshots + env audit output.

Owner agent: `dev-technical-analysis`

---

**G8. Red/green status is honest**

Dashboard shows red when scenario fails (proven by 1 deliberate broken primitive). No false greens (QA runs 5 known-bad scenarios).

Verification method: QA introduces 1 deliberate bug in a primitive (e.g., makes `calculate-rsi` return a hardcoded wrong value). QA reruns the sandbox. Dashboard must show that primitive's card as red. QA then creates 5 scenario JSON files with intentionally wrong expected outputs (outputs that do not match what the code produces). QA runs all 5 through the sandbox and confirms all 5 show red on the dashboard. Evidence: 6 red cards total visible in dashboard screenshots.

Owner agent: `qa` (verification) + `dev-technical-analysis` (dashboard honesty implementation)

---

**G9. Dashboard is the trust contract**

User verifies "RSI working correctly" from dashboard alone. Confirmed verbally by user at pilot review.

Verification method: At pilot review meeting, user is shown only the dashboard (no TypeScript, no test output, no terminal). User is asked: "Can you tell from this dashboard whether RSI is working correctly?" User answers YES. User can point to the specific card / story that shows it. This goal is confirmed by PO recording user's verbal confirmation in the pilot review summary.

Owner agent: `dev-technical-analysis` (dashboard narrative quality) + `po` (pilot review facilitation)

---

### Track C — AI-Fixability Proof

---

**G10. AI agent fixes a primitive bug without looping**

QA injects 1 deliberate bug. `dev-technical-analysis` agent fixes in ≤2 cycles (was 4-6 baseline). Dashboard turns green.

Verification method: QA injects a known, scoped bug into one primitive (bug must be realistic — e.g., off-by-one in RSI period, wrong MACD signal line smoothing). QA records the cycle count (each time the agent submits a fix attempt that does not pass the dashboard scenario). Agent must reach dashboard-green in ≤2 cycles. Baseline is `baselineCycleCount` from `docs/data/bug-inventory.json`. Evidence: git log showing ≤2 fix commits for that bug, final dashboard green.

Owner agent: `dev-technical-analysis` (fix) + `qa` (injection + cycle count)

---

**G11. Regression alarm bell works**

AI fixes bug A, breaks scenario B → dashboard flips B red → AI forced to fix B before "done".

Verification method: QA prepares two linked scenarios: scenario A (primary) and scenario B (regression canary — tests a different primitive that shares an input shape). QA injects bug A. Agent fixes A. QA verifies: if agent's fix inadvertently breaks B, the dashboard shows B as red before the agent marks the task done. If the dashboard shows B red, the agent must fix B in the same task cycle — it cannot ship with a red card. Evidence: at least 1 observed case of B flipping red mid-fix, and the agent addressing it before closing the task.

Owner agent: `dev-technical-analysis` (flow rule) + `qa` (scenario design)

---

**G12. Dev-* agent flow requires dashboard-green before "done"**

`flows/dev-technical-analysis/main.md` updated with hard rule. 3 consecutive tasks verified following rule.

Verification method: QA reads `flows/dev-technical-analysis/main.md` and confirms it contains an explicit step: "Do not mark task DONE until sandbox dashboard shows all TA scenarios green." QA tracks 3 consecutive `dev-technical-analysis` task completions and confirms in each case: (a) git log shows a dashboard-check step before the final commit, (b) the pilot-status.json goal state was updated to IN-PROGRESS during the task, not after.

Owner agent: `architect` (flow rule authoring) + `qa` (3-task verification)

---

## Decision Matrix

After all 12 goals are checked, judge these 3 questions. Each is YES / NO only:

| Question | YES criteria | NO criteria |
|---|---|---|
| **Speed** — fewer fix loops vs baseline? | G10 confirmed ≤2 cycles vs 4-6 baseline AND G11 regression alarm was triggered at least once (proving it works) | G10 not met OR regression alarm never fired (untested) |
| **Trust** — user can verify pilot quality from dashboard alone? | G9 confirmed verbally by user AND G8 red/green honesty proven | G9 not confirmed OR G8 false-green found |
| **Scale** — worth doing for next microservice? | All 12 goals YES AND both tracks A+B delivered within 6 sprints | ≥2 goals still NO at deadline OR pilot overran 6 sprints |

**Outcome:**

- **3 YES** → scale to next microservice. Recommended target: `macro-indicators` (clean domain, macro-core primitive candidates already identified in `02-target-state.md`).
- **2 YES** → re-scope. Identify which track failed. Fix that track (max 2 additional sprints). Re-evaluate the single failing question. Do not start next microservice until all 3 are YES.
- **0-1 YES** → STOP refactor. Fall back to MVR (Minimum Viable Refactor): dashboards + scenarios only, skip primitive extraction. Architect writes MVR brief within 1 sprint of this verdict.

**Pilot review meeting:** PO schedules within 1 sprint of all 12 goals reaching YES/NO terminal state. No meeting = no scale decision = pilot stays active. PO is the decision owner.

---

## Status Tracking

Pilot goal state is tracked in `docs/data/pilot-status.json`. This file is a Phase 0 deliverable — it does not exist at charter creation.

Minimum schema (Phase 0 creates this):
```json
{
  "pilot": "technical-analysis",
  "charterVersion": "1.0",
  "status": "ACTIVE",
  "sprintKickoff": "<sprint-number>",
  "sprintDeadline": "<kickoff + 6>",
  "goals": {
    "G1": "TBD",
    "G2": "TBD",
    "G3": "TBD",
    "G4": "TBD",
    "G5": "TBD",
    "G6": "TBD",
    "G7": "TBD",
    "G8": "TBD",
    "G9": "TBD",
    "G10": "TBD",
    "G11": "TBD",
    "G12": "TBD"
  },
  "decisionMatrix": {
    "speed": "TBD",
    "trust": "TBD",
    "scale": "TBD"
  },
  "verdict": "TBD"
}
```

Valid goal states: `TBD` | `IN-PROGRESS` | `YES` | `NO`
Valid status values: `ACTIVE` | `DONE` | `FAILED`

Pilot is DONE when all 12 goals are YES and decision matrix is complete.
Pilot is FAILED when the 0-1 YES verdict is reached or deadline is exceeded.

---

## Amendments

### 2026-05-22 — Language locked to Go (Option B verdict by user)

User direct verdict on 2026-05-22 (verbatim message: "B") locks the pilot implementation language to **Go**. This supersedes the 2026-05-14 Go-migration brief §7 which had categorized `technical-analysis` as TS-stay. Decision recorded in `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md`.

**Charter goals G1–G12 are unchanged** — all twelve are language-agnostic (they gate on scenario JSON pass/fail, dashboard red/green, and AI fix-cycle count). Only the implementation language changes.

**Phase 1 rebooted in Go.** Six TS commits (16a04a00, a22acdf3, 3f522dc3, 241631af, 20ed83d5, 6248f3da) are reverted via `docs/handoffs/TASK_pivot-B-revert.md`. The new Phase 1 task plan is `docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan-go.md`. The original `phase-1-task-plan.md` is retained as an obsolete reference for historical traceability.

**Deadline unchanged:** 2026-07-03. **Sprint count unchanged:** 6 sprints from kickoff. **Decision matrix unchanged.** **Anti-scope-creep clause unchanged** — still TA-only.
