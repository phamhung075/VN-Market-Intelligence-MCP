---
title: "Phase 2 Task Plan — frontend (TypeScript/Remix) — MVR Track"
date: "2026-05-26"
author: "architect (P2-FE-PLAN)"
pilot: "frontend"
fleet_pilot_number: 10
phase: "2"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-26"
sprint_deadline: "2026-07-06"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/frontend-charter.md"
canonical_goals_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
phase1_plan_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/frontend-phase-1-task-plan.md"
brownfield_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/frontend-brownfield.md"
ssot_ref: "docs/data/pilot-status-frontend.json"
si3_ref: "docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md"
phase1_gate: "QA-APPROVED 2026-05-25T10:20Z (qa cycle-114, c85f577c); 4/12 YES + G12 EARNED-PENDING"
language: "TypeScript"
runtime: "Node 20 / Remix"
owner: "dev-frontend"
wip_limit: 1
mvr_verdict: "MVR (inherited from Phase 1 — binding, no re-evaluation)"
---

# Phase 2 Task Plan — `frontend` (TypeScript/Remix) — MVR Track

**Generated:** 2026-05-26 by architect (P2-FE-PLAN)
**Zone:** `apps/frontend/` ONLY (anti-scope-creep clause binding)
**Owner:** `dev-frontend`
**Language:** TypeScript / Remix (Node 20) — locked at charter creation
**WIP:** 1 task at a time throughout Phase 2 (dev-frontend lane)
**Status:** READY-FOR-DISPATCH

---

## Phase 1 Close Summary

Phase 1 is CLOSED/APPROVED (2026-05-25T10:20Z, QA cycle-114, commit c85f577c).

**Earned in Phase 1 (4 goals — status=YES):**
G1 (4 formatter primitives: direction-arrow, change-pct, signal-type-label, stale-badge + Vitest scenarios),
G2 (view-model analysis-vm.ts composing G1 primitives, market-data-policy test passing),
G6 (Playwright render-gate 4/4 against live app port 3001 — substantive assertions),
G8 (honest red/green proof — deliberate Playwright fail + zero-quarantine grep PASS).

**EARNED-PENDING (not counted in goalsEarned; PO flips YES at 12/12 terminal only):**
G12 streak 3/3 COMPLETE (P1-B1 + P1-B2 + P1-C all shipped with render-green DoD gate evidence).

**Phase 2 scope (remaining genuinely-TBD goals):**
G3 (composition root — calibrated below as N/A for Remix), G4 (ESLint fence),
G5 (old code deletion — calibrated below as N/A), G7 (edit-fixture-rerender sandbox mechanism),
G9 (ops live-recheck — trust contract), G10 (AI-fixability: inject + blind-fix formatter),
G11 (regression alarm: 2-trial coupling), G12 (terminal YES at 12/12 close).

**§4.5 binding rule:** dev-frontend does NOT flip any goal status. All goal flips are PO-only,
in ONE atomic terminal-close commit, after ALL 12 reach terminal state (YES or confirmed N/A).
`decisionMatrix.{speed,trust,scale}` stays TBD throughout Phase 2.
`goalsEarned` stays 4 until PO terminal flip.

---

## GIT DISCIPLINE RULES (binding every commit)

1. Explicit-file staging ONLY. `git add <exact-path>` per file. NEVER `-A`, `.`, `-am`, or wildcard.
2. Pre-commit diff review: `git diff --cached --name-only` must show ONLY intended files.
3. Acquire commit-mutex before staging → skill `.claude/skills/commit-mutex/SKILL.md`
   (kind=`sprint-task`, key=`task:commit-mutex:main`, TTL=180s per task description — use `sprint-task`
   kind as BUG-1 enum-drift workaround).
4. No `--force`, `--no-verify`, `--no-gpg-sign`.
5. All work on main. No branches.
6. Verify no `.git/index.lock` and no live git process before staging.

---

## N/A Goal Calibrations (binding — no build work required)

### G3 — Clean Composition Root (N/A)

**Verdict: N/A for Remix frontend. Justified.**

**Rationale:** In a Remix application, the composition root metaphor maps to the framework itself —
Remix wires routes, loaders, and actions at build time via its Vite plugin. There is no imperative
`bootstrapServer()` function or DI container to extract. The `apps/frontend/app/root.tsx` (Remix root)
is 60 lines; it contains layout and error boundary only — zero domain operations, zero service wiring.
The `apps/frontend/app/routes/` loader functions already compose via `Promise.allSettled` with clean
error aggregation. The brownfield §4 confirmed: "Application = Remix loaders — orchestration via
Promise.allSettled, error aggregation" — this is the correct composition pattern for SSR.

