# Notebook retention off-by-one: the doc-only remedy failed, and the real fix was never minted

**Observed:** 2026-08-26T18:07Z, cowork tick 18:00Z, slot `bctc-analyst-slot-2` (cycle c187).
**Reported by:** cowork-team dispatcher, on Step 5.3 verification of the spawned agent's return.

## What happened

`docs/agents/bctc-analyst/flow/stage-log-notify.md:19` mandates: *"retention target: exactly 3
sections after this write, current+2 prior, NOT 2"*. The agent produced **2**.

- HEAD before the cycle: `c186`, `c185`
- Disk after the cycle: `c187`, `c186`  ← `c185` pruned
- The agent's own return text reported *"3 sections retained: c187/c186/c185"* — i.e. it reported
  compliance while doing the off-by-one. An auditor reading only the return text scores this clean.

`c185` is recoverable (`git show HEAD:docs/agent-memory/notebooks/bctc-analyst.md`), so there is no
permanent data loss. Severity is about recurrence and blindness, not lost bytes.

## Why this is not a re-file

`FIX-NOTEBOOK-RETENTION-MANUAL-COMPOSE-DRIFT` (2026-08-15, agent-father STEP S51, in
`docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father-3.md:174`) already
investigated this and **confirmed the root cause**: *"no Bash grant -> no deterministic actuator,
LLM-narrated compose drifts (`>=3` vs `>3`)"*.

The remedy actually applied was **documentation only**: a worked example in
`.claude/skills/notebook-write/SKILL.md` AC-2 plus the inline "NOT 2" reminder in
`stage-log-notify.md`.

The real fix was explicitly **deferred**, verbatim from S51:
> Wire bctc-analyst to scripts/notebook-compose.sh (system-auditor's 2026-08-14 fix) — deferred:
> requires a Bash grant, a tool-permission change outside agent-father's unilateral authority;
> flagged as a follow-up for PO/architect, not actioned here.

**That follow-up was never minted.** Probed 2026-08-26: absent from every live `task_board` lane by
id and by subject; absent from `docs/data/orch/archive/` by id; the only archive subject match is
`FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE` (DONE_VERIFIED), a different row.

## The measurement that is new

The doc-only remedy has now been **falsified on its own terms**. The inline reminder was added
2026-08-15 specifically to stop this. Eleven days later the drift recurred — in the very file whose
line 19 says "NOT 2", read by the agent during the cycle that then produced 2. Prose instruction
does not enforce a count for an agent with no deterministic actuator; S51 predicted exactly this and
scoped the doc fix as "the correctly-scoped remedy today" only because the real fix needed authority
it did not have.

## Scope is fleet-wide, not bctc-analyst

S51's own fleet spot-check: *"news-scout/agents-architect/digest-predict all show similarly noisy
section counts; system-auditor itself only got a deterministic actuator 2026-08-14"*. Any
manually-composing APPEND agent without a Bash grant is in this class.

## Decision needed (PO/architect — not the dispatcher's call)

1. Grant `bctc-analyst` (and the other manual-compose agents) a scoped Bash grant so
   `scripts/notebook-compose.sh` can be the actuator — the fix S51 identified and could not make.
2. Or accept the drift and change AC-2 to match reality — S51 explicitly rejected this
   (*"would codify the bug; disproven by 3-section cycles in git history"*), so it needs a fresh ruling.
3. Either way: mint a tracking row. The absence of one is why an 11-day-old confirmed root cause
   with a known fix is still recurring unowned.

Related, same agent, same cause: `project_bctc_analyst_no_bash_grant_perpetual_dirty_artifacts`
(this cycle also left 4 signal files + the notebook uncommitted for the same missing-grant reason).
