---
sprint: SYSTEMIC-REMAKE-P1
branch: task/P1-IDLE-AUDITOR-NOTEBOOK-GATE
size: S
zone: docs/agents/system-auditor/
depends_on: []
blocks: []
---

## TL;DR
Gate notebook append in system-auditor/flow/main.md on "did cycle produce ≥1 new finding/signal/state-change". An all-green cycle with zero findings must emit zero notebook diff, so the existing `scripts/auditor-notebook-commit.sh` SKIP on no-staged-changes (L196-197) will have something to trigger on.

## [PM] Planning Context

**Zone:** docs/agents/system-auditor/

**Target:** `docs/agents/system-auditor/flow/main.md` lines 74-76 + lines 685-716 (notebook write sections)

**Mechanism:** Gate the notebook append itself on "did this cycle produce ≥1 new finding/signal/state-change" — a genuinely ALL_GREEN cycle must emit ZERO notebook diff, so the existing `scripts/auditor-notebook-commit.sh`'s SKIP no-staged-changes logic (L196-197) actually has something to trigger on.

**Files to read first:**
- `docs/agents/system-auditor/flow/main.md` lines 74-76 and 685-716 (notebook append locations)
- `scripts/auditor-notebook-commit.sh` lines 196-197 (the skip logic that should be gated)

**Files to modify:**
- `docs/agents/system-auditor/flow/main.md` — Add conditional gate around notebook append operations

**Files to create:**
- None

**Dependencies:** None

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `docs/agents/system-auditor/init.md`

**Acceptance Criteria (machine-checkable):**

1. Synthetic all-green cycle with zero findings, zero signals, zero state changes → notebook receives zero appends (git diff shows no changes to docs/agent-memory/notebooks/system-auditor.md)
2. Normal cycle with ≥1 finding → notebook append proceeds as before
3. Empirical: git log --since="7 days ago" --grep="chore(memory/system-auditor)" commit count trends down on days where orch-state.json task_board was empty at tick time