A forced extraction of a `composition-root.ts` would be empty boilerplate that adds no trust value.
The frontend brownfield (docs/architecture-briefs/2026-05-22-refactor/scale/frontend-brownfield.md §8)
explicitly stated G3=N/A and the Phase-1 plan §Goals Roadmap listed it as "N/A for MVR."
This decision carries forward. G3 is permanently N/A for the frontend pilot.

**PO action at terminal close:** Flip G3 to the correct terminal state (N/A designation) in the
pilot-status calibration field. G3 does NOT count toward the 12 YES — PO documents the N/A
rationale in the evidence field; the decisionMatrix still applies to the remaining 11 gradeable goals.

### G5 — Old Code Deleted + HTTP Rewire (N/A)

**Verdict: N/A for frontend. Justified.**

**Rationale:** G5 targets the case where a microservice previously owned logic that was later extracted
to a dedicated backend service — typically the mcp-server old code location pattern. The frontend has
no such prior mcp-server home. It has always been a standalone Remix app at `apps/frontend/`.
The brownfield §6 confirmed: "No G5 rewire needed for frontend. The frontend does NOT have a
'previous microservice location' in mcp-server. G5 for frontend = N/A."

There is no `apps/mcp-server/src/**` code to delete for frontend. There is no HTTP rewire to any
new service (the frontend already fetches from api-gateway:4000 via `app/lib/api/client.ts`).
G5a, G5b, G5c are all N/A.

**PO action at terminal close:** Flip G5 to confirmed N/A in pilot-status. Same ruling as G3.

---

## SI-3 ESLint Fence Calibration (G4)

**SI-3 STATUS: LANDED and FINAL.** Design spec: `docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md` §5.
ESLint flat config with `eslint-plugin-boundaries` v6.0.2. No re-design needed.

**Frontend-specific layer mapping:**

The frontend does NOT use the standard `src/primitive/`, `src/module/`, `src/index.ts` layout.
It uses the Remix `app/` structure. The fence must be adapted to the actual folder layout:

```
apps/frontend/app/
  domain/formatters/    ← Fence-A zone (primitive analog: pure formatting functions)
  domain/               ← domain zone (types: market.ts, health.ts, news.ts)
  lib/view-models/      ← module zone (view-models composing formatters)
  lib/api/              ← infrastructure zone (fetch client — all I/O)
  routes/               ← interface zone (Remix route components + loaders)
  components/           ← interface zone (React components)
  root.tsx              ← composition-root (Remix app entry)
```

**Fence rules for frontend (Fence-A/B/C adapted):**
- **Fence-A:** `app/domain/formatters/**` must not import `app/lib/api/`, `app/routes/`,
  `app/components/`. They are pure — only domain types + stdlib allowed.
  Message: `"Fence-A: domain/formatters must not import ${dependency.type} layer"`
- **Fence-B:** `app/lib/view-models/**` must not import `app/lib/api/`, `app/routes/`,
  `app/components/`. View-models are pure data-transform — no I/O.
  Message: `"Fence-B: lib/view-models must not import ${dependency.type} layer"`
- **Fence-C (advisory):** `app/lib/api/**` (the fetch client) may only be imported from
  `app/routes/**` (loaders/actions) — not from `app/domain/**` or `app/lib/view-models/**`.
  Message: `"Fence-C: lib/api (I/O) must not be imported by domain or view-model layers"`

**Note on existing ESLint state:** `apps/frontend/package.json` already has a `lint` script
(`eslint --ignore-path .gitignore --cache ...`) but NO `eslint-plugin-boundaries` devDep and
NO `eslint.config.mjs`. The fence needs to be installed and configured from scratch.
SI-3 §3.1 devDeps: `"eslint-plugin-boundaries": "^6.0.2"` — add alongside the existing ESLint invocation.

**Fence false-green trap (binding — see mcp-server Phase-2 §G4 for full rationale):**
A deliberate-violation proof IS MANDATORY. One real Fence-A violation must be introduced
(e.g., add `import { fetchStocks } from '~/lib/api/client.js';` to a formatter file),
confirmed to produce non-zero ESLint exit + "Fence-A" in output, then REVERTED (never committed).
A fence that exits 0 without this proof is NOT a pass.

---

## G7 Calibration — Edit-Fixture-Rerender Sandbox Mechanism

**MVR adaptation (binding from Phase-1 §G7/G8 Goal Verification Adaptations):**

For a UI service, G7 = "edit a test fixture, rerun `npm test`, see updated assertion outcome."
The canonical G7 (sandbox runner + JSON trace editing) does not apply to a Remix app.

**What Phase 2 must build:**

Phase 1 already proved the zero-credentials half of G7 (P1-E: `grep -rE "API_KEY|TOKEN|SECRET|PASSWORD|DB_PATH" apps/frontend/app/__tests__/ apps/frontend/tests/` returned 0). What remains is proving the "edit-and-rerender" mechanism works as a whole:

