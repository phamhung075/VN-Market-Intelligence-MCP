---
title: "Phase 2 Task Plan (TypeScript) — kinh-dich Pilot (fleet pilot 4)"
date: "2026-05-24"
author: "architect (Phase 2 dispatch)"
pilot: "kinh-dich"
fleet_pilot_number: 4
phase: "2"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
charter_ref: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md"
phase1_plan_ref: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-1-task-plan-ts.md"
ssot_ref: "docs/data/pilot-status-kinh-dich.json"
language: "TypeScript"
runtime: "bun"
frozen_anchor: "debba8eaff0724d1fb32fc9d28640201cc32d1cc (INTACT — do NOT retag/rewrite/push)"
inbound_signal: "docs/signals/po-20260524T023538Z-kinh-dich-phase2-authorize.json"
phase1_gate: "clean full GO (PO 2026-05-24, QA AC-2 re-verify PASS, gateCommit 34205c87)"
service_port: 5005
service_port_note: "internal == external per system-map.json — never hardcode"
service_zone: "apps/kinh-dich-service"
service_specialist: "dev-kinh-dich"
structural_template: "docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md"
si3_fence_spec: "docs/architecture-briefs/2026-05-23-ts-fence-spike/00-design.md (FINAL, chosen_option=A)"
si3_signal: "docs/signals/architect-si3-ts-fence-done-20260523T220332Z.json (commit 388703b7)"
---

# Phase 2 Task Plan (TypeScript) — kinh-dich Pilot (fleet pilot 4)

**Generated:** 2026-05-24 by architect (Phase 2 dispatch)
**Phase 1 Gate:** clean full GO (PO 2026-05-24T07:00Z — sandbox 14/14, G12 streak 6/6, dashboard 6/6 cards 100%, QA AC-2 re-verify PASS, commit 34205c87)
**Phase 2 Goal scope:** G3, G4, G5, G8, G9, G10, G11 (G1, G2, G6, G7, G12 = EARNED-PENDING from Phase 1)
**WIP:** 1 sequential (charter wip_limit — no parallel dispatch within Phase 2)

> **IMPORTANT — no goal flips in Phase 2:** Task completion does NOT flip any G-goal state.
> All goal flips (including EARNED-PENDING → YES) are PO-only, in one atomic Phase-3 commit,
> after ALL 12 goals reach terminal state simultaneously. Every task in this plan says so explicitly.
> §4.5 matrix-authorship rule is binding and inviolable.

---

## Service Facts (verified via jq on docs/data/system-map.json — never hardcode)

```
id: kinh-dich-service | language: ts | runtime: bun
port: 5005 (internal == external) | zone: apps/kinh-dich-service
specialist: dev-kinh-dich
```

---

## Phase 1 Artefacts Baseline (Phase 2 inherits — do NOT re-earn)

The following Phase-1 artefacts exist in the repository and are the Phase-2 starting baseline:

- `apps/kinh-dich-service/src/primitive/hexagram-resolver/` — 3 scenario JSONs, unit tests
- `apps/kinh-dich-service/src/primitive/ngu-hanh-classifier/` — 3 scenario JSONs, unit tests
- `apps/kinh-dich-service/src/primitive/hao-encoder/` — 3 scenario JSONs, unit tests
- `apps/kinh-dich-service/src/primitive/reading-scorer/` — 3 scenario JSONs, unit tests (P1-F)
- `apps/kinh-dich-service/src/module/reading_composer/` — module stub, 2 scenario JSONs
- `apps/kinh-dich-service/src/sandbox/runner.ts` — sandbox runner (P1-A)
- `apps/kinh-dich-service/dashboard/index.html` — 3-panel dashboard, 6/6 cards, G7 edit-rerun handler (P1-D + P1-E + P1-KD-H)
- `docs/scenarios/kinh-dich/primitives/` — 12 primitive scenarios (4 primitives × 3 each)
- `docs/scenarios/kinh-dich/module/` — 2 module scenarios
- G12 DoD gate: sandbox 14/14 all-green confirmed at Phase-1 close (P1-KD-H + QA re-verify 34205c87)

**Sandbox baseline command (G12 DoD gate — applies to every dev task in Phase 2):**
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
Currently: 14/14 PASS (12 primitives + 2 module scenarios). This must never regress.

---

## Phase 2 Summary

Phase 2 closes the 7 still-unmet goals (G3, G4, G5, G8, G9, G10, G11). The 5 EARNED-PENDING goals
(G1, G2, G6, G7, G12) require no new code tasks — they carry forward with their Phase-1 evidence
and are re-confirmed at the Phase-2 close-gate (P2-KD-Z).

**Total tasks:** 14 atomic tasks (P2-KD-A through P2-KD-Z)
**Total AC count:** 73
**Critical path (sequenced by pre-revert tag discipline):**

```
P2-KD-A (kinh-dich-pre-ci tag)
  ↓
P2-KD-B (eslint.config.mjs Fence-A/B/C + bunx eslint CI wiring)
  ↓
P2-KD-C (G4 deliberate-violation proof — AC-4b — reverted, NEVER committed)
  ↓
P2-KD-D (G4 freeze anchor AC-4c confirmed)
  ↓
P2-KD-E (kinh-dich-pre-delete tag)
  ↓
P2-KD-F (G5a — git mv superseded domain/services.ts logic to src/_deprecated/)
  ↓
P2-KD-G (G5b — MCP handler HTTP rewire: 6 tools → port 5005 + 4 new endpoints on kinh-dich-service)
  ↓
P2-KD-H (G5c — zero TODO.*migrat + HTTP audit sign-off)
  ↓
P2-KD-I (G3 — composition root cleanup ≤80L + OpenAPI YAML in src/interface/)
  ↓
P2-KD-J (G6 finalization — dashboard contract-linking + nuclear-hexagram-computer 5th primitive)
  ↓
P2-KD-K (G8 honest-red deliberate-break proof)
  ↓
P2-KD-L (G9 PO Playwright Path B — chromium-headless-shell, TCC-staged)
  ↓
P2-KD-M (kinh-dich-pre-inject tag + G10 bug injection)
  ↓
P2-KD-N (G10 AI-fixability fix ≤2 cycles + G11 2-trial coupling proof)
  ↓
P2-KD-Z (Phase 2 close-gate — QA)
```

**WIP=1 enforced throughout.** PM dispatches ONE task at a time. Next task dispatched only after
current task DONE signal is received and recorded.

---

## Pre-Revert Tags (Phase 2 — binding creation sequence)

Tags are created IN THE TASK THAT GATES THEM, BEFORE any mutation. No retag, no `--force`, no push.

| Tag | Created in | Step within task | Protects |
|-----|-----------|------------------|---------|
| `kinh-dich-pre-ci` | **P2-KD-A** | Step 0 (first action of P2-KD-A) | Rollback point before G4 ESLint fence work |
| `kinh-dich-pre-delete` | **P2-KD-E** | Step 0 (first action of P2-KD-E) | Rollback point before G5a git mv to _deprecated/ |
| `kinh-dich-pre-inject` | **P2-KD-M** | Step 0 (first action of P2-KD-M) | Rollback point before G10 bug-injection commit |

None of these tags exist yet in the repository (confirmed at plan-time). All three must be created in the
designated Phase-2 task, never early, never retrofitted.

---

## Hard Constraints (every task inherits all)

