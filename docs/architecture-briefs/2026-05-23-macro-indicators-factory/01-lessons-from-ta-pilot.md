---
title: "Lessons from technical-analysis pilot — propagated to macro-indicators factory v2"
date: "2026-05-23"
author: "po (cycle-29)"
parent_pilot: "technical-analysis"
parent_pilot_close: "2026-05-23T09:19:10Z"
parent_pilot_verdict: "scale"
parent_pilot_status: "docs/data/pilot-status.json (FROZEN historical record)"
parent_pilot_closure_signal: "docs/signals/po-brief-closed-20260523T091910Z.json"
---

# Lessons from technical-analysis pilot

The TA pilot closed 2026-05-23T09:19:10Z with 12/12 G-goals YES and decisionMatrix verdict=`scale`. During the 28 PO cycles (c282 cycle-1 → cycle-28), seven distinct lessons surfaced that MUST propagate to the macro-indicators factory v2 to avoid replaying the same pain.

Each lesson below states:
- **What happened on TA**
- **Cost to TA pilot**
- **How macro-charter v2 prevents the recurrence**

---

## L1 — Language pivot mid-Phase-1 cost 6 commits + 3-4 days

**What happened on TA:** Phase 1 launched in TypeScript per 2026-05-14 Go-migration brief §7 (TA categorized TS-stay). Six TS commits landed before user issued verbatim verdict "B" on 2026-05-22 evaluation brief — selecting Option B (full Go rewrite) over Option C (finish TS, defer Go). All six TS commits reverted (`16a04a00`, `a22acdf3`, `3f522dc3`, `241631af`, `20ed83d5`, `6248f3da`) via `docs/handoffs/TASK_pivot-B-revert.md`.

**Cost to TA pilot:** 1 sprint absorbed by revert + Go scaffold restart. Charter `phase1.pivotEvent` block in `pilot-status.json` records the full revert hash list. Sunk-cost ledger in `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md` lists all 6 reverted files with mechanical revert actions.

**Charter v2 fix:** Charter §Language Lock at v1 locks macro-indicators to Go from Day 0. Authority: same user verdict 2026-05-22 §Q2 explicitly generalizes ("Macro-indicators stays in Go scope. Go is now the implementation language for that fractal as well — no separate brief required, this decision generalizes."). The pivot risk is zero because the language is locked by carry-over user verdict at charter creation, not Phase 1 mid-flight.

---

## L2 — Whole-project CI as G4 evidence surface was noisy and forced Amendment 1

**What happened on TA:** Original G4 charter spec required "CI fails on violation (proven by 1 deliberate violation in PR)". When TA pilot tried to evidence G4, the whole-project CI was dominated by 283 pre-existing TS test failures unrelated to the pilot (mcp-server TypeScript tests with known-failing modules). The "CI green" signal became unusable — CI was perpetually red for reasons orthogonal to the pilot's fence-rule correctness.

**Cost to TA pilot:** Architect Amendment 1 (`docs/signals/architect-g4-ac4c-amendment-20260523T083000Z.json`, commit `10aceb0c`) had to scope G4 down to "offline `.golangci.yml` config freeze + deliberate-violation depguard evidence on the pilot service zone only". PO cycle-19 + cycle-23 + cycle-24 spent 3 cycles renegotiating G4 acceptance criteria. The `.golangci.yml` freeze anchor `9d364329` held throughout, but the AC surface had to be rewritten mid-pilot.

**Charter v2 fix:** Charter §G4 specifies offline depguard evidence as the primary acceptance path AND pilot-zone-scoped CI as the secondary path. Both AC surfaces are listed at v1. No Amendment expected. The freeze-anchor discipline is documented in §Constraints (binding from Day 0).

---

## L3 — `PHASE-2` operational status label was charter-invalid; closure-checklist had to be patched

**What happened on TA:** Closure-checklist v1 allowed `pilot-status.json.status = "PHASE-2"` as an operational label when G9 async user reply was outstanding. Architect audit (Q5 of `docs/architecture-briefs/2026-05-22-refactor/closure-checklist-audit.md`) flagged this as a **NO — contract weakening detected**: parent charter §Status Tracking defines only `ACTIVE | DONE | FAILED` as valid top-level status values. `PHASE-2` allowed silent escape from the state machine — if G9 stayed unresolved past sprint-6 hard deadline, no automated/procedural trigger forced PO to call the decision matrix.

**Cost to TA pilot:** Closure-checklist §1 had to be patched mid-pilot to remove `PHASE-2` and replace with `ACTIVE + g9_pending: true` annotation, plus an explicit auto-FAILED trigger at hard deadline pass.

**Charter v2 fix:** Charter §Hard Deadline + §Status Tracking explicitly state at v1: status enum is strictly `ACTIVE | DONE | FAILED`, no operational labels valid as terminal values. Auto-FAILED + matrix-call trigger documented Day 0. Closure checklist for macro-indicators (PO will author at Phase 2 close) inherits this rule by reference.

---

## L4 — decisionMatrix authorship was undefined; could be set by wrong agent

**What happened on TA:** Charter v1 §Decision Matrix said "PO is the decision owner" but the closure checklist's §3 Final Commit sequence wrote matrix values without naming the authority. Architect audit Q6 flagged this as **NO — decision authorship undefined**: no enforcement that PO (not BA, architect, developer, QA, ops, agent-father) populates the matrix; no atomic-with-12/12-terminal timing rule.

**Cost to TA pilot:** Closure checklist §4.5 "Decision Matrix Authorship Rule" was retrofitted mid-pilot (commit `62edbf3d` cycle anchor) to specify: PO-only authorship, matrix populates ONLY after 12/12 terminal grade, atomic with last G-goal flip + verdict signature in same commit, commit hash recorded inline in `closure.goalGrades`. PO cycle-28 atomic close adhered to this rule mechanically.