1. Edit a formatter fixture value (e.g., change expected output in `direction-arrow.test.ts`).
2. Run `npm test` — confirm the test fails with a descriptive mismatch.
3. Revert — confirm green.

This was partially done in P1-E (AC-1 covered the edit-rerun proof). Phase 2 G7 is therefore
ALREADY EARNED from P1-E evidence (QA cycle-114 confirmed it). G7 can be graded YES at P2-Z
without new build work — confirmed by verifying the P1-E handoff evidence is complete.

**PO action:** At P2-Z, PO reviews P1-E evidence (docs/handoffs/TASK_P1-FE-WAVE-A-20260525T1020Z.md
AC-1 + AC-3 records). If both are present and passing, G7 flips YES at terminal close.

---

## G9 Calibration — Ops Live-Recheck (NOT user verbal sign-off)

**Binding ruling per MEMORY `feedback_trust_verification_is_system_job` (2026-05-26):**

The `awaitingUserG9Signoff` gate is RETIRED (pilot-status `retiredAt: "2026-05-26T08:30:00Z"`).
G9 for frontend grades via **ops live-recheck** — same mechanism as mcp-server's G9 terminal close
(commit 8972a155, 2026-05-26). The ops live-recheck means: (1) frontend container is RUNNING
and responding at port 3001 with Phase-1 committed code, AND (2) Playwright render-gate
(4/4 assertions) passes against the running container. This is a system-verifiable check, not
a user verbal sign-off.

**Ground state confirmed:** Frontend container was rebuilt post-Phase-1 (ops FE-REBUILD
2026-05-25T19:31:25Z, image sha256:605035cf, `curl :3001 → 200 'VN Market Intelligence'`).
The Phase-1 Playwright render-gate (4/4 QA cycle-114) against the running app is the G9 trust contract.

**Phase-2 G9 verification task (P2-G9-RECHECK):** ops runs `npm run test:e2e` against the
running container at port 3001. If 4/4 passes → G9 flips to PASS evidence at P2-Z close.
No user verbal sign-off required or solicited.

---

## Pre-Revert Tags

| Tag | Created in | Protects |
|-----|-----------|---------|
| `frontend-pre-ci` | P2-A Step 0 | rollback before ESLint fence installation |
| `frontend-pre-inject` | P2-E Step 0 (QA) | rollback before G10 bug-injection commit |

Both tags are local-only (no push). Tags created BEFORE the mutation they protect.

---

## Task Ledger (WIP=1 sequential)

| ID | Title | Owner | Goals | Blocked by | Blocks | Est | Pre-revert tag |
|----|-------|-------|-------|-----------|--------|-----|----------------|
| **P2-A** | Create `frontend-pre-ci` tag (G4 fence anchor) | dev-frontend | G4-setup | — | P2-B | 5m | — |
| **P2-B** | `eslint.config.mjs` Fence-A/B/C adapted to frontend layers + `eslint-plugin-boundaries` devDep + `lint:fence` script | dev-frontend | G4-partial | P2-A | P2-C | 1h | frontend-pre-ci |
| **P2-C** | G4 deliberate-violation proof — Fence-A breach in formatter → exit non-zero + "Fence-A" in output → revert → exit 0. NEVER committed | dev-frontend + qa | G4-full | P2-B | P2-D | 30m | — |
| **P2-D** | G4 freeze anchor confirm — QA reads eslint.config.mjs git log; most-recent = P2-B SHA; compiles G4 evidence signal | qa | G4-finalized | P2-C | P2-E | 15m | — |
| **P2-E** | G10 bug injection — QA creates `frontend-pre-inject` tag then injects 1-literal bug in `direction-arrow.ts`; Vitest goes RED | qa | G10-setup | P2-D | P2-F | 20m | frontend-pre-inject |
| **P2-F** | G10 AI-fixability — dev-frontend fixes direction-arrow bug in ≤2 cycles from RED Vitest signal ONLY (no bug location pointer). `npm test` GREEN | dev-frontend + qa | G10 | P2-E | P2-G | 1h | — |
| **P2-G** | G11 regression alarm — 2-trial coupling proof. Trial-1 = P2-E/F alias (or dedicated). Trial-2 = `change-pct.ts` mutation; ≥1 coupled scenario RED + single-edit fix. Outcome-(a)×2 | qa + dev-frontend | G11 | P2-F | P2-H | 1h | — |
| **P2-H** | G9 ops live-recheck — ops runs Playwright render-gate (4/4) against running container port 3001; evidence captured | ops | G9 | P2-G | P2-Z | 20m | — |
| **P2-Z** | Phase-2 close-gate (QA) — confirm G4+G7(from P1-E)+G9+G10+G11; re-confirm G1/G2/G6/G8 (4 YES) + G12 EARNED-PENDING; confirm G3/G5 N/A rationale; emit close-gate signal. NO goal flips | qa | close-gate | P2-H | PO terminal | 30m | — |