| Constraint | Rule |
|---|---|
| **G12 DoD gate** | `cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all` exits 0 BEFORE DONE on every task that produces sandbox-runnable artefacts. Baseline: 14/14. |
| **Fence-A** | `src/primitive/*/` imports stdlib / domain types only — no module, application, interface, infrastructure imports |
| **Fence-B** | `src/module/*/` imports primitives + domain types only — no application, interface, infrastructure imports |
| **Fence-C** | Infrastructure (SQLite via `SQLiteKinhDichRepository`) importable ONLY from `src/index.ts` (composition root). No other file may import it. |
| **R-FENCE gate** | `bunx eslint src/ --max-warnings 0` must catch Fence-A violations in AC-4b with non-zero exit AND "Fence-A" in ESLint output. This is the single hard gate for the entire fence system. |
| **R-2 fallback** | If R-2 bites (pattern matching failure on .js-suffixed imports): add `@typescript-eslint/parser` devDependency + `languageOptions: { parser: tsParser }` to `eslint.config.mjs`. 5-min fix within Option A. NEVER drop to Option C. |
| **L84 staging** | `git add <explicit-path>` per file. NEVER `git add -A` or `git add .` |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` of source/CI files |
| **Anchor INTACT** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor before AND after every commit. Verify with `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1` — must return non-empty |
| **SSOT freeze** | Do NOT modify `docs/data/pilot-status-kinh-dich.json` — PM-owned. Do NOT flip any G-goal field |
| **Charter §4.5** | `decisionMatrix.{speed,trust,scale}` stays `TBD`. `goalsEarned` stays 0. PO-only authorship at 12/12 terminal in Phase 3 |
| **SI-2 boundary** | Do NOT create or modify `docs/dashboards/index.html` — stock-price's G6 deliverable (P2-I in stock-price plan). kinh-dich dashboard = `apps/kinh-dich-service/dashboard/index.html` only |
| **git index.lock** | If lock error: verify no git process is running across both fleet zones (kinh-dich + stock-price share git), wait 4s, retry. NEVER blindly delete the lock |
| **Out-of-zone ban** | Do NOT modify `apps/technical-analysis/`, `apps/macro-indicators/`, their closed SSOTs, `apps/stock-price/`, or any microservice zone other than `apps/kinh-dich-service/` and the mcp-server tool handlers strictly scoped to G5b |
| **Single-committer serialization** | INTERIM FLEET-WIDE SINGLE-COMMITTER SERIALIZATION active. Before staging: `git diff --cached --name-only`. If a FOREIGN path appears, WAIT. NEVER `git reset HEAD` a foreign path. |

---

## Task Ledger

| ID | Title | Owner | G-goals advanced | Blocks | Blocked by | Est | AC count |
|----|-------|-------|-----------------|--------|------------|-----|----------|
| **P2-KD-A** | Create `kinh-dich-pre-ci` tag (pre-revert anchor before G4 work) | dev-kinh-dich | G4 (setup) | P2-KD-B | — | 5m | 3 |
| **P2-KD-B** | `eslint.config.mjs` Fence-A/B/C creation + `bunx eslint` CI wiring | dev-kinh-dich | G4 partial | P2-KD-C | P2-KD-A | 1h | 5 |
| **P2-KD-C** | G4 deliberate-violation proof (AC-4b) — Fence-A violation, non-zero exit, reverted | dev-kinh-dich + qa | G4 full | P2-KD-D | P2-KD-B | 30m | 5 |
| **P2-KD-D** | G4 freeze anchor confirmation (AC-4c) | qa | G4 finalized | P2-KD-E | P2-KD-C | 15m | 3 |
| **P2-KD-E** | Create `kinh-dich-pre-delete` tag (pre-revert anchor before G5a work) | dev-kinh-dich | G5 (setup) | P2-KD-F | P2-KD-D | 5m | 3 |
| **P2-KD-F** | G5a — `git mv` superseded `domain/services.ts` logic to `src/_deprecated/` | dev-kinh-dich | G5a | P2-KD-G | P2-KD-E | 1.5h | 7 |
| **P2-KD-G** | G5b — MCP handler HTTP rewire: 6 tools → port 5005 + 4 new kinh-dich endpoints | dev-kinh-dich | G5b | P2-KD-H | P2-KD-F | 3h | 8 |
| **P2-KD-H** | G5c — zero `TODO.*migrat` audit + G5 evidence sign-off | qa | G5b, G5c | P2-KD-I | P2-KD-G | 30m | 5 |
| **P2-KD-I** | G3 — composition root cleanup ≤80L + OpenAPI contract | dev-kinh-dich | G3 | P2-KD-J | P2-KD-H | 1.5h | 6 |
| **P2-KD-J** | G6 finalization — dashboard contract-linking + `nuclear-hexagram-computer` 5th primitive | dev-kinh-dich | G6, G1 | P2-KD-K | P2-KD-I | 2h | 7 |
| **P2-KD-K** | G8 honest-red deliberate-break proof (bun sandbox RED on corrupted + GREEN on revert) | qa | G8 | P2-KD-L | P2-KD-J | 30m | 5 |
| **P2-KD-L** | G9 PO Playwright Path B (chromium-headless-shell, TCC-staged via Terminal.app) | po | G9 | P2-KD-M | P2-KD-K | 30m | 4 |
| **P2-KD-M** | Create `kinh-dich-pre-inject` tag + G10 bug injection | qa | G10 setup | P2-KD-N | P2-KD-L | 20m | 4 |
| **P2-KD-N** | G10 AI-fixability proof (≤2 cycles) + G11 2-trial coupling proof | dev-kinh-dich + qa | G10, G11 | P2-KD-Z | P2-KD-M | 1.5h | 5 |
| **P2-KD-Z** | Phase 2 close-gate verification (QA) — all Phase-2 goal chain confirmed | qa | (no flip) | Phase 3 | P2-KD-N | 30m | 7 |

**Total atomic tasks:** 15 (P2-KD-A through P2-KD-Z; "Z" is the final gate task, not a 15th letter)
**Total AC count:** 77
**Total estimated effort:** ~13 hours (dev-kinh-dich + qa + po combined, WIP=1 sequential)
**G12:** EARNED-PENDING (carry-forward — no new task; QA re-confirms streak at P2-KD-Z)

> **Correction:** the task count above is 14 dev/qa/po tasks + 1 close-gate = 15 total entries in the
> ledger. P2-KD-Z is the close-gate. The letter sequence is A, B, C, D, E, F, G, H, I, J, K, L, M, N, Z.
> This mirrors the stock-price pattern where Z is always the close-gate (not a sequential letter).

---

## Per-Task Acceptance Criteria

---

### P2-KD-A — Create `kinh-dich-pre-ci` Tag

**Owner:** dev-kinh-dich
**Blocked by:** — (first Phase 2 task)
**Files touched:** none (tag only)

**Background:** L5 lesson baked Day 0. The pre-revert tag MUST exist BEFORE any `eslint.config.mjs`
or CI work lands. Standalone task so PM can verify tag before dispatching P2-KD-B.

**Step 0 (only action):**
```bash
git tag kinh-dich-pre-ci HEAD
```
Confirm with:
```bash
git log --oneline kinh-dich-pre-ci
```
Must return the current HEAD commit SHA + subject (the Phase-1 close-gate commit or a commit after it —
specifically a commit that is an ancestor of HEAD at Phase-2 kickoff).

**AC-1:** `git log --oneline kinh-dich-pre-ci` returns exactly one line referencing a Phase-1 commit.
No `--force`, no push.

**AC-2:** `git tag | grep kinh-dich-pre-ci` returns `kinh-dich-pre-ci` (tag exists in local repo).

**AC-3:** Anchor still INTACT: `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1` returns non-empty output.

**Commit:** No commit required for tag creation. Dev creates a signal file documenting the tag SHA,
stages with L84 explicit path, and commits it as the evidence record.

**Signal file:** `docs/signals/dev-kd-P2-KD-A-done-<UTC>.json` (fields: task=P2-KD-A,
tag=kinh-dich-pre-ci, tagged_sha=<sha>, anchor_intact=true, next=pm).

**G-goal posture:** NO goal flips. Tag is infrastructure only. §4.5 SSOT untouched.

---

### P2-KD-B — `eslint.config.mjs` Fence-A/B/C Creation + CI Wiring

**Owner:** dev-kinh-dich
**Blocked by:** P2-KD-A DONE (tag exists)
**Files touched:**
- `apps/kinh-dich-service/eslint.config.mjs` (CREATE — per charter §G4 template, LOCKED at charter v1)
- `apps/kinh-dich-service/package.json` (MODIFY — add `eslint` and `eslint-plugin-boundaries` to devDependencies)
- `.github/workflows/ci.yml` (MODIFY — add `kinh-dich-ts-lint` job, if CI file exists; otherwise document offline `bunx eslint` as the CI equivalent)

**Background:** kinh-dich is the FIRST TS/Bun service in the fleet to exercise `eslint-plugin-boundaries`
(SI-3 Option A). The fence config is verbatim from charter §G4 template (LOCKED at charter v1 per SI-3 §5;
no architect Amendment needed). Three fences mirror Go depguard Fence-A/B/C on the TS/Bun service:

- **Fence-A:** `src/primitive/**` must not import `src/module`, `src/application`, `src/interface`, or `src/infrastructure`
- **Fence-B:** `src/module/**` must not import `src/application`, `src/interface`, or `src/infrastructure`
- **Fence-C:** `src/infrastructure/**` may only be imported from `src/index.ts` (composition root)

The R-FENCE gate (charter §R-FENCE Boundary Clause) binds on AC-4b in P2-KD-C — this task creates
the fence; P2-KD-C proves it catches violations on the real `.js`-suffixed ESM import style.

**eslint.config.mjs content (verbatim from charter §G4 — copy exactly):**

```javascript
// apps/kinh-dich-service/eslint.config.mjs
// Architecture fence — three DDD layer rules matching Go depguard Fence-A/B/C.
// Frozen at G4 close; see pilot-charter.md §G4 for AC.
//
// Fence-A: src/primitive/** must not import src/module, src/application,
//          src/interface, or src/infrastructure
// Fence-B: src/module/** must not import src/application, src/interface,
//          or src/infrastructure
// Fence-C: src/infrastructure/** may only be imported from src/index.ts
//          (composition root). All other files are barred from importing infra.

import boundaries from "eslint-plugin-boundaries";

export default [
  {
    plugins: {
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        { type: "primitive", pattern: "src/primitive/**/*" },
        { type: "module",    pattern: "src/module/**/*" },
        { type: "infrastructure", pattern: "src/infrastructure/**/*" },
        { type: "application",    pattern: "src/application/**/*" },
        { type: "interface",      pattern: "src/interface/**/*" },
        { type: "domain",         pattern: "src/domain/**/*" },
        { type: "composition-root", pattern: "src/index.ts" },
      ],
      "boundaries/ignore": [
        "**/__tests__/**",
        "**/sandbox/**",
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: "primitive",
              disallow: ["module", "application", "interface", "infrastructure"],
              message: "Fence-A: primitive must not import ${dependency.type} layer",
            },
            {
              from: "module",
              disallow: ["application", "interface", "infrastructure"],
              message: "Fence-B: module must not import ${dependency.type} layer",
            },
            {
              from: ["domain", "application", "module", "primitive", "interface"],
              disallow: ["infrastructure"],
              message: "Fence-C: infrastructure wiring only allowed in src/index.ts (composition root)",
            },
          ],
        },
      ],
    },
  },
];
```

**package.json devDependencies additions:**
```json
"eslint": "^9.0.0",
"eslint-plugin-boundaries": "^6.0.2"
```

**R-2 fallback (pre-documented — activate ONLY if AC-4b fails in P2-KD-C):**
If `eslint-plugin-boundaries` fails to match `.js`-suffixed import paths, add:
```json
"@typescript-eslint/parser": "^7.0.0"
```
And add to `eslint.config.mjs`:
```javascript
import tsParser from "@typescript-eslint/parser";
// inside the config object:
languageOptions: { parser: tsParser },
```
This fallback stays within Option A and does NOT require a new task — dev-kinh-dich applies
it inline within P2-KD-B/C if the empirical AC-4b proof reveals R-2 is a real blocker.

**AC-1:** `apps/kinh-dich-service/eslint.config.mjs` exists and contains `eslint-plugin-boundaries`
rules for Fence-A, Fence-B, and Fence-C per the verbatim template above.

**AC-2:** `apps/kinh-dich-service/package.json` devDependencies include `eslint` and
`eslint-plugin-boundaries` (both present). Evidence:
```bash
jq '.devDependencies | keys | map(select(test("eslint")))' apps/kinh-dich-service/package.json
```
Returns array containing `["eslint", "eslint-plugin-boundaries"]` (plus any additional eslint packages
if R-2 fallback was needed).

**AC-3:** Running `cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0` exits 0 on the
CURRENT Phase-1 codebase (no fence violations exist — all Phase-1 primitives and the module are
already clean; sandbox is excluded by `boundaries/ignore`).

**AC-4:** `git log --oneline apps/kinh-dich-service/eslint.config.mjs` shows ONLY P2-KD-B as the
most recent commit on that file (establishes the freeze anchor path for AC-4c in P2-KD-D).

**AC-5 — G12 DoD gate:**
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
Exits 0. Paste output summary (≥14 scenarios PASS) to handoff doc.

**Commit subject pattern:**
```
feat(kinh-dich): P2-KD-B — eslint.config.mjs Fence-A/B/C + eslint-plugin-boundaries devDep (G4 partial)
```

**G-goal posture:** NO goal flips. G4 advances but does NOT flip to YES here. §4.5 SSOT untouched.

---

### P2-KD-C — G4 Deliberate-Violation Proof (AC-4b) — Reverted, NEVER Committed

**Owner:** dev-kinh-dich + qa (QA reproduces independently)
**Blocked by:** P2-KD-B DONE (`eslint.config.mjs` exists and `bunx eslint` passes clean run)
**Files touched:** NONE committed — violation is local-only, reverted before any commit

**Background:** AC-4b requires proof that the fence CATCHES a real violation on kinh-dich's actual
`.js`-suffixed ESM import style. The violation is a controlled local experiment ONLY. It MUST be
reverted before any commit is made. `git status` must be clean after revert. This is the R-FENCE gate
— the binding proof that `eslint-plugin-boundaries` works on this service's real import style.

**Violation procedure (dev-kinh-dich executes, qa reproduces independently):**

Step 1 — Add ONE temporary Fence-A violation to `hexagram-resolver` (the named target from charter §G4 + brownfield §6.3):
```bash
# Append to src/primitive/hexagram-resolver/index.ts
echo "" >> apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
echo "// DELIBERATE FENCE-A VIOLATION — DO NOT COMMIT" >> apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
echo "import type { ReadingRequest } from '../../application/dtos.js'; // Fence-A breach" >> apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
```
Do NOT stage or commit — keep the edit local only.

Step 2 — Run the linter:
```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```
Must exit non-zero. Output must contain "Fence-A" in the error message.

Step 3 — Revert the violation immediately:
```bash
git checkout apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
```

Step 4 — Confirm clean linter run:
```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```
Must exit 0.

Step 5 — Confirm git status is clean:
```bash
git status --short | grep "hexagram-resolver"
```
Must show no changes.

**R-2 resolution (if Step 2 fails to produce "Fence-A" output):** Apply the in-Option-A fallback
documented in P2-KD-B (add `@typescript-eslint/parser` + `languageOptions`). Record the resolution
in handoff §R-FENCE Resolution. This fallback does NOT drop to Option C and does NOT require a
new task — dev-kinh-dich applies it inline, re-runs Steps 2-5, and records both the failure mode
and the fallback resolution.

**AC-1:** Linter exits non-zero on the violation run. Output contains "Fence-A" in the error message.
Full ESLint output pasted into handoff doc section `§Evidence — AC-4b Violation Run`. Evidence must show:
```
apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts
  N:N  error  Fence-A: primitive must not import application layer  boundaries/element-types

