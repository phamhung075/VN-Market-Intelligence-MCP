---
task_id: P2-D1
task_name: "Bug Injection Pre-Tag + Deliberate Bug Injection (G10 setup)"
pilot: macro-indicators
phase: 2
owner: qa
cycle: cycle-54
estimate_hours: 0.3
wip_position: "1 of 1"
ac_count: 3
blockedBy: P2-F1
unblocks: P2-D2
goal_path: G10 (AI agent fixes bug within ≤2 cycles)
charter_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md §G10"
task_plan_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md §P2-D1"
anchor: "1776df8e (must remain ancestor pre + post commit)"
---

# TASK P2-D1 — Bug Injection Pre-Tag + Deliberate Bug Injection

**Pilot:** macro-indicators (factory pilot)
**Phase:** 2 (remaining goals: G9, G10, G11, G12)
**Owner:** qa
**Cycle:** cycle-54
**Blocked by:** P2-F1 DONE (G8 honest-red proven — safe to inject deliberate failures)
**Unblocks:** P2-D2 (dev fixes bug within ≤2 cycles for G10 proof)

---

## Context

G10 requires proof that the AI agent (dev-macro-indicators) can diagnose and fix a real bug without looping. The TA pilot established a pattern:
1. QA injects a deliberate bug (wrong threshold / off-by-one / formula error)
2. Dashboard shows RED for the affected primitive
3. Dev agent is dispatched to fix it
4. Cycle counting: from injection-done to fix-done must be ≤2 cycles (per baseline 1.3 from docs/data/bug-inventory.json)

This task (P2-D1) is the **injection setup** phase: create pre-revert tag, inject the bug, verify dashboard RED, verify sandbox fails.

**Next task (P2-D2):** Dev fixes the bug (dispatched after P2-D1 completion signal).

---

## Acceptance Criteria

### AC-1: Pre-Revert Tag Created

**Mandatory step before ANY file modification:**

```bash
git tag macro-pre-inject HEAD
git log --oneline macro-pre-inject | head -1
# Output: <commit-sha> (should be 1200fa18, the rerun PO commit)
```

Confirm the tag is on the correct parent commit (the commit before injection happens).

**Evidence to record:** `git tag -l macro-pre-inject && git log -1 macro-pre-inject --oneline`

---

### AC-2: Deliberate Bug Injection — Carry Trade Threshold

**Target file:** `apps/macro-indicators/pkg/primitive/macro_carry_trade_signal/macro_carry_trade_signal.go`

**Injection specification (variant: wrong threshold):**

1. Locate the carry trade spread calculation (the function that returns `HOT_MONEY_INFLOW` regime vs `NEUTRAL`).
2. Change the threshold comparison from `> 2.5` to `> 5.0` (or equivalent: divide the computed spread by 2 before comparison, or multiply the threshold by 2).
3. This ensures that realistic inputs (e.g., spread = 3.2) will no longer trigger the `HOT_MONEY_INFLOW` regime — golden scenario expects `HOT_MONEY_INFLOW` but function returns `NEUTRAL`.