**Total tasks:** 9 (A through H + Z)
**Total estimated dev+qa+ops effort:** ~5h (dev: A+B+C+F ≈ 3h; qa: C+D+E+G+Z ≈ 2.5h; ops: H ≈ 0.5h)

---

## Sequencing

```
P2-A (frontend-pre-ci tag)
  ↓
P2-B (eslint.config.mjs Fence-A/B/C + devDep + lint:fence script)
  ↓
P2-C (G4 deliberate-violation proof — reverted, never committed)
  ↓
P2-D (G4 freeze anchor confirm — QA evidence signal)
  ↓
P2-E (frontend-pre-inject tag + G10 bug injection committed by QA)
  ↓
P2-F (G10 AI-fix in ≤2 cycles from RED Vitest signal — dev-frontend diagnoses from failure output only)
  ↓
P2-G (G11 2-trial regression alarm coupling proof)
  ↓
P2-H (G9 ops live-recheck — Playwright 4/4 against running container port 3001)
  ↓
P2-Z (Phase-2 close-gate — QA signal; NO goal flips)
  ↓
[PO: terminal atomic flip — 12/12 graded + N/A confirmed + decisionMatrix + DONE]
```

**Critical path:** P2-A → B → C → D → E → F → G → H → Z → PO terminal
All tasks strictly sequential (WIP=1). No user-verbal-signoff step. No USER-gated steps.

---

## Per-Task Acceptance Criteria

---

### P2-A — Create `frontend-pre-ci` Tag

**Owner:** dev-frontend
**Blocks:** P2-B
**Estimated:** 5 minutes

**AC-1:** `git tag -a frontend-pre-ci -m "frontend-pre-ci: anchor before G4 ESLint fence work"` runs without error. Tag SHA recorded in handoff.

**AC-2:** `git tag -l "frontend-pre-ci"` returns the tag. Tag is local-only (no push).

**AC-3:** `git log --oneline -3` confirms HEAD is the Phase-1 close-gate state (commit c85f577c or a later ops/notebook commit in the frontend zone).

---

### P2-B — eslint.config.mjs Fence-A/B/C + devDep

**Owner:** dev-frontend
**Blocks:** P2-C
**Blocked by:** P2-A
**Estimated:** 1h
**Files to create/modify:**
- `apps/frontend/eslint.config.mjs` (CREATE)
- `apps/frontend/package.json` (MODIFY — add `eslint-plugin-boundaries` devDep + `lint:fence` script)

**Fence element mapping (frontend-specific):**
```javascript
"boundaries/elements": [
  { type: "formatter",       pattern: "app/domain/formatters/**/*" },
  { type: "domain",          pattern: "app/domain/**/*" },
  { type: "view-model",      pattern: "app/lib/view-models/**/*" },
  { type: "api-client",      pattern: "app/lib/api/**/*" },
  { type: "component",       pattern: "app/components/**/*" },
  { type: "route",           pattern: "app/routes/**/*" },
  { type: "composition-root", pattern: "app/root.tsx" },
]
```

**Fence rules (Fence-A/B/C adapted to frontend):**
- **Fence-A:** `formatter` must not import `api-client`, `route`, `component`.
  Message: `"Fence-A: domain/formatters must not import ${dependency.type} layer"`.
- **Fence-B:** `view-model` must not import `api-client`, `route`, `component`.
  Message: `"Fence-B: lib/view-models must not import ${dependency.type} layer"`.
- **Fence-C:** `api-client` must not be imported by `formatter`, `domain`, `view-model`.
  Message: `"Fence-C: lib/api (I/O) must not be imported by domain or view-model layers"`.

**Ignore patterns (mandatory):** `**/__tests__/**`, `**/node_modules/**`, `**/build/**`.

**AC-1:** `apps/frontend/eslint.config.mjs` created with Fence-A/B/C as specified.

**AC-2:** `apps/frontend/package.json` devDependencies includes `eslint-plugin-boundaries`. `scripts.lint:fence` added as `"eslint app/ --max-warnings 0 --config eslint.config.mjs"`.

**AC-3 (initial clean run):** `cd apps/frontend && npx eslint app/ --max-warnings 0 --config eslint.config.mjs` exits 0 with 0 errors on the existing (Phase-1 committed) codebase. If existing violations appear (there should be none — brownfield scan confirmed domain/ and view-models/ are clean), document them as `// FENCE-LEGACY` and re-run until 0. Evidence pasted in handoff.

**AC-4 (regression tripwires):** `npm test` exits 0 (Vitest 179/179 pass). `npm run typecheck` exits 0. `npm run build` exits 0.