1 problem (1 error, 0 warnings)
```

**AC-2:** Linter exits 0 after revert. Evidence pasted into `§Evidence — AC-4b Clean Run`.

**AC-3:** `git status --short | grep "hexagram-resolver"` returns empty after revert. Violation was
NEVER staged, NEVER committed.

**AC-4:** QA independently reproduces the violation proof using the same procedure on a DIFFERENT
primitive file (e.g., `src/primitive/ngu-hanh-classifier/index.ts` with the same type of Fence-A
`application/dtos.js` import). QA pastes their own evidence (non-zero exit + "Fence-A" in output).

**AC-5 — G12 DoD gate:**
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
Exits 0 (sandbox still green after AC-4b exercise — no code changed from Phase-1 baseline).

**Commit:** No violation committed. Dev-kinh-dich commits the HANDOFF EVIDENCE ONLY (handoff doc update
with pasted ESLint outputs). QA commits their reproduction evidence similarly.

**G-goal posture:** NO goal flips. AC-4b is the R-FENCE gate arm of G4. G4 is not yet terminal.
§4.5 SSOT untouched.

---

### P2-KD-D — G4 Freeze Anchor Confirmation (AC-4c)

**Owner:** qa
**Blocked by:** P2-KD-C DONE (violation reverted, handoff evidence complete)
**Files touched:** none (read-only audit + signal emit)

**Background:** AC-4c is a git-log check confirming the `eslint.config.mjs` freeze anchor. The freeze
anchor is the P2-KD-B commit — the MOST RECENT commit on `eslint.config.mjs`. No subsequent commit
should have touched that file (the violation proof in P2-KD-C deliberately produces no committed changes
to `eslint.config.mjs`).

**AC-1 — Freeze anchor verification:**
```bash
git log --oneline apps/kinh-dich-service/eslint.config.mjs
```
The MOST RECENT commit on that file must be the P2-KD-B commit. No commit after P2-KD-B has
touched `eslint.config.mjs`. Record the commit SHA as `eslint_freeze_sha` in the G4 evidence.

**AC-2 — `kinh-dich-pre-ci` tag ancestry:**
```bash
git log --oneline kinh-dich-pre-ci
```
Must return a commit that is an ancestor of HEAD. The `kinh-dich-pre-ci` tag must point at a commit
BEFORE the P2-KD-B `eslint.config.mjs` creation commit.
Confirm: `git merge-base kinh-dich-pre-ci HEAD` returns a non-empty SHA.

**AC-3 — G4 evidence compilation:**
QA writes a G4 evidence summary to `docs/handoffs/TASK_P2-KD-D-g4-evidence.md` containing:
- `ac_4a_eslint_clean_run: YES` (from P2-KD-B AC-3 evidence — `bunx eslint src/` exits 0 on clean source)
- `ac_4b_violation_proof: YES` (from P2-KD-C — linter caught Fence-A violation, violation reverted)
- `ac_4c_freeze_sha: <sha>` (the P2-KD-B commit SHA)
- `kinh_dich_pre_ci_tag_sha: <sha>` (the P2-KD-A tag SHA)
- `r_fence_gate: PASS` (AC-4b proof succeeded on real .js-suffixed ESM import style)
- `r2_fallback_applied: YES/NO` (YES only if the `@typescript-eslint/parser` fallback was needed)
- `g4_ready_to_grade: YES` (all 3 ACs satisfied)

QA emits `docs/signals/qa-kd-P2-KD-D-g4-evidence-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G4 evidence is complete but PO flips G4 only at 12/12 terminal
Phase-3 close. §4.5 SSOT untouched.

---

### P2-KD-E — Create `kinh-dich-pre-delete` Tag

**Owner:** dev-kinh-dich
**Blocked by:** P2-KD-D DONE (G4 evidence confirmed — fence is proven before deletion)
**Files touched:** none (tag only)

