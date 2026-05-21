# TASK 1967a — BA Decomposition: Orchestration Bug-Hunt Scope

**Sprint:** 1967 | **Owner:** ba | **Zone:** `docs/` | **Priority:** HIGH | **Size:** 2h | **Created:** 2026-05-21T19:02:30Z (po c234)

## Context

User /goal directive 2026-05-21T19:02Z: "fix all bugs/conflicts in orchestration agent system" + "use the full standard sprint chain, do NOT skip BA".

PO has authored Sprint 1967 vision + scope in `docs/SPRINT_GOAL.md` (head section). BA must decompose that vision into atomic, testable requirements before architect runs the orchestration audit.

## Input

- `docs/SPRINT_GOAL.md` Sprint 1967 head section (Vision / Chain / Scope / Success Metric / Seed Evidence).
- 7 orchestration surfaces (numbered 1–7 in §Scope IN).
- 7 seed evidence rows (E-1..E-7 in §Seed Evidence).
- OBSERVE gates calendar (in §Constraints).

## Deliverable

`docs/REQ_1967.md` containing:

1. **Header** — sprint id, BA agent, created timestamp, link back to SPRINT_GOAL.md head.
2. **REQ-1967-1 through REQ-1967-7** — one requirement per surface 1–7, each with:
   - **Goal statement** (1 sentence, what "fixed" means for this surface).
   - **Check-list of testable items** mapping back to surface bullets in SPRINT_GOAL §Scope IN.
   - **Seed-evidence references** (E-1..E-7) that anchor each REQ's testability.
   - **Done-criteria** (concrete observable outcome for architect to enumerate against).
3. **Out-of-scope subsection** mirroring SPRINT_GOAL §Scope OUT verbatim (no new exclusions).
4. **Glossary / disambiguation** if terms like "race", "recursion", "dispatcher" need pinning down for architect.

## Done Criteria

- REQ doc exists at `docs/REQ_1967.md`.
- ≥7 requirements named REQ-1967-1..7 (one per surface).
- Each REQ has check-list items (≥2 per REQ).
- Out-of-scope subsection present.
- No architecture proposals (pure decomposition, not solutioning).
- Signal emitted: `docs/signals/ba-1967a-spec-ready.json` (caveman ultra payload, includes link to REQ_1967.md).
- Handoff back to PO for AC-1 approval gate. PO will emit `docs/signals/po-1967-ba-approved.json` once approved; that signal unblocks 1967b architect dispatch.

## Constraints

- **No architecture proposals.** BA's job is decomposition, NOT design. If a surface needs new structure, that goes into architect's brief (1967b), not REQ_1967.
- **No code touched.** BA produces a doc, nothing else.
- **Caveman ultra** for the spec-ready signal payload.
- **Inner self-claim:** task-lock acquire `task:1967a` kind=sprint-task ttl=7200s on entry; release on RETURN.
- **Time-box 2h.** If decomposition stalls on a surface, partial REQ with explicit "needs architect probe" annotation is acceptable.

## Chain Position

```
PO (kickoff)
  -> BA (THIS TASK 1967a)              <- you are here
     -> architect (1967b, GATED on po-1967-ba-approved.json)
        -> PM (1967c, GATED on architect brief landed)
           -> dev-team (1967-bug-NN slate, GATED on PM slate complete)
              -> qa (1967z sprint sign-off + po close)
```

## References

- `docs/SPRINT_GOAL.md` — Sprint 1967 head section (canonical scope SSOT).
- `docs/signals/po-1967-kickoff.json` — kickoff signal payload + nextPrompt.
- `.claude/flows/ba/main.md` — BA flow file.
- `.claude/skills/caveman/SKILL.md` — caveman ultra format for spec-ready signal.
- `.claude/skills/task-lock/SKILL.md` — inner self-claim discipline.