**AC-5:** `git diff --cached --name-only` shows ONLY `eslint.config.mjs` + `package.json`. No source files.

---

### P2-C — G4 Deliberate-Violation Proof (AC-4b)

**Owner:** dev-frontend + qa (qa verifies independently)
**Blocks:** P2-D
**Blocked by:** P2-B
**Estimated:** 30 minutes
**NEVER committed — violation is reverted before any `git add`**

**Procedure:**
1. Add ONE deliberate Fence-A violation in a formatter file (e.g., add
   `import type { ApiResponse } from '~/lib/api/client.js'; // DELIBERATE-VIOLATION-TEST`
   to `apps/frontend/app/domain/formatters/direction-arrow.ts`).
2. Run: `cd apps/frontend && npx eslint app/ --max-warnings 0 --config eslint.config.mjs`.
3. Verify: exits non-zero AND output contains "Fence-A" string.
4. Revert the violation (restore `direction-arrow.ts` to its original state).
5. Run: `cd apps/frontend && npx eslint app/ --max-warnings 0 --config eslint.config.mjs`.
6. Verify: exits 0.
7. Record before/after output in handoff.

**AC-1 (non-zero exit with violation):** eslint exits non-zero when the deliberate import is present. Exit code + output pasted in handoff.

**AC-2 (fence name in output):** Error output contains the string `"Fence-A"`. Paste output excerpt showing the error line.

**AC-3 (zero exit after revert):** After reverting, eslint exits 0. Paste output confirming 0 problems.

**AC-4 (file not staged):** `git status --short` shows 0 modified files after the test cycle. The deliberate violation was never committed.

---

### P2-D — G4 Freeze Anchor Confirm

**Owner:** qa
**Blocks:** P2-E
**Blocked by:** P2-C
**Estimated:** 15 minutes
**Files touched:** none (read-only verification + QA evidence signal)

**AC-1 (freeze anchor confirmed):** `git log --oneline -- apps/frontend/eslint.config.mjs | head -1` returns the P2-B commit SHA. No subsequent commit has modified the fence config.

**AC-2 (G4 evidence compiled):** QA emits a signal doc (`docs/signals/qa-frontend-g4-p2d-<ISO>Z.json`) containing: eslint.config.mjs P2-B commit SHA, Fence-A violation proof (non-zero exit excerpt), post-revert clean exit, freeze anchor confirmation.

**AC-3 (regression tripwires):** `npm test` exits 0 (Vitest 179/179). `npm run typecheck` exits 0.

---

### P2-E — G10 Bug Injection (QA)

**Owner:** qa
**Blocks:** P2-F
**Blocked by:** P2-D
**Estimated:** 20 minutes
**Pre-revert tag:** `frontend-pre-inject` (created HERE before injection)

**Target primitive:** `formatDirectionArrow` in `apps/frontend/app/domain/formatters/direction-arrow.ts`.
- Pure function, zero I/O, Vitest-scenario-tested (P1-B1 established ≥3 test cases).
- Bug type: single-literal mutation — change the "up" return symbol from `"↑"` to `"↑↑"` (one extra
  arrow character). This produces deterministic RED on the golden scenario and is fixable with a
  1-character revert.

**Steps:**
1. `git tag -a frontend-pre-inject -m "frontend-pre-inject: anchor before G10 formatter bug injection"`.
   Record tag SHA in handoff.
2. Edit `apps/frontend/app/domain/formatters/direction-arrow.ts` line containing `"↑"` return:
   change to `"↑↑"` (add one extra arrow). Add comment: `// G10-INJECTED-BUG`.
3. Run `npm test` in `apps/frontend/`. Confirm test suite is RED: `direction-arrow.test.ts` fails
   with expected `"↑"` but received `"↑↑"`. Paste failing output.
4. Commit the injected bug (with the G10-INJECTED-BUG comment in the file):
   `docs/signals/qa-frontend-g10-inject-<ISO>Z.json` emitted as evidence before commit.
5. Dispatch dev-frontend for P2-F WITHOUT indicating which line was changed. Dev must diagnose
   from the RED test output alone.

**AC-1:** `frontend-pre-inject` tag created before any file modification.

**AC-2:** `apps/frontend/app/domain/formatters/direction-arrow.ts` contains the injected bug comment `// G10-INJECTED-BUG` and the mutated symbol.

**AC-3:** `npm test` exits non-zero with direction-arrow test failure shown. Paste output excerpt showing test name + expected/received mismatch.

**AC-4:** QA signal emitted: `docs/signals/qa-frontend-g10-inject-<ISO>Z.json` with `injected_file`, `mutation_description`, `pre_inject_tag`, `failing_test_name` fields.