**Background:** L5 discipline. The `kinh-dich-pre-delete` tag MUST exist BEFORE any `git mv` of
superseded domain logic. This sequencing ensures G4 fence is proven on the pre-deletion codebase,
so any fence violation introduced during the `git mv` operation is immediately detectable.

**Step 0 (only action):**
```bash
git tag kinh-dich-pre-delete HEAD
```
Confirm:
```bash
git log --oneline kinh-dich-pre-delete
```
Must return the HEAD commit at P2-KD-D close (the G4 evidence commit).

**AC-1:** `git log --oneline kinh-dich-pre-delete` returns the commit immediately at or after P2-KD-D
evidence signal.

**AC-2:** `git tag | grep kinh-dich-pre-delete` returns `kinh-dich-pre-delete`.

**AC-3:** Anchor still INTACT: `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1` non-empty.

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-KD-F — G5a: `git mv` Superseded `domain/services.ts` to `src/_deprecated/`

**Owner:** dev-kinh-dich
**Blocked by:** P2-KD-E DONE (`kinh-dich-pre-delete` tag confirmed)
**Files touched:**
- `apps/kinh-dich-service/src/domain/services.ts` → `apps/kinh-dich-service/src/_deprecated/services_v1.ts` (MOVE via `git mv`)
- `apps/kinh-dich-service/src/application/usecases.ts` (MODIFY — rewire `ReadingUseCase` and `MarketHexagramUseCase` to call `reading_composer` module instead of directly importing `computeReading` from `domain/services.ts`)

**Background:** Per brownfield §5 and OQ-2 resolution:

- `src/domain/services.ts` (`computeReading()` + `classifyNguHanh()` + all embedded hexagram library
  data) is the Phase-1 predecessor of the `reading_composer` module. After the module is validated
  (Phase-1 DONE), `computeReading()` and `classifyNguHanh()` are superseded. The file moves to
  `src/_deprecated/services_v1.ts`.
- **Hexagram library data** (`TRIGRAM_LINES`, `QUE_META`, `QUE_DATA` and related constants) may move
  to a thin `src/domain/hexagram-data.ts` OR be embedded directly in the relevant primitives.
  dev-kinh-dich decides — both are valid. Document the decision in the handoff.
- `src/application/usecases.ts` currently imports `computeReading` from `domain/services.ts`.
  After the move, `ReadingUseCase.execute()` and `MarketHexagramUseCase.execute()` must call the
  `reading_composer` module's `ReadingComposer.compose()` method instead.
- The existing tests in `src/__tests__/` that exercise `computeReading` move alongside the deprecated
  service and remain compilable under their new package path as DEPRECATED tests (NOT deleted).

**Pre-condition (mandatory — verify before any `git mv`):**
```bash
git log --oneline kinh-dich-pre-delete
```
Must return the P2-KD-E commit. If tag is missing, STOP and notify PM.

**AC-1 — G5a file moved:**
```bash
test -f apps/kinh-dich-service/src/_deprecated/services_v1.ts && echo FOUND
test -f apps/kinh-dich-service/src/domain/services.ts && echo STILL_EXISTS
```
First command echoes FOUND. Second command echoes nothing (original path is gone).

**AC-2 — Application use case rewired:**
```bash
grep -n "computeReading\|classifyNguHanh" apps/kinh-dich-service/src/application/usecases.ts
```
Must return 0 matches (the use cases no longer import the deprecated domain service functions directly).
Instead, they call `ReadingComposer.compose()` from the module.

**AC-3 — Build / type check clean:**
```bash
cd apps/kinh-dich-service && bun run tsc --noEmit
```
Exits 0 (the deprecation move did not break TypeScript compilation — the deprecated service compiles
under its new path, and the use cases now call the module).

**AC-4 — Fence-A/B/C clean post-move:**
```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```
Exits 0 (no new fence violations introduced by the `git mv` or the use-case rewire).

**AC-5 — G12 DoD gate:**
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
Exits 0. Sandbox still green after deprecation move (≥14 scenarios PASS).

**AC-6 — `_deprecated/` directory exists with moved file:**
```bash
find apps/kinh-dich-service/src -path "*_deprecated*" -type f | sort
```
Output includes `services_v1.ts` under the `_deprecated/` path.

**AC-7 — Fence-C still holds (infra not imported outside composition root):**
```bash
grep -rn "from.*infrastructure" \
  apps/kinh-dich-service/src/domain/ \
  apps/kinh-dich-service/src/application/ \
  apps/kinh-dich-service/src/module/ \
  apps/kinh-dich-service/src/primitive/
```
Must return 0. Infra imports exist only in `src/index.ts` (composition root).

**Commit subject pattern:**
```
chore(kinh-dich): P2-KD-F — git mv domain/services.ts → _deprecated/ + usecases rewire to reading_composer (G5a)
```

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-KD-G — G5b: MCP Handler HTTP Rewire (6 Tools → Port 5005 + 4 New Endpoints)

**Owner:** dev-kinh-dich
**Blocked by:** P2-KD-F DONE (G5a move complete — kinh-dich-service module is the canonical interface)
**Files touched:**
- `apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts` (MODIFY — rewire 6 tools from direct domain imports to HTTP calls to port 5005)
- `apps/kinh-dich-service/src/interface/handlers.ts` (MODIFY — add 4 new HTTP endpoints: `/readings/{code}/history`, `/hexagram/{number}/transitions`, `/backtest/{code}`, `/hexagram/{number}/explain`)
- `apps/kinh-dich-service/src/application/usecases.ts` (MODIFY if needed — add use cases for the 4 new endpoints)
- `apps/mcp-server/src/infrastructure/microservices/clients.ts` (MODIFY — add `kinh-dich` HTTP client function(s) routing to port 5005)

**Background (from brownfield §5 — HIGH-RISK G5b finding):**

The 6 MCP kinh-dich tools in `kinhDichTools.ts` currently use DIRECT domain imports from the mcp-server's
parallel copy of kinh-dich domain at `apps/mcp-server/src/domain/services/kinhDich/`. This is the most
complex G5 in the fleet so far. G5b requires:

**(a) Rewire 6 MCP tool handlers** to call kinh-dich-service via HTTP to port 5005:

| Tool | Current | Post-rewire |
|------|---------|-------------|
| `get_kinhdich_reading` | Calls `computeReading()` from mcp-server domain copy | HTTP POST `http://kinh-dich-service:5005/reading/{code}` (score helpers stay in mcp-server) |
| `get_market_hexagram` | Calls `computeReading("VNINDEX", scores)` from mcp-server domain copy | HTTP GET `http://kinh-dich-service:5005/market` |
| `get_hexagram_history` | Calls `getReadingsForBacktest()` from mcp-server hexagramStore | HTTP GET `http://kinh-dich-service:5005/readings/{code}/history?days=N` (new endpoint) |
| `get_transition_probabilities` | Calls `getTopTransitions()` from mcp-server hexagramStore | HTTP GET `http://kinh-dich-service:5005/hexagram/{number}/transitions?code=X` (new endpoint) |
| `run_hexagram_backtest` | Calls `computeBacktest()` + DB via mcp-server | HTTP GET `http://kinh-dich-service:5005/backtest/{code}?days=N` (new endpoint) |
| `explain_hexagram` | Reads `QUE_META`+`QUE_DATA` from mcp-server hexagramLibrary copy | HTTP GET `http://kinh-dich-service:5005/hexagram/{number}/explain` (new endpoint) |

**(b) Score-computation helpers** (`computeHaoScores`, `computeSentimentScore`, `computeFundamentalsScore`)
query mcp-server's own SQLite DB — they are NOT kinh-dich-service domain. They STAY in mcp-server as
integration glue that computes the 6 input scores, then POSTs them to kinh-dich-service.

**(c) Deprecate the parallel mcp-server copy** (`apps/mcp-server/src/domain/services/kinhDich/`)
by removing its imports from `kinhDichTools.ts`. The parallel copy files themselves may be moved to
a `_deprecated/` subfolder within mcp-server OR left in place with a deprecation comment — dev-kinh-dich decides.
The binding requirement is zero live imports from that copy in any non-deprecated code.

**Port resolution:** port 5005 is the kinh-dich-service address per `docs/data/system-map.json`.
Never hardcode — read via jq or use the system-map service-name lookup. The HTTP client in
`apps/mcp-server/src/infrastructure/microservices/clients.ts` must use the system-map port value.

**AC-1 — Zero direct domain imports from mcp-server parallel copy:**
```bash
grep -rn "from.*domain/services/kinhDich\|from.*kinhDichReading\|from.*hexagramLibrary\|from.*hexagramBacktester\|from.*kinhDichFormatter\|from.*kinhDichWrapper\|from.*nguHanhClassifier\|from.*haoEncoder\|from.*hexagramResolver" \
  apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts
```
Must return 0 matches (no live imports from the parallel copy remain in `kinhDichTools.ts`).

**AC-2 — HTTP client confirmed at correct port:**
```bash
grep -n "5005\|kinh-dich" apps/mcp-server/src/infrastructure/microservices/clients.ts
```
Must return ≥1 match showing `5005` or `kinh-dich-service` (confirming HTTP integration to the correct port).