**Charter v2 fix:** Charter §Constraints + §Status Tracking embed the §4.5 rule as a Day-0 binding constraint. SSOT (`pilot-status-macro-indicators.json`) created at charter creation with all 12 goals = TBD + decisionMatrix all TBD. PO writes the matrix in a single atomic commit at brief close, mechanically applying charter §Decision Matrix rubric. No retrofit possible.

---

## L5 — Pre-revert tags missing for CI activation and bug injection; only `pre-delete` was tagged Day 0

**What happened on TA:** Closure-checklist §5 rollback plan named `p2-b-pre-delete` (created in P2-B0 pre-step) as the rollback snapshot for G5 deletion. Architect audit Q7 flagged TWO other phase-2 mutation sequences with rollback risk:
- **Gap 1:** Before P2-A2 CI job lands — fence linter false positives would block all subsequent pushes; reverting required `git log` archaeology without a pre-tag.
- **Gap 2:** Before P2-D2 bug injection — if injected bug corrupted more than target, revert required `git log` archaeology.

**Cost to TA pilot:** Two pre-revert tags (`p2-a2-pre-ci`, `p2-d2-pre-inject`) had to be added as post-hoc recommendations to handoff files mid-pilot. P2-A2 was already in-flight, so ops had to tag the pre-A2 commit retroactively.

**Charter v2 fix:** Macro-charter §G4 + §G5 + §G10 explicitly require pre-* tags from Day 0 in handoff specs:
- `macro-pre-delete` — before G5 `git mv` to `_deprecated/`
- `macro-pre-ci` — before G4 CI job activation in `.github/workflows/ci.yml`
- `macro-pre-inject` — before G10 bug injection commit

All three tags are mandated at charter v1 in the relevant G-goal sections. Phase 0 task plan (architect Phase 0 deliverable) will reference these tag-creation pre-steps in each handoff.

---

## L6 — Synchronous user verbal confirm blocked G9 for cycles 15-18; PO Playwright was the unblock

**What happened on TA:** Original G9 spec required user verbal YES at pilot review meeting. The TA pilot reached 11/12 terminal grade by cycle-14 with only G9 pending. Cycles 15-18 (4 cycles) were spent waiting for user to schedule the review meeting (user is non-technical, located in France monitoring VN market, async-only availability).

**Cost to TA pilot:** ~4 cycles of inflight wait time. Resolved cycle-19 (2026-05-23T06:34:55Z) when user issued directive "i thing i no need check, but you can check it apps/technical-analysis/dashboard/index.html, use chromium for check result" — delegating verification to PO. PO ran Playwright + chromium-headless-shell v1223 against `file://`, captured ZERO console errors / pageerrors / requestfailed, all 25 primitives + 5 modules rendered, NOT-RUN status honest. Verdict PASS. G9 flipped YES cycle-19 atomic. Decision recorded in `docs/po-decisions/2026-05-23-g9-user-confirmation.md`.

**Charter v2 fix:** Macro-charter §G9 lists Path B (PO Playwright short-circuit) as Day-0 default with equal weight to Path A (synchronous user verbal). PO does not wait synchronously for user reply — if user is unavailable at pilot review, PO runs Playwright headless verification immediately and records VERDICT PASS / FAIL in decision doc. Either path satisfies G9 per cycle-19 precedent.

---

## L7 — SSOT discipline, L84 staging, anchor-hold, no-force/no-push were retroactively enforced mid-pilot

**What happened on TA:** Early cycles produced version-numbered signal files (`closure-ready-awaiting-user v1` + `v2`) that went stale fast. Multiple shadow dispatches per task existed (mostly tolerated then cleaned cycle-19). `git add -A` was discouraged but not formally banned until L84 lesson was promoted cycle-18. Multi-file commits without explicit-file staging happened in early cycles.

**Cost to TA pilot:** Cycle-19 cleanup policy was a one-time retroactive enforcement: deleted obsolete signal versions via `git rm`, established "SSOT-only mutation" rule going forward (pilot-status.json + po.md notebook are the live SSOT; no version-numbered signal proliferation). All subsequent cycles 20-28 adhered to L84 explicit-file staging + no force/no push/local-only commits + anchor-hold discipline.

**Charter v2 fix:** Macro-charter §Constraints binds these rules from Day 0:
- L84 explicit-file staging: `git add <path>` per file. NEVER `-A` or `.`.
- No `--force`, no `--no-verify`, no `--no-gpg-sign`.
- No `git push` of source/CI changes (local-only).
- SSOT: one active dispatch per task. No shadow signals.
- Anchor discipline: once frozen, no retag/rewrite/push.
- Notebook + signal hygiene per cycle-19 naming contract.

These were retroactively-discovered on TA. They are Day-0 binding on macro.

---

## Summary

Seven lessons. Seven Day-0 fixes baked into charter v2. Zero expected Amendments at v1.

**Lessons NOT propagated** (TA-specific, not generalizable):
- `phase1.pivotEvent` block in pilot-status.json — TA-specific revert metadata; no equivalent needed on macro since no pivot is possible (L1 fix).
- `qa P2-B4` 501-stub design-state interpretation — TA-specific to the Go service deferring `/ta/indicators` handler implementation; macro's equivalent (501-stub on a macro endpoint) would be re-evaluated per-endpoint if it occurs.
- 4-cycle async-user wait carrying-over — L6 fix means this doesn't happen on macro.

If any lesson surfaces during macro pilot that was NOT in this list, PO appends to this doc + flags in notebook + propagates to factory v3 (next pilot) charter.