**AC-5:** `git diff --cached --name-only` after commit shows ONLY `direction-arrow.ts`.

---

### P2-F — G10 AI-Fixability (dev-frontend)

**Owner:** dev-frontend + qa (qa verifies cycle count)
**Blocks:** P2-G
**Blocked by:** P2-E
**Estimated:** 1h
**Cycle limit:** ≤ 2 fix cycles (1 cycle = one commit attempt ending in `npm test` run)

**G10 gate:** dev-frontend MUST diagnose from the RED test output ONLY. QA does NOT provide:
- The name of the file that was changed.
- The line number.
- Any hint about the mutation type.

Dev reads the Vitest failure output (expected vs received), identifies the source, fixes it, runs
`npm test`, confirms GREEN.

**Fix procedure:**
1. Read `npm test` output — failing test name + expected/received mismatch.
2. From the test name, identify the primitive under test.
3. Open the formatter source file, find the discrepancy, apply the 1-character fix.
4. Run `npm test`. If GREEN: task DONE (1 cycle). If RED again: debug + try once more (2 cycles max).
5. After GREEN: run `npm run test:e2e` to confirm Playwright 4/4 still passes (render-gate intact).

**AC-1 (cycle count ≤ 2):** dev-frontend's git log from P2-E injection commit to GREEN commit shows ≤ 2 fix commits. QA counts from `git log --oneline --since=<injection-commit-timestamp>`. Cycle count recorded in handoff.

**AC-2 (GREEN restored):** `npm test` exits 0 with all tests passing (≥179). Paste full output including direction-arrow tests in PASS list.

**AC-3 (G10-INJECTED-BUG comment removed):** `grep "G10-INJECTED-BUG" apps/frontend/app/domain/formatters/direction-arrow.ts` returns 0 matches. The injected comment must be cleaned up in the fix commit.

**AC-4 (render-gate intact):** `npm run test:e2e` exits 0, 4/4 Playwright assertions passing. Evidence in handoff.

**AC-5 (QA verification):** `git log --oneline apps/frontend/app/domain/formatters/direction-arrow.ts | head -3` shows the fix commit as the most recent. QA independently runs `npm test` and confirms GREEN. Evidence: QA's own run output pasted.

---

### P2-G — G11 Regression Alarm (2-Trial Coupling Proof)

**Owner:** qa + dev-frontend
**Blocks:** P2-H
**Blocked by:** P2-F
**Estimated:** 1h

**Rubric (from pilot-charter):** 2 trials, each with a different primitive mutation. Each trial must
show ≥1 COUPLED scenario flips RED (a change in one primitive causes another test covering it to
also fail). Each trial ends with a single-edit fix restoring all GREEN. Outcome-(a) × 2 = G11 PASS.

**Trial-1 (G10 alias — may reuse P2-E/F evidence):**
During the G10 injection (P2-E), the direction-arrow mutation caused `direction-arrow.test.ts` to fail.
Check whether `analysis-vm.test.ts` ALSO failed (it calls `formatDirectionArrow` via `buildWatchlistTileVM`).
If `analysis-vm.test.ts` showed ≥1 RED assertion during the P2-E injection window → Trial-1 is proven.
QA verifies by reviewing the P2-F `npm test` failure output for multi-file failures.

If `analysis-vm.test.ts` was NOT caught (formatter output is opaque to the view-model test):
QA designs a dedicated Trial-1 mutation: mutate `change-pct.ts` (change `"↑"` to `"+"` for positive
change). Both `change-pct.test.ts` AND `analysis-vm.test.ts` should flip RED (analysis-vm has
a test asserting `changePctDisplay` contains `"↑"`). Dev fixes with 1-line revert.

**Trial-2 (dedicated — `formatSignalTypeLabel`):**
QA mutates `apps/frontend/app/domain/formatters/signal-type-label.ts`: change `"chain_catalyst"`
mapping from `"cascade"` to `"CHAIN"` (a detectable mismatch). Both `signal-type-label.test.ts`
AND any scenario that tests the view-model's signalType rendering should flip RED.
Dev fixes with 1-line revert. Note: if view-model tests don't cover signal-type-label, Trial-2
still proves the coupling within the formatter's own test suite (intra-primitive coupling).

**AC-1 (Trial-1 coupling proof):** ≥1 scenario in a DIFFERENT test file (not just the mutated primitive's
own test file) goes RED during the Trial-1 mutation window. Or: Trial-1's own test shows
the mutation propagated to ≥1 downstream assertion. Paste test failure output showing the coupled
RED assertion.

**AC-2 (Trial-1 single-edit fix):** Dev fixes Trial-1 mutation with a single revert edit.
`npm test` exits 0. Paste GREEN output. `npm run test:e2e` exits 0.