**AC-3 — 4 new kinh-dich-service endpoints exist and respond:**
```bash
grep -n "/readings\|/hexagram\|/backtest" apps/kinh-dich-service/src/interface/handlers.ts
```
Must return ≥4 matches (the 4 new route registrations).

**AC-4 — Fence-C still holds post-rewire:**
```bash
grep -rn "from.*infrastructure" \
  apps/mcp-server/src/interface/mcp/tools/kinhdich/ \
  apps/kinh-dich-service/src/module/ \
  apps/kinh-dich-service/src/primitive/
```
Must return 0 (no direct infra imports introduced in the rewired tool handlers or kinh-dich module/primitive layers).

**AC-5 — ESLint fence still clean:**
```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```
Exits 0 after the endpoint additions.

**AC-6 — TypeScript clean:**
```bash
cd apps/kinh-dich-service && bun run tsc --noEmit
```
Exits 0.

**AC-7 — G12 DoD gate:**
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
Exits 0. Paste output to handoff doc (≥14 scenarios PASS).

**AC-8 — Score helpers still in mcp-server (not migrated to kinh-dich-service):**
```bash
grep -n "computeHaoScores\|computeSentimentScore\|computeFundamentalsScore" \
  apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts
```
Must return ≥1 match (score helpers remain in mcp-server as integration glue — they are NOT removed).

**Commit subject pattern:**
```
feat(kinh-dich): P2-KD-G — G5b MCP HTTP rewire (6 tools → port 5005) + 4 new kinh-dich-service endpoints
```

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-KD-H — G5c: Zero `TODO.*migrat` Audit + G5 Evidence Sign-Off

**Owner:** qa
**Blocked by:** P2-KD-G DONE (G5b rewire complete)
**Files touched:** none (read-only audit + signal emit)

**Background:** G5c requires zero migration-comment debt across the kinh-dich zone and the
affected mcp-server tool directory. This task is the final G5 confirmation gate before G3 cleanup.

**AC-1 — Zero `TODO.*migrat` markers (G5c):**
```bash
grep -rn "TODO.*migrat" \
  apps/kinh-dich-service/ \
  apps/mcp-server/src/interface/mcp/tools/kinhdich/ \
  --include='*.ts'
```
Must return 0 matches.

**AC-2 — Zero `TODO.*migrat` in `_deprecated/` paths:**
```bash
grep -rn "TODO.*migrat" apps/kinh-dich-service/src/_deprecated/ 2>/dev/null
```
Must return 0 matches (the deprecated files must not carry TODO.*migrat markers).

**AC-3 — Zero direct domain imports from parallel mcp-server copy (post-rewire confirmation):**
```bash
grep -rn "from.*kinhDich\|from.*hexagramLibrary\|from.*hexagramBacktester" \
  apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts
```
Must return 0 matches (G5b rewire is confirmed clean — no regressions introduced after P2-KD-G).

**AC-4 — HTTP port confirmed in mcp-server client:**
```bash
grep -n "5005\|kinh-dich-service" apps/mcp-server/src/infrastructure/microservices/clients.ts
```
Returns ≥1 match (HTTP client routes to correct port).

**AC-5 — G5 evidence compiled:**
QA writes G5 grade evidence to `docs/handoffs/TASK_P2-KD-H-g5-evidence.md`:
- `g5a_deprecated_path: apps/kinh-dich-service/src/_deprecated/services_v1.ts`
- `g5b_zero_direct_domain_imports: YES`
- `g5b_http_client_present: YES (port 5005 in clients.ts)`
- `g5b_new_endpoints: 4 (/readings/{code}/history, /hexagram/{number}/transitions, /backtest/{code}, /hexagram/{number}/explain)`
- `g5c_zero_todo_migrat: YES`
- `g5_ready_to_grade: YES`

QA emits `docs/signals/qa-kd-P2-KD-H-g5-evidence-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G5 evidence complete. §4.5 SSOT untouched.

---

### P2-KD-I — G3: Composition Root Cleanup ≤80L + OpenAPI Contract

**Owner:** dev-kinh-dich
**Blocked by:** P2-KD-H DONE (G5 chain confirmed clean — safe to finalize composition root)
**Files touched:**
- `apps/kinh-dich-service/src/index.ts` (MODIFY — wire `reading_composer` module; ensure MarkovPort injection; remove any remaining domain logic; confirm port 5005 from env-var or system-map query, NOT hardcoded)
- `apps/kinh-dich-service/src/interface/openapi.yaml` (CREATE — OpenAPI contract documenting all HTTP endpoints including the 4 new G5b endpoints)

**Background:** G3 requires the composition root to be a pure wiring file (no business logic,
no if-on-data-values, no hexagram calculations) AND an HTTP contract document (OpenAPI YAML) at
`apps/kinh-dich-service/src/interface/`. The SQLite MarkovPort impl (`SQLiteKinhDichRepository`)
is wired HERE as the infra implementation of `MarkovPort` — this is the ONLY place it is injected.

`src/index.ts` target ≤80 lines (charter §G3 calibration). If wiring complexity would push past 80
lines, extract DI wiring to a `src/index.wire.ts` helper file (pure wiring, no business logic).

**AC-1 — Zero domain-operation grep in composition root:**
```bash
grep -c "computeReading\|classifyNguHanh\|resolveHexagram\|encodeHaos" \
  apps/kinh-dich-service/src/index.ts
```
Must return 0. Business logic lives in primitives/module, not the composition root.

**AC-2 — MarkovPort infra injected at composition root (Fence-C confirmed):**
```bash
grep -n "SQLiteKinhDichRepository\|repositories\|MarkovPort" apps/kinh-dich-service/src/index.ts
```
Must return ≥1 match (the SQLite adapter is wired here — correct per Fence-C).

**AC-3 — Composition root ≤80 lines:**
```bash
wc -l apps/kinh-dich-service/src/index.ts
```
Must return ≤80. If exceeding 80, extract to `src/index.wire.ts` (DI helper file, not business logic).

**AC-4 — OpenAPI contract exists and covers all live endpoints:**
```bash
test -f apps/kinh-dich-service/src/interface/openapi.yaml && echo FOUND
```
Echoes FOUND. The YAML must document at minimum:
- `GET /health` → `{ status, service, port }`
- `POST /reading/{code}` → request: `{ scores: number[6], markovData?: MarkovData | null }`, response: `KinhDichReading`
- `GET /market` → response: `KinhDichReading`
- `GET /readings/{code}/history?days=N` → response: `KinhDichStoredRow[]`
- `GET /hexagram/{number}/transitions?code=X` → response: `MarkovTransition[]`
- `GET /backtest/{code}?days=N` → response: `BacktestResult`
- `GET /hexagram/{number}/explain` → response: `HexagramExplanation`

Validation: `python3 -c "import sys,yaml; yaml.safe_load(sys.stdin)" < apps/kinh-dich-service/src/interface/openapi.yaml` exits 0 (valid YAML).

**AC-5 — Fence-C + ESLint clean:**
```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0 && bun run tsc --noEmit
```
Both exit 0.

**AC-6 — G12 DoD gate:**
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
Exits 0. Paste output to handoff doc.

**Commit subject pattern:**
```
feat(kinh-dich): P2-KD-I — composition root cleanup ≤80L + OpenAPI contract src/interface/openapi.yaml (G3)
```

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-KD-J — G6 Finalization + `nuclear-hexagram-computer` 5th Primitive

**Owner:** dev-kinh-dich
**Blocked by:** P2-KD-I DONE (composition root and OpenAPI in place — microservice panel can show real endpoint facts)
**Files touched:**
- `apps/kinh-dich-service/src/primitive/nuclear-hexagram-computer/index.ts` (CREATE — 5th primitive)
- `apps/kinh-dich-service/src/primitive/nuclear-hexagram-computer/index.test.ts` (CREATE)
- `docs/scenarios/kinh-dich/primitives/nuclear-hexagram-computer-golden.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/nuclear-hexagram-computer-edge.json` (CREATE)
- `docs/scenarios/kinh-dich/primitives/nuclear-hexagram-computer-failure.json` (CREATE)
- `apps/kinh-dich-service/dashboard/index.html` (MODIFY — finalization: add 5th primitive card, link OpenAPI contract, add G5a deprecated note, update microservice panel endpoint facts)

**Background — G6 finalization scope:**

kinh-dich ALREADY has a working dashboard from Phase-1 (6/6 cards, DASHBOARD-LIVE in SI-2 era).
Phase-2 G6 is FINALIZATION, not genesis. Finalization adds:
1. The 5th primitive card (`nuclear-hexagram-computer` — deferred from Phase-1 per plan OQ-1)
2. Link to the OpenAPI contract in the microservice panel (created in P2-KD-I)
3. A "Deprecated" notice section listing `src/_deprecated/services_v1.ts` (trust-layer visibility of G5a)
4. Update microservice panel port facts to cite `openapi.yaml` (not hardcoded)

**Note on SI-2:** kinh-dich MUST NOT create or modify `docs/dashboards/index.html` (stock-price's G6
deliverable). kinh-dich G6 = `apps/kinh-dich-service/dashboard/index.html` only. The fleet index
already links kinh-dich (stock-price inserted a `NOT-YET-ACTIVE` row when creating the fleet index).

**`nuclear-hexagram-computer` spec (from brownfield §3, priority-5):**

Source: `computeHoQue()` (L283-L285) + `computeBienQue()` (L288-L295) in `domain/services.ts`.
Maps 6 signals + `HaoReading[]` → nuclear (hộ quẻ) + transformed (biến quẻ) hexagram numbers.
Both functions delegate to `resolveHexagram()` — the primitive may import `hexagram-resolver` (primitive-to-primitive import is NOT fenced):

```typescript
// src/primitive/nuclear-hexagram-computer/index.ts
import { resolveHexagram } from '../hexagram-resolver/index.js'; // cross-primitive OK — not fenced
import type { HaoReading } from '../hao-encoder/index.js';