**Verify the injection breaks the scenario:**

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/macro-indicators
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=macro-carry-trade-signal-golden
```

Expected output: `total=1 pass=0 fail=1 status=FAIL` (exit non-zero).

**Test dashboard RED (manual, offline):**

1. Open `apps/macro-indicators/dashboard/index.html` in a text editor.
2. Scroll to `PRIMITIVES_DATA` (line ~928).
3. Locate the `macro-carry-trade-signal-golden` entry.
4. Paste the golden scenario JSON into the dashboard's text area (simulating user action).
5. Open the dashboard in browser — macro-carry-trade-signal card must show RED (or FAIL status).
6. Capture a screenshot or paste a description of the RED state into this handoff doc.

**Evidence to record:**
- Sandbox exit code: non-zero
- Sandbox output: paste `total=1 pass=0 fail=1 status=FAIL` or equivalent
- Dashboard state: describe RED/FAIL rendering (or paste screenshot path)

---

### AC-3: Injection Commit Created (Never Reverted Pre-Signal)

**Create injection commit (do NOT revert before this handoff signal):**

```bash
# After edits are staged:
git add apps/macro-indicators/pkg/primitive/macro_carry_trade_signal/macro_carry_trade_signal.go
git commit -m "test(macro-indicators): P2-D1 — deliberate bug injection for G10 AI-fixability proof"
```

**Verify commit chain:**

```bash
git log --oneline -2
# Output should show:
# <new-injection-sha> test(macro-indicators): P2-D1 — deliberate bug injection...
# <parent-pre-inject> chore(pm/cycle-54): close P2-C1 (po@1200fa18 RERUN YES)...
```

**Confirm pre-revert tag points to parent:**

```bash
git log --oneline macro-pre-inject | head -1
# Must show the commit BEFORE injection (parent of the injection commit)
```

**Evidence to record:**
- `git log --oneline -5` (show injection commit + parent + ancestry)
- `git merge-base --is-ancestor 1776df8e HEAD; echo $?` (must be 0 — anchor held)

---

## Hard Gates (Binding Before Handoff Signal)

| Gate | Command | Expected | Status |
|------|---------|----------|--------|
| **Anchor** | `git merge-base --is-ancestor 1776df8e HEAD; echo $?` | 0 | MUST PASS |
| **Pre-inject tag** | `git log --oneline macro-pre-inject \| head -1` | <parent-sha> | MUST PASS |
| **R-1 guard** | `grep -rE "math/rand\|rand.Intn" apps/macro-indicators/pkg/` | exit 1 | MUST PASS |
| **Sandbox FAIL** | `go run ./cmd/sandbox -tier=primitive -scenario=macro-carry-trade-signal-golden` | exit non-zero | MUST PASS |
| **G12 sandbox baseline** | `go run ./cmd/sandbox -tier=all -scenario=all` | total=20 pass=19 fail=1 (the injected failure) | MUST PASS (1 fail expected) |

---

## Out-of-Scope (Do NOT modify)

- `apps/technical-analysis/` (TA pilot FROZEN)
- `docs/scenarios/macro-indicators/` (scenario JSON files UNTOUCHED — injection is in .go code only)
- `docs/data/pilot-status-macro-indicators.json` (SSOT — PM/QA owned)
- Charter, task plan, or any architecture-brief files
- Dashboard index.html (manual testing only, no commits)

---

## Forbidden Outputs

- Do NOT commit the dashboard screenshot (keep offline or describe in handoff).
- Do NOT create new scenario JSON files (reuse existing golden scenario for testing).
- Do NOT revert the injection before signaling (P2-D2 will fix it).
- Do NOT use `--force`, `--no-verify`, `--no-gpg-sign`, or `git push`.

---

## Staging (L84 Explicit File Staging)

```bash
# Stage ONLY the injected source file:
git add apps/macro-indicators/pkg/primitive/macro_carry_trade_signal/macro_carry_trade_signal.go

# Verify no unintended files are staged:
git status --short
# Output should show only the modified .go file (line starts with 'M')
```

---

## Commit Pattern

**Subject:**
```
test(macro-indicators): P2-D1 — deliberate bug injection for G10 AI-fixability proof
```

**Body (terse, HEREDOC):**
```
AC-1: macro-pre-inject tag on parent commit.
AC-2: threshold changed > 2.5 → > 5.0 in macro_carry_trade_signal.go. Sandbox primitive-tier fail=1 exit non-zero. Dashboard RED verified.
AC-3: injection commit on top of pre-inject tag parent. Anchor 1776df8e held pre+post (exit 0).