**AC-3 (Trial-2 coupling proof):** ≥1 RED assertion appears in `signal-type-label.test.ts` (or a
coupled consumer test) when `signal-type-label.ts` is mutated. Paste failure output.

**AC-4 (Trial-2 single-edit fix):** Dev fixes Trial-2 mutation with a single revert.
`npm test` exits 0. Paste GREEN output.

**AC-5 (both mutations never committed to main):** `git log --oneline --diff-filter=M apps/frontend/app/domain/formatters/` shows no Trial-2 mutation commit in history. The Trial-1 mutation (P2-E injection) was already reverted by P2-F. All four mutation + revert cycles leave the source files at their canonical Phase-1 state.

---

### P2-H — G9 Ops Live-Recheck

**Owner:** ops
**Blocks:** P2-Z
**Blocked by:** P2-G
**Estimated:** 20 minutes
**No code change — read-only verification of running container**

**Context:** The frontend container was rebuilt post-Phase-1 (image sha256:605035cf,
`curl :3001 → 200 'VN Market Intelligence'`). Phase-2 code changes (G4 fence only — no runtime
behavior change) should not require a container rebuild for G9 purposes. If the G4 fence
`eslint.config.mjs` + `package.json` changes land in a commit that requires a rebuild for any
reason, ops rebuilds first, then runs verification.

**G9 trust contract (MVR calibration):** The Playwright render-gate (4/4 assertions) against
the running Remix app at port 3001 IS the frontend's G9 trust contract. The running app showing
correct navigation, Vietnamese text, ticker badges, and absence of error strings IS the dashboard.
No separate static HTML dashboard is built (MVR: the app is its own trust surface).

**AC-1 (container live):** `curl -s http://localhost:3001 | grep -i "VN Market Intelligence"` returns
at least 1 match. Container is responsive at port 3001.

**AC-2 (Playwright 4/4):** `cd apps/frontend && npm run test:e2e` exits 0. All 4 Playwright
assertions pass:
1. Nav contains "VN Market Intelligence" + ≥4 links.
2. Page contains "Chọn cổ phiếu" section + ticker badge "VNM".
3. Graceful degrade: body does NOT contain "Internal Server Error".
4. (smoke spec) Homepage title check passes.
Paste full Playwright output showing 4/4 passed.

**AC-3 (G9 evidence recorded):** ops emits signal `docs/signals/ops-frontend-g9-recheck-<ISO>Z.json`
containing: container curl response snippet, Playwright 4/4 output, container image SHA (from
`docker inspect` or `docker images` output). This is the G9 locked evidence artifact.

**AC-4 (container running Phase-2 code):** If a rebuild was required: `docker inspect` shows image
created AFTER the P2-B commit timestamp. If no rebuild needed: note in signal that Phase-2 commits
(eslint.config.mjs, package.json) are devDep-only and do not change the built Remix bundle.

---

### P2-Z — Phase-2 Close-Gate Verification (QA)

**Owner:** qa
**Blocks:** PO terminal
**Blocked by:** P2-H
**Estimated:** 30 minutes
**Files touched:** none (read-only verification + QA close-gate signal)

**AC-1 (G4 confirmed):** QA reviews P2-D signal. `eslint.config.mjs` exists, freeze anchor confirmed,
deliberate-violation proof present (Fence-A non-zero + post-revert 0).

**AC-2 (G7 confirmed from P1-E evidence):** QA reviews `docs/handoffs/TASK_P1-FE-WAVE-A-20260525T1020Z.md`
P1-E AC-1 (edit-fixture-rerun proof) and AC-3 (zero-creds grep). Both present and passing.
G7 is EARNED from Phase-1 — no Phase-2 build work required. Document confirmation.

**AC-3 (G9 confirmed):** QA reviews P2-H ops signal. Container live at 3001, Playwright 4/4 passing,
G9 evidence artifact present with container SHA.

**AC-4 (G10 confirmed):** Cycle count ≤ 2 per P2-F handoff. `npm test` GREEN after fix. QA independently
runs `npm test` in `apps/frontend/` — exits 0. Direction-arrow tests confirmed passing.

**AC-5 (G11 confirmed):** Trial-1 coupling proof present (P2-G AC-1/2). Trial-2 coupling proof
present (P2-G AC-3/4). Both mutations reverted (source files at canonical state). Outcome-(a)×2 confirmed.

**AC-6 (G3/G5 N/A rationale confirmed):** QA reads N/A sections in this Phase-2 plan:
G3 — Remix composition root, no extraction needed, brownfield §8 confirms.
G5 — No prior mcp-server location, brownfield §6 confirms.
Both N/A rulings recorded in QA close-gate signal for PO reference.