export function computeHoQue(signals: number[]): number;
export function computeBienQue(haos: HaoReading[]): number;
```

**AC-1 — 5th primitive exists and is Fence-A clean:**
```bash
test -f apps/kinh-dich-service/src/primitive/nuclear-hexagram-computer/index.ts && echo FOUND
grep -rn "from.*application\|from.*interface\|from.*infrastructure\|from.*module" \
  apps/kinh-dich-service/src/primitive/nuclear-hexagram-computer/
```
First echoes FOUND. Second returns 0 (Fence-A clean; cross-primitive imports to `hexagram-resolver`
and `hao-encoder` are exempt from Fence-A).

**AC-2 — ESLint fence still clean:**
```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```
Exits 0 (cross-primitive import does not trigger Fence-A — `boundaries/ignore` or Fence-A only
disallows module/application/interface/infrastructure layers, not other primitives).

**AC-3 — 3 scenario JSONs present:**
```bash
ls docs/scenarios/kinh-dich/primitives/ | grep nuclear
```
Must return 3 files: `nuclear-hexagram-computer-golden.json`, `nuclear-hexagram-computer-edge.json`,
`nuclear-hexagram-computer-failure.json`.

**AC-4 — Dashboard finalized (G6):**
```bash
grep -c "nuclear-hexagram-computer\|_deprecated\|openapi\|Deprecated" \
  apps/kinh-dich-service/dashboard/index.html
```
Must return ≥3 (5th primitive card + deprecated notice + OpenAPI link are all present in the HTML).

**AC-5 — SI-2 boundary held:**
```bash
git diff --name-only HEAD | grep "docs/dashboards/index.html"
```
Must return empty (kinh-dich did not touch the fleet index).

**AC-6 — G12 DoD gate (expanded baseline):**
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
Exits 0 with ≥17 scenarios PASS (14 Phase-1 baseline + 3 new nuclear-hexagram-computer scenarios).

**AC-7 — Dashboard opens file:// with zero network calls:**
Dev-kinh-dich confirms: open `apps/kinh-dich-service/dashboard/index.html` via `file://` —
ZERO external CDN requests, ZERO fetch to port 5005 or any HTTP endpoint. G9 Playwright pre-check.

**Commit subject pattern:**
```
feat(kinh-dich): P2-KD-J — nuclear-hexagram-computer primitive + dashboard G6 finalization (G6 + G1 5th prim)
```

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-KD-K — G8 Honest-Red Deliberate-Break Proof

**Owner:** qa
**Blocked by:** P2-KD-J DONE (dashboard finalized — honest-red test requires a working dashboard with all cards)
**Files touched:** none committed (test edits to scenario JSON are reverted; handoff doc is committed)

**Background:** G8 honest-red contract. Two tests prove the dashboard is not a false-green machine:
- Test A (deliberately corrupted scenario) → bun sandbox RED + dashboard shows non-green for affected card
- Test B (golden scenario after revert) → bun sandbox GREEN + dashboard shows green

**Test A — Corrupted scenario:**
1. Edit one golden scenario JSON (e.g., `docs/scenarios/kinh-dich/primitives/hexagram-resolver-golden.json`).
   Change one expected output field to a wrong value (e.g., flip the expected hexagram number to a different value).
2. Run sandbox:
   ```bash
   cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
   ```
   Must exit non-zero with ≥1 FAIL for `hexagram-resolver`.
3. Open `apps/kinh-dich-service/dashboard/index.html` — `hexagram-resolver` card must show FAIL/RED.
4. Capture terminal output + dashboard state description.
5. Revert the JSON edit:
   ```bash
   git checkout docs/scenarios/kinh-dich/primitives/hexagram-resolver-golden.json
   ```

**Test B — Golden scenario (after revert):**
1. Run sandbox:
   ```bash
   cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
   ```
   Must exit 0 with all scenarios PASS.
2. Open dashboard — all cards show GREEN. No false greens on NOT-RUN items.

**AC-1 (Test A):** Sandbox exits non-zero on corrupted scenario AND dashboard shows non-green for
the affected card. Evidence (full terminal output) pasted to handoff `§Evidence — G8 Test A`.

**AC-2 (Test B):** Sandbox exits 0 after revert AND dashboard shows green for all cards.
Evidence pasted to handoff `§Evidence — G8 Test B`.

**AC-3 — 2 additional known-bad runs:**
QA runs 2 more deliberately corrupted scenario invocations using different primitives
(e.g., `ngu-hanh-classifier-golden.json` then `hao-encoder-golden.json`). All 2 return exit non-zero.
Evidence: paste exit codes.

**AC-4 — Reverted files clean:**
```bash
git status --short | grep "scenarios/kinh-dich"
```
Returns empty (no staged or unstaged changes to any scenario file).

**AC-5 — G8 evidence compiled:**
QA writes `docs/handoffs/TASK_P2-KD-K-g8-evidence.md` and emits
`docs/signals/qa-kd-P2-KD-K-g8-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G8 evidence complete. §4.5 SSOT untouched.

---

### P2-KD-L — G9 PO Playwright Path B (Chromium-Headless-Shell, TCC-Staged)

**Owner:** po
**Blocked by:** P2-KD-K DONE (dashboard honest-red proven — trust contract can now be verified)

**Background:** Charter §G9 Path B is the Day-0 default (L6 lesson baked in). No synchronous user
wait required. PO runs Playwright chromium-headless-shell against the per-service dashboard
(`apps/kinh-dich-service/dashboard/index.html`). Playwright 1.60.0 + cached chromium confirmed
available (`npx playwright --version` = 1.60.0; chromium-headless-shell cached per PO cycle-19
precedent). TCC-staged via Terminal.app per L87.

If user is available for a Path A verbal confirm, PO may substitute Path A — either path satisfies G9.

**AC-1:** PO runs Playwright headless chromium against `file://apps/kinh-dich-service/dashboard/index.html`.
All 3 panels (primitives, module, microservice) are rendered in the DOM.

**AC-2:** ZERO console errors, ZERO pageerrors, ZERO requestfailed in Playwright log.

**AC-3:** All primitive cards (≥5 with nuclear-hexagram-computer) + module card (`reading_composer`) +
microservice card are visible. Status displayed honestly (GREEN for sandbox-run items from prior test,
NOT-RUN for cold-open items — no false greens after cold open).

**AC-4:** PO records verdict in `docs/po-decisions/<date>-g9-kinh-dich-user-confirmation.md`
per charter §G9 Path B template. Fields: `pilot: kinh-dich-service`, `path: B (PO Playwright)`,
`verdict: PASS` (or FAIL if zero-console-errors not met). Emits
`docs/signals/po-kd-P2-KD-L-g9-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G9 evidence complete. §4.5 SSOT untouched.

---

### P2-KD-M — Create `kinh-dich-pre-inject` Tag + G10 Bug Injection

**Owner:** qa
**Blocked by:** P2-KD-L DONE (G9 confirmed — trust layer proven before deliberately breaking things)
**Files touched:** 1 committed injection file (deliberate bug in a primitive)

**Background:** L5 tag discipline + G10 bug injection spec from charter §G10. The pre-inject tag
MUST exist BEFORE the injection commit. QA injects a SINGLE-LITERAL bug into a kinh-dich primitive.

**Step 0 (mandatory — before any file edit):**
```bash
git tag kinh-dich-pre-inject HEAD
git log --oneline kinh-dich-pre-inject
```
Must return the P2-KD-L evidence commit (PO's G9 verdict). STOP if tag fails.

**Bug injection spec (calibrated for kinh-dich, off-by-one / wrong-literal pattern):**
- **Target:** `apps/kinh-dich-service/src/primitive/hao-encoder/index.ts`
- **Injection (example — QA picks the exact literal):** Change a threshold constant to a wrong value.
  Candidates:
  - Change `LAO_DUONG_THRESHOLD` from its correct value (e.g., `0.75`) to `0.85` (off-by-one margin)
  - OR flip a comparison operator: `score > threshold` → `score >= threshold`
  - OR change `STATE_TO_BINARY` mapping for one state key (e.g., map `LAO_DUONG` → `0` instead of `1`)
- **Effect:** `hao-encoder-golden.json` scenario fails (expected HaoReading states no longer match
  actual computed states for boundary-value inputs).
- **Dashboard:** `hao-encoder` card turns FAIL/RED after sandbox run.
- **Single literal:** the change is ONE character / one literal — deterministic correct fix exists.

**AC-1:** `kinh-dich-pre-inject` tag exists on the commit BEFORE the injection:
```bash
git log --oneline -2
```
Shows injection commit on top, `kinh-dich-pre-inject` tag on the commit below it.

**AC-2:** After injection commit, sandbox shows at least 1 FAIL:
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
```
Exits non-zero. Paste output to handoff (evidence of FAIL state with ≥1 hao-encoder FAIL).

