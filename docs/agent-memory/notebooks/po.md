# PO Notebook

_Last: 2026-06-29T19:02Z_

## This cycle — RECURRING-BUG-ESCALATION: notebook self-cap (DEDUP, no new task)

QA raised recurring-bug-escalation during FIX-CMH-NOTEBOOK-WRITE-SELFCAP-200L gate (PASSED, commit 80dc0e18). 2 point-patches in 2 days, same root (qa 57916170 06-28; cmh 80dc0e18 06-29) → memory rule "2+ same-module → escalate to DESIGN, not a 3rd patch" tripped.

**DECISION = SINGLE SYSTEMIC SWEEP, dedup'd into existing anchor — NO new task minted.**
The board already carried `HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING` (backlog, P2) whose `dedup_anchor_for` is exactly "recurring-agent-notebook-200L-breach". Minting a parallel sweep = SSOT dup. Instead PROMOTED + EXTENDED it.

**RAW-verified the two diagnoses are COMPLEMENTARY (both halves needed):**
- MEMBERSHIP gap (router): pm(283L ACTIVE), fixer, tran-ngoc-bau, code-janitor, ba, agent-father, alert-commander, architect are NOT in SKILL.md AC-6 APPEND list.
- ENFORCEMENT gap (existing task): dev-pdf-extractor IS registered yet breached 203L → AC-5 is advisory prose, so even registered agents ship over-cap.

**Extended sweep_scope (4 parts):** (1) AUDIT all notebook writers; (2) BATCH-REGISTER unregistered into class across BOTH SSOTs in ONE change; (3) AC-5 advisory→BLOCKING + headless PostToolUse hook backstop (auto drop-oldest ≤200L even if a flow forgot — auto-caps pm.md 283L on next write, so NO separate prune, NO per-agent point-patch); (4) GUARD/fence: fail loud if any notebook-writing flow is in NEITHER class. recurrence_count→8.

**Routed through architect (design pass) FIRST** — architect is policy owner of file-size-caps.json; cascade architect→agent-father(impl)→qa.

**Board delta:** HARDEN backlog→ready (P2→P1, next_agent=architect); head idle→in_progress(architect, active=HARDEN). PIPELINE: 1 dispatch pending (architect).

---
## Carry-over
- FIX-CMH-NOTEBOOK-WRITE-SELFCAP-200L DONE 80dc0e18 (the 2nd point-patch that tripped this escalation).
- FIX-DRAIN-SIGNALS-DEDUP-PRUNE-STRCOMPARE + FIX-COORD-WAL-CHECKPOINT (06-28 BATCH) — router-tracked.