**AC-7 (Phase-1 YES goals unregressed — G1/G2/G6/G8):** `npm test` exits 0 (≥179 Vitest passing).
`npm run test:e2e` exits 0 (4/4 Playwright passing). No test deception (QA grep: 0 `.only`/`.skip`/
`xit`/`xtest`/`describe.skip` in test files). Paste grep output.

**AC-8 (G12 EARNED-PENDING streak preserved):** Flow file `.claude/flows/dev-frontend/main.md` still
contains the render-green DoD gate (baked e4812778). `grep -c "render-green" .claude/flows/dev-frontend/main.md` ≥ 1.

**AC-9 (close-gate signal emitted):** QA emits `docs/signals/qa-frontend-phase2-close-<ISO>Z.json`
with all AC pass results and a `close_gate_verdict: "PASS"` field. Signal is the PO's authorization
to proceed with terminal atomic flip.

---

## §4.5 Compliance

NO goal flip instructions in any per-task AC. `dev-frontend`, `qa`, and `ops` do NOT update
`docs/data/pilot-status-frontend.json` goal `status` fields during Phase 2.
`goalsEarned` stays 4 until PO atomic terminal flip.
`decisionMatrix.{speed,trust,scale}` stays TBD.
`phase2.status` may be updated by PO only.

**PO terminal close (after P2-Z close-gate signal):**
In ONE atomic commit, PO flips all 12 goals to their terminal state, populates decisionMatrix,
sets top-level `verdict`, sets `phase2.status = "CLOSED"`, sets `phase2.closedAt`, sets
`status = "DONE"`. Terminal grades:
- G1=YES (Phase-1), G2=YES (Phase-1), G3=N/A (this plan), G4=YES (P2-B/C/D), G5=N/A (this plan)
- G6=YES (Phase-1), G7=YES (Phase-1 P1-E), G8=YES (Phase-1), G9=YES (P2-H),
  G10=YES (P2-F), G11=YES (P2-G), G12=YES (streak 3/3 EARNED-PENDING → terminal flip)

---

## Goals Roadmap — Phase 2 Contributions

| Goal | Phase-2 status | Verification source |
|---|---|---|
| G1 (primitives + scenarios) | Carries YES from Phase 1 | c85f577c QA cycle-114 |
| G2 (module composes primitives) | Carries YES from Phase 1 | c85f577c QA cycle-114 |
| G3 (clean composition root) | **N/A** (Remix framework; no extraction needed) | This plan §N/A Calibrations |
| G4 (architecture fence) | **BUILD — P2-B/C/D** | eslint.config.mjs + deliberate-violation proof |
| G5 (old code deleted) | **N/A** (no prior mcp-server location) | brownfield §6 + this plan |
| G6 (dashboard renders) | Carries YES from Phase 1 | Playwright 4/4 QA cycle-114 |
| G7 (edit-fixture-rerun, zero creds) | **EARNED from P1-E** — QA confirms at P2-Z | P1-E handoff AC-1+AC-3 |
| G8 (honest red/green) | Carries YES from Phase 1 | Playwright deliberate-fail QA cycle-114 |
| G9 (trust contract) | **BUILD — P2-H** (ops live-recheck) | Playwright 4/4 against running container |
| G10 (AI fixes bug ≤2 cycles) | **BUILD — P2-E/F** | ≤2-cycle direction-arrow fix |
| G11 (regression alarm) | **BUILD — P2-G** | 2-trial coupling proof |
| G12 (streak 3/3) | EARNED-PENDING → terminal YES at PO flip | Flow gate e4812778 + 3/3 P1 streak |

**goalsEarned at P2-Z close:** PO flips from 4 to 12 (or 10 if G3+G5 counted as N/A, not YES).
The decisionMatrix applies to Speed=G10+G11, Trust=G9+G8, Scale=all-graded YES + ≤6 sprints.

---

## Hard Constraints

| Constraint | Source |
|---|---|
| WIP=1 sequential throughout Phase 2 | pilot-status phase2.wip_limit |
| Anti-scope-creep: `apps/frontend/` ONLY | charter §Anti-scope-creep |
| No goal flips in dev/qa/ops tasks | §4.5 + pilot-charter |
| G10 bug diagnosis from RED output ONLY (no hints from QA) | G10 rubric |
| G4 deliberate-violation proof MANDATORY — never committed | fence false-green trap |
| `frontend-pre-inject` tag BEFORE injection commit | pre-revert tag protocol |
| No `--no-verify`, no force push, no branch creation | CLAUDE.md |
| Explicit file staging only (`git add <path>`) | day-0 binding rules |
| Commit-mutex FIRST before any stage+commit | .claude/skills/commit-mutex/SKILL.md |
| G9 = ops live-recheck ONLY (no user-verbal-signoff) | feedback_trust_verification_is_system_job |
| Do NOT touch apps/pdf-extractor/ or apps/mcp-server/ | anti-scope-creep |