**AC-3:** Dashboard shows FAIL/RED for `hao-encoder` card after sandbox run.
QA describes dashboard state in handoff `§Evidence — G10 Injection`.

**AC-4:** Injection commit subject:
```
test(kinh-dich): P2-KD-M — deliberate bug injection for G10 AI-fixability proof (kinh-dich-pre-inject tagged)
```

**G-goal posture:** NO goal flips. §4.5 SSOT untouched.

---

### P2-KD-N — G10 AI-Fixability Proof (≤2 Cycles) + G11 2-Trial Coupling Proof

**Owner:** dev-kinh-dich (fix) + qa (cycle count + Trial-2)
**Blocked by:** P2-KD-M DONE (bug injected, dashboard RED, pre-inject tag confirmed)

**Background:** G10 and G11 are proven in sequence within this task.

#### G10 — Fix the injected bug (≤2 dispatch cycles)

**The injected bug:** wrong literal / off-by-one in `hao-encoder/index.ts`.

Dev-kinh-dich diagnoses from the RED dashboard, fixes the single-literal bug, verifies sandbox green,
verifies dashboard green — all within ≤2 dispatch cycles.

**Cycle counting:** QA counts from receipt of P2-KD-M DONE signal to sandbox-exit-0 again.
Each dev-kinh-dich dispatch = 1 cycle. Target: ≤2 cycles.

**AC-1 (G10):**
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
Exits 0 after fix. Paste full output to handoff (≥17 scenarios PASS).

**AC-2 (G10):** Dashboard shows GREEN for `hao-encoder` card after fix and sandbox run.

**AC-3 (G10 cycle count):** QA records cycle count in `docs/handoffs/TASK_P2-KD-N-g10-g11.md`:
- Cycle count = 1 → G10 EXCEEDS baseline (1.5 system-wide per `docs/data/bug-inventory.json kinh_dich_baseline`)
- Cycle count = 2 → G10 MEETS baseline
- Cycle count > 2 → G10 FAILS — PM escalates to architect before Phase 3

**AC-4 (G12 DoD gate — dev-kinh-dich):**
```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
Exits 0 BEFORE dev declares DONE. Evidence pasted to handoff.

#### G11 — 2-Trial Regression Alarm Coupling Proof

**Trial-1** uses the G10 fix sequence already completed:
- QA verifies: during the G10 bug injection, at least ONE other scenario (a scenario for a primitive
  or the module that depends on `hao-encoder` output — e.g., the `reading-composer-golden.json` module
  scenario uses `encodeHaos()` indirectly) went RED alongside the injected bug scenario.
- If no coupled scenario went RED, QA updates the module scenario to exercise the hao-encoder path,
  then re-runs Trial-1 with the corrected scenario.
- Single-edit fix (the one-literal revert) repairs ALL coupled REDs simultaneously.
- Outcome-(a): ≥1 coupled scenario went RED; single-edit fix restored all GREEN. PASS.

**Trial-2** (a different primitive mutation + coupling proof):
1. QA injects a DIFFERENT one-literal mutation into `ngu-hanh-classifier/index.ts`
   (e.g., swap two return values in the `GENERATION` table for a specific element pair, causing
   the classifier to return wrong `dynamic` for that pair).
2. Confirm: `ngu-hanh-classifier-golden.json` fails AND ≥1 module-level scenario also fails
   (coupling proof — the `reading_composer` module scenario that exercises this trigram pair is affected).
3. Dev-kinh-dich reverts the mutation in 1 edit.
4. Sandbox exits 0 after fix. All coupled REDs resolved.
5. QA decides whether Trial-2 injection is committed-then-reverted or local-only (either is acceptable
   per the grading rubric as long as git is clean at P2-KD-N completion).

**AC-5 (G11):** QA records both trials in `docs/handoffs/TASK_P2-KD-N-g10-g11.md`:
- `trial_1_outcome: outcome-(a)` (coupled REDs from G10 injection + single-edit fix)
- `trial_2_outcome: outcome-(a)` (coupled REDs from different primitive mutation + single-edit fix)
- `g11_verdict: PASS`

QA emits `docs/signals/qa-kd-P2-KD-N-g10-g11-done-<UTC>.json`.

**G-goal posture:** NO goal flips. G10 and G11 evidence complete. §4.5 SSOT untouched.

---

### P2-KD-Z — Phase 2 Close-Gate Verification (QA)

**Owner:** qa
**Blocked by:** P2-KD-N DONE (G10 + G11 chain complete)
**Files touched:** none (read-only audit + signal emit)

**Background:** Final Phase-2 gate. QA verifies the complete goal evidence chain before emitting
the signal that authorizes PM to transition SSOT to phase2=CLOSED and notify PO for Phase 3.
NO goal flips in this task — that is a Phase-3 PO-only event.

**AC-1 — Sandbox all-green (Phase-2 state, expanded baseline):**
```bash
cd apps/kinh-dich-service
bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
bun run src/sandbox/runner.ts --tier=module --module=kinh-dich --scenario=all
bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```
All three exit 0. QA pastes all three outputs to close-gate doc.
Expected scenario count: ≥17 primitive + ≥2 module scenarios (≥19 total; P2-KD-J adds 3 nuclear-hexagram-computer scenarios).

**AC-2 — All Phase-2 goal evidence files present:**
```bash
ls docs/handoffs/TASK_P2-KD-D-g4-evidence.md \
   docs/handoffs/TASK_P2-KD-H-g5-evidence.md \
   docs/handoffs/TASK_P2-KD-K-g8-evidence.md \
   docs/handoffs/TASK_P2-KD-N-g10-g11.md
