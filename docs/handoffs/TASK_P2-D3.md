---
task_id: P2-D3
title: "Investigate and resolve failing dashboard scenarios (technical-analysis pilot)"
phase: "2"
pilot: "technical-analysis"
owner: "dev-technical-analysis"
goals: ["G10", "G12"]
status: "PENDING"
gate: P2-D3
anchor: "62edbf3d"
estimate_hours: 1.0
ac_count: 6
---

# P2-D3 — Investigate and resolve failing dashboard scenarios

**Goal:** G10 (AI-fixability proof — ≤2 cycles), G12 (Dashboard-green DoD enforced)

**Description:**
The sandbox dashboard reports a regression in the `technical-analysis` pilot. Several primitive scenarios have flipped RED while one canary remains GREEN. The cross-primitive scenarios are all GREEN — the regression is isolated to a single primitive surface. Diagnose the root cause from the dashboard signal and sandbox output. Apply a minimal, surgical fix. Mark the task DONE only when every scenario on the dashboard is GREEN.

---

## Observable Behaviour (Acceptance Criteria)

1. **AC-1 — Single scope of investigation.** You receive only what the dashboard shows: a list of failing scenario names and the first numeric divergence on one failing scenario. No file pointer, no prior-task hint, no bug-class label. Start the investigation by running the sandbox locally.

2. **AC-2 — Dashboard-driven diagnosis.** You must read the failing scenario JSON fixtures (`docs/scenarios/technical-analysis/primitive/<scenario>.json`) and the production source under `apps/technical-analysis/pkg/primitive/...` to reproduce the divergence and form a root-cause hypothesis. The hypothesis must explain why exactly one primitive's value-paths flip RED while its error-path canary and every other primitive stay GREEN.

3. **AC-3 — ≤2 cycles to all-GREEN.** Each commit that does not end with every dashboard scenario GREEN counts as one cycle. Two cycles maximum. Cycle 3 (or later) = G10 FAIL.

4. **AC-4 — Sandbox proof in the handoff.** Before writing your RETURN block, append a `§Verification` section to this handoff containing the exact output of:
   ```
   cd apps/technical-analysis && go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all
   cd apps/technical-analysis && go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all
   ```
   Both invocations must exit 0 with every scenario GREEN. Paste the pass/fail summary lines verbatim. This is the G12 DoD enforcement step.

5. **AC-5 — Surgical diff.** Touch only the file(s) needed for the fix. No refactors, no renames, no rewriting of unaffected helpers. The diff must be reviewable in under one minute.

6. **AC-6 — Atomic commit.** Single commit per cycle. Conventional-Commits format: `fix(technical-analysis): P2-D3 — <one-line description> — G10 cycle <N> of ≤2`. Anchor `62edbf3d` in the body. Stage explicit files only (no `git add .`, no broad glob — L84).

---

## Dashboard Signal You Receive

```
Primitive: technical-analysis
  Failing scenarios (4):
    - rsi-golden                  RED
    - rsi-overbought-pullback     RED
    - rsi-oversold-bounce         RED
    - rsi-mid-range               RED
  Passing scenarios (1):
    - rsi-insufficient-data       GREEN
  Cross-primitive (20):
    - bb-*, macd-*, ma-*, cross-* ALL GREEN

First numeric divergence (rsi-golden):
  rsi[4]: got 56.181151, want 54.567700 (tol 1)
```

That is the entire signal you start from. No further hint is provided.

---

## Sandbox Commands

```bash
cd apps/technical-analysis

# Reproduce the RED signal:
go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all

# After your fix, both must be all-GREEN:
go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all
go run ./cmd/sandbox -tier=module    -module=technical-analysis -scenario=all
```

Single-scenario debugging (use freely while iterating):

```bash
cd apps/technical-analysis
go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=rsi/rsi-golden.json
```

---

## What "Done" Looks Like

- `go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all` exits 0, every card GREEN.
- `go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all` exits 0, every card GREEN.
- `go test ./...` from `apps/technical-analysis/` exits 0.
- Exactly one commit per cycle, ≤2 cycles total. Subject + body follow the format in AC-6.
- `§Verification` section appended to this handoff with the verbatim sandbox output, BEFORE you write the RETURN block.

---

## Forbidden Inputs (no-cheat clause)

You may NOT consult any of:

- Pre-existing internal specs under `docs/architecture-briefs/2026-05-22-refactor/p2-d-*.md`
- Prior task handoffs `TASK_P2-D0.md`, `TASK_P2-D1.md`, `TASK_P2-D2.md`
- Any commit SHA from the last 24 hours' git log
- Any prior-task chat scrollback, signal file under `docs/signals/qa-P2-D2-*`, or `pilot-status.json` evidence narrative

The intent of this task is to prove that an AI agent can fix a primitive bug from the dashboard signal alone, in ≤2 cycles. Reading the bug spec defeats the proof. QA will check the agent's command/file-read history during the G10 verification step (P2-D4).

You MAY consult:

- The source tree under `apps/technical-analysis/pkg/primitive/` and `apps/technical-analysis/pkg/module/`
- Scenario JSON fixtures under `docs/scenarios/technical-analysis/`
- Existing `_test.go` files alongside the production source
- Public documentation for any technical indicator you need to reason about (Wikipedia, original publications)
- The sandbox runner under `apps/technical-analysis/cmd/sandbox/`

---

## Atomic Commit Format

```
fix(technical-analysis): P2-D3 — <one-line description> — G10 cycle <N> of ≤2

<Short paragraph: what was wrong, what was fixed, why this is the minimal change.>

Sprint: phase-2
Task: P2-D3
Closure-Anchor: 62edbf3d
AC: sandbox primitive all-GREEN; sandbox module all-GREEN; verification block appended to TASK_P2-D3.md before RETURN.
```

---

## Dependencies

**Upstream:** A RED dashboard signal exists (the four `rsi-*` value-path scenarios above).
**Downstream:** P2-E2 (regression scenario design — needs the fix pattern observed here).

---

## Cycle Log (you fill this in)

| Cycle | Commit | Result | Notes |
|---|---|---|---|
| 1 | TBD | TBD | |
| 2 | TBD | TBD | (only if cycle 1 was RED) |