G10 setup: bug injected. Next task P2-D2 dispatches dev-macro-indicators to fix within ≤2 cycles.
```

---

## Signal Filename Pattern

After commit, create:

```
docs/signals/qa-p2-d1-injection-ready-<UTC>.json
```

### Signal Schema

```json
{
  "type": "qa-completion",
  "from": "qa",
  "to": "pm",
  "cycle": "cycle-54",
  "task_id": "P2-D1",
  "status": "DONE",
  "verdict": "READY-FOR-DEV-FIX",
  "injected_bug": {
    "target": "apps/macro-indicators/pkg/primitive/macro_carry_trade_signal/macro_carry_trade_signal.go",
    "variant": "wrong threshold",
    "change": "carrySpread comparison > 2.5 → > 5.0",
    "affected_scenario": "macro-carry-trade-signal-golden.json"
  },
  "sandbox_evidence": {
    "primitive_tier_carry": "total=1 pass=0 fail=1 status=FAIL exit non-zero",
    "all_tier": "total=20 pass=19 fail=1 status=FAIL (1 expected injection failure)",
    "exit_code": 1
  },
  "dashboard_state": "macro-carry-trade-signal card RED",
  "pre_revert_tag": "macro-pre-inject",
  "hard_gates": {
    "anchor_1776df8e": "HELD (exit 0)",
    "r1_determinism": "PASS (exit 1)",
    "sandbox_broken_as_intended": "PASS (fail=1)"
  },
  "commit_sha": "<commit-sha-of-injection>",
  "next_task": "P2-D2 (dev-macro-indicators fixes bug within ≤2 cycles)",
  "timestamp": "<UTC now>"
}
```

---

## Pre-Flight Checklist

- [ ] Anchor 1776df8e held
- [ ] Pre-inject tag created on parent (before any edit)
- [ ] Injection made to macro_carry_trade_signal.go
- [ ] Sandbox primitive-tier shows fail=1 (exit non-zero)
- [ ] Dashboard manual test shows RED
- [ ] R-1 guard: no math/rand (exit 1)
- [ ] Injection commit created with proper subject
- [ ] L84 staging: only .go file staged
- [ ] No `--force`, no `--no-verify`, no push
- [ ] Signal created with all required fields
- [ ] All hard gates PASS

---

## Acceptance Thresholds (QA Grading)

| Criterion | Threshold | Evidence |
|-----------|-----------|----------|
| Pre-inject tag exists | ✓ on parent commit | `git tag -l macro-pre-inject` |
| Injection breaks sandbox | exit non-zero | `go run ./cmd/sandbox ... exit 1` |
| Dashboard RED proof | describe/screenshot | paste state description |
| Anchor held | exit 0 | `git merge-base --is-ancestor 1776df8e HEAD; echo $?` |
| R-1 clean | exit 1 (0 matches) | `grep -rE math/rand apps/macro-indicators/pkg/ exit 1` |
| Hard gates all PASS | 5/5 | see table above |

**QA verdict:** GREEN iff all 5 hard gates PASS + AC-1/2/3 satisfied.

---

## Example Evidence (Paste into Handoff Signal)

```
AC-1 Evidence:
$ git tag -l macro-pre-inject && git log -1 macro-pre-inject --oneline
macro-pre-inject
1200fa18 chore(po/cycle-53): P2-C1 RERUN Playwright...

AC-2 Evidence:
$ cd apps/macro-indicators && go run ./cmd/sandbox -tier=primitive -scenario=macro-carry-trade-signal-golden
...
total=1 pass=0 fail=1 status=FAIL

Dashboard: macro-carry-trade-signal card shows red/fail background (offline manual test).

AC-3 Evidence:
$ git log --oneline -2
aaaa111 test(macro-indicators): P2-D1 — deliberate bug injection
1200fa18 chore(po/cycle-53): P2-C1 RERUN...

$ git merge-base --is-ancestor 1776df8e HEAD; echo $?
0
```

---

## Notes for Next Agent (P2-D2 — Developer)

When dev-macro-indicators is dispatched for P2-D2 (bug fix):

1. Dashboard will show RED for macro-carry-trade-signal.
2. Sandbox will show fail=1 for the golden scenario.
3. Diagnosis: compare the buggy threshold (5.0) with the correct one (2.5).
4. Fix: restore the threshold.
5. Verify: sandbox all-tier 20/20, dashboard GREEN.
6. Cycle count: measure from this signal received to sandbox green = 1 cycle (G10 baseline = 1.3).

---

## Charter References

- **Charter §G10:** "AI agent fixes a primitive bug without looping (≤2 cycles)"
- **Task plan §P2-D1:** Bug injection setup with pre-revert tag protocol
- **Task plan §P2-D2:** Dev fixes injected bug within ≤2 cycles
- **TA pilot precedent:** Cycle-17, G10 proof pattern (TA cycle-25 + cycle-26 fix = 2 cycles PASS)

---

## Related Signals / Handoffs

- Previous: `docs/handoffs/TASK_P2-F1-macro.md` (G8 honest-red proof — completed)
- Next: `docs/handoffs/TASK_P2-D2-macro.md` (dev fix bug within ≤2 cycles)

---

## Revision History

| Date | Cycle | Author | Change |
|------|-------|--------|--------|
| 2026-05-23 | cycle-54 | pm | Initial handoff creation (PM dispatch) |

---

**End of Handoff**