```
All 4 files exist. G3 evidence: composition root clean per P2-KD-I ACs 1-3 handoff.
G6 evidence: P2-KD-J dashboard finalization handoff. G9 evidence: PO decision doc from P2-KD-L.

**AC-3 — G12 streak carry-forward (EARNED-PENDING re-confirmed):**
QA re-verifies: the 3 Phase-1 streak tasks (P1-B1, P1-B2, P1-B3) each have sandbox-green evidence
in their Phase-1 handoff docs. Every Phase-2 dev task that produces sandbox-runnable artefacts
(P2-KD-B, P2-KD-F, P2-KD-G, P2-KD-I, P2-KD-J, P2-KD-N) has sandbox-green evidence pasted to
its handoff. G12 streak = EARNED-PENDING (continuous, no task skipped the DoD gate).
Records `g12_streak_carryforward: CONFIRMED` in close-gate doc.

**AC-4 — Pre-revert tags all present and correctly ordered:**
```bash
git log --oneline kinh-dich-pre-ci kinh-dich-pre-delete kinh-dich-pre-inject 2>/dev/null
```
All three tags resolve (no "unknown revision" error). Tag ancestry order must be:
`kinh-dich-pre-ci` ≤ `kinh-dich-pre-delete` ≤ `kinh-dich-pre-inject` (each tags a commit
no newer than the next in sequence).

**AC-5 — ESLint fence still active and clean:**
```bash
cd apps/kinh-dich-service && bunx eslint src/ --max-warnings 0
```
Exits 0. Records `eslint_fence_clean: YES` in close-gate doc.

**AC-6 — Frozen anchor INTACT and SSOT not mutated:**
```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```
Non-empty output (anchor is still a proper ancestor of HEAD).
```bash
jq '{phase,goalsEarned,decisionMatrix}' docs/data/pilot-status-kinh-dich.json
```
`goalsEarned` must still be 0 (no goals flipped by any Phase-2 task). `decisionMatrix.speed`,
`.trust`, `.scale` must all be `"TBD"`. §4.5 untouched.

**AC-7 — SI-2 boundary held throughout Phase 2:**
```bash
git log --oneline docs/dashboards/index.html | grep -v "stock-price\|P2-I"
```
Must return empty (no kinh-dich commits touched the fleet index; only stock-price's P2-I commit
is in the log for that file).

**Signal:**
QA emits `docs/signals/qa-kd-phase2-close-gate-<UTC>.json` with fields:
```json
{
  "pilot": "kinh-dich-service",
  "phase": "2",
  "gate": "CLOSE-GATE",
  "sandbox_all_green": true,
  "sandbox_scenario_count": "≥17 primitive + ≥2 module",
  "goals_evidence_complete": ["G3","G4","G5","G6","G8","G9","G10","G11"],
  "g1_evidence": "P2-KD-J (nuclear-hexagram-computer 5th primitive + 3 scenarios)",
  "g12_streak_carryforward": "CONFIRMED",
  "pre_revert_tags": ["kinh-dich-pre-ci","kinh-dich-pre-delete","kinh-dich-pre-inject"],
  "eslint_fence_clean": true,
  "anchor_intact": true,
  "ssot_not_mutated": true,
  "goals_earned": 0,
  "decision_matrix": "TBD",
  "si2_boundary_held": true,
  "next_actor": "pm",
  "next_action": "transition pilot-status-kinh-dich.json phase2=CLOSED, notify PO for Phase-3 atomic close"
}
```

**G-goal posture:** NO goal flips in P2-KD-Z. The close-gate signal authorizes PM to transition
the SSOT phase field. PO then executes the 12/12 terminal atomic close (Phase 3) at their cadence.

---

## Goal Coverage Matrix

| G-goal | Phase-1 status | Phase-2 task(s) | Phase-2 evidence location |
|--------|---------------|-----------------|--------------------------|
| G1 | EARNED-PENDING (4 primitives) | P2-KD-J (5th primitive: nuclear-hexagram-computer) | P2-KD-J handoff + P2-KD-Z AC-1 re-confirm |
| G2 | EARNED-PENDING | (no new task — carry-forward) | P1-C + P2-KD-Z AC-1 re-confirm |
| G3 | STILL-UNMET | P2-KD-I | TASK_P2-KD-I handoff + P2-KD-Z AC-2 |
| G4 | STILL-UNMET | P2-KD-A, P2-KD-B, P2-KD-C, P2-KD-D | TASK_P2-KD-D-g4-evidence.md |
| G5 | STILL-UNMET | P2-KD-E, P2-KD-F, P2-KD-G, P2-KD-H | TASK_P2-KD-H-g5-evidence.md |
| G6 | EARNED-PENDING | P2-KD-J (finalization only — genesis was P1-D) | TASK_P2-KD-J handoff + P2-KD-Z AC-2 |
| G7 | EARNED-PENDING | (no task — carry-forward; env audit confirmed in P1-E) | P1-E AC-3/AC-4 + P2-KD-Z re-confirm |
| G8 | STILL-UNMET | P2-KD-K (deliberate-break proof via bun sandbox) | TASK_P2-KD-K-g8-evidence.md |
| G9 | STILL-UNMET | P2-KD-L (PO Playwright Path B) | docs/po-decisions/<date>-g9-kinh-dich-user-confirmation.md |
| G10 | STILL-UNMET | P2-KD-M, P2-KD-N | TASK_P2-KD-N-g10-g11.md |
| G11 | STILL-UNMET | P2-KD-N | TASK_P2-KD-N-g10-g11.md |
| G12 | EARNED-PENDING | (DoD gate re-applied on each dev task) | P2-KD-Z AC-3 streak carry-forward |

**No goal flips are authorized by any task in this table. 12/12 terminal is a Phase-3 PO-only event.**

---

## Phase 2 Exit Criteria (for QA close-gate P2-KD-Z)

| # | Criterion | Measurement | PASS threshold |
|---|---|---|---|
| 1 | Sandbox all-green | `bun run src/sandbox/runner.ts --tier=all --scenario=all` exit code | 0 (≥17 primitive + ≥2 module scenarios) |
| 2 | G4 evidence complete | AC-4a (`bunx eslint` clean) + AC-4b (violation proof + revert) + AC-4c (freeze anchor) | All 3 present in TASK_P2-KD-D |
| 3 | G5 chain complete | G5a `_deprecated/` + G5b zero-domain-imports + G5b HTTP client present + G5c zero-TODO-migrat | All present in TASK_P2-KD-H |
| 4 | G3 composition root clean | wc -l ≤80, zero domain-op grep, OpenAPI exists | All 3 in TASK_P2-KD-I handoff |
| 5 | G6 dashboard finalized | 5 primitive cards + module card + microservice card + OpenAPI link + deprecated notice | TASK_P2-KD-J handoff |
| 6 | G8 honest-red proven | bun sandbox RED on corrupted + GREEN on revert | TASK_P2-KD-K-g8-evidence.md |
| 7 | G9 PO Playwright | ZERO console errors, all cards rendered | docs/po-decisions from P2-KD-L |
| 8 | G10 ≤2 cycles | dev-kinh-dich fixed injected bug in ≤2 dispatches | cycle_count ≤ 2 in TASK_P2-KD-N |
| 9 | G11 2-trial proof | Both trials show outcome-(a) coupling | g11_verdict=PASS in TASK_P2-KD-N |
| 10 | G12 streak carry | All Phase-2 dev tasks have sandbox-green evidence | g12_streak_carryforward=CONFIRMED |
| 11 | ESLint fence clean | `bunx eslint src/ --max-warnings 0` exits 0 | 0 warnings, 0 errors |
| 12 | Anchor INTACT | debba8ea is ancestor of HEAD | git merge-base check non-empty |

**All 12 criteria PASS → PM transitions SSOT phase2=CLOSED → PO executes Phase-3 atomic close.**

---

## Tag Creation Order (Summary)

```
kinh-dich-pre-ci     → created in P2-KD-A, Step 0 (before eslint.config.mjs)
kinh-dich-pre-delete → created in P2-KD-E, Step 0 (before git mv to _deprecated/)
kinh-dich-pre-inject → created in P2-KD-M, Step 0 (before G10 bug injection commit)
```

All three tags must be ancestor-ordered: `pre-ci` ≤ `pre-delete` ≤ `pre-inject`. Verified in P2-KD-Z AC-4.

---

## WIP Policy

**WIP=1 sequential.** PM dispatches ONE task at a time. dev-kinh-dich works through P2-KD-A → P2-KD-Z
in the order above. No parallel dispatches within Phase 2.

**Rationale:** Pre-revert tags (P2-KD-A, P2-KD-E, P2-KD-M) require that previous work is cleanly
committed before the tag is created. Running tasks in parallel would break the tag sequence discipline.

**Fleet concurrency note:** `dev-stock-price` may be concurrently active in `apps/stock-price/`.
Both pilots share the same git repository. If `dev-kinh-dich` encounters a `.git/index.lock` error:
verify no git process is running across both fleet zones, wait 4s, retry.
NEVER blindly delete the lock — confirm it is orphaned first.

**INTERIM FLEET-WIDE SINGLE-COMMITTER SERIALIZATION:** Active per PO authorization signal.
Before EVERY `git add <path>`: run `git diff --cached --name-only` to confirm the staging area is
empty. If a FOREIGN path appears (any file outside `apps/kinh-dich-service/`, `docs/handoffs/TASK_P2-KD-*.md`,
or `docs/signals/`), STOP — do NOT stage, do NOT reset HEAD on the foreign path, wait for the other
committer to complete and clear the index.

---

## Open Questions (for PM)

**OQ-1 — G5b parallel-copy deprecation scope:**
After the 6 MCP tools are rewired in P2-KD-G, the files in `apps/mcp-server/src/domain/services/kinhDich/`
become dead code. PM decides at P2-KD-G time whether to: (a) move them to `apps/mcp-server/src/domain/services/kinhDich/_deprecated/`
with a deprecation comment, or (b) leave them in place (they cause no runtime harm but are dead).
Architect recommendation: move to `_deprecated/` subfolder in the same P2-KD-G commit for cleanliness.
This is included in G5c scope.

**OQ-2 — Hexagram library data extraction strategy (for P2-KD-F):**
When `domain/services.ts` is moved to `_deprecated/`, the embedded hexagram library data (`QUE_META`,
`QUE_DATA`, `TRIGRAM_LINES`) must be accessible to the remaining module and primitives. Two options:
(a) Extract to `src/domain/hexagram-data.ts` (a shared constants file — cleanest long-term).
(b) Embed directly in each consuming primitive (no shared file — slightly redundant but contained).
Dev-kinh-dich decides at P2-KD-F time and documents the decision in the handoff.

**OQ-3 — G11 Trial-2 injection: commit vs local-only:**
The Trial-2 mutation in P2-KD-N can be local-only (never committed) or committed-then-reverted.
QA decides at task time. Either is acceptable per the grading rubric as long as git is clean
at P2-KD-N DONE and the coupling proof is documented.

**OQ-4 — G5b score-helper boundary (for P2-KD-G):**
`computeHaoScores`, `computeSentimentScore`, `computeFundamentalsScore` in `kinhDichTools.ts` query
mcp-server's own SQLite and are NOT kinh-dich domain. These STAY in mcp-server. The design after G5b:
mcp-server computes 6 scores locally, then POSTs them to `http://kinh-dich-service:5005/reading/{code}`.
Dev-kinh-dich must NOT migrate the score helpers to kinh-dich-service — AC-8 enforces this.

**OQ-5 — Nuclear-hexagram-computer Fence-A cross-primitive import:**
`nuclear-hexagram-computer` imports `resolveHexagram` from `hexagram-resolver` and `HaoReading`
from `hao-encoder`. Primitive-to-primitive imports are NOT fenced (Fence-A only bars primitive → module/
application/interface/infrastructure). Dev-kinh-dich must confirm the `eslint.config.mjs` rules
do NOT block this cross-primitive import — the charter template's Fence-A rule only disallows
`["module", "application", "interface", "infrastructure"]`, not `["primitive"]`. AC-2 in P2-KD-J
verifies this empirically.
