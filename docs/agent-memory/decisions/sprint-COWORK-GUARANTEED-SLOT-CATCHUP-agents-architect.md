# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · agents-architect

**Sprint goal:** Make cowork `guaranteed:true` an honored contract (look-back/catch-up firing) — this entry's task is unrelated ambient P0 work picked up via Supervised-Lane Sweep; journal bucketed to the current active sprint_id per decision-journal SKILL.md § Resolve Sprint ID mechanics, not sprint-scoped work.
**Agent:** agents-architect
**Started:** 2026-07-31T04:29:55Z

---

### STEP agents-architect-S1 · agents-architect · 2026-07-31T04:29:55Z
**task-id:** FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY
**what-done:** Authored brief `docs/architecture-briefs/2026-07-31-cired-triage-failedfile-dedup.md` (exact replacement row text for `triage-signals.md` §ci_red + two doc-accuracy edits for `ci-health-probe.md`) and dropped `brief_complete` signal to agent-father (cc po, dev-team); executed AC-5 retro-sweep live via `gh run view` rather than trusting the prior pass's claim.
**what-considered:**
- Add FAILEDFILE-parsing logic to the probe script (`ci-health-probe.js`) so the signal payload carries files directly — rejected: duplicates the bash script's own log-format parsing in a second language, drifts easily, and `payload.run_id` already lets PO do a live, freshest-possible read at triage time.
- Collapse multi-file ci_red into one FIX row per signal — rejected: contradicts already-validated production practice (two sibling rows minted from one signal on `FIX-CI-FRONTEND-ESLINT-BUNLOCK-DUAL-LOCKFILE-DRIFT` / `FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER`).
- Chosen: PO-side live `gh run view --log-failed` read (matches AC-1's literal command) + FILE-scoped `dedup_key: ci_job:<job>|file:<file>` primary key, formalizing a pattern PO had already hand-executed twice successfully before this row shipped.
**why-decision:** Field evidence (2 independently-minted rows + 1 confirmed dedup hit, all pre-dating this row) already proves the PO-side-only design works end-to-end with zero probe changes; adding probe logic would be unvalidated scope creep on a P0/S plan-only row.
**why-change:** No change from row's own AC-1..AC-4 — implementation detail only (probe untouched vs. task text not mandating that either way).

### STEP agents-architect-S2 · agents-architect · 2026-08-07T02:10:19Z
**task-id:** FIX-CHEF-MIDFLOW-BAIL-DETERMINISM
**what-done:** Authored plan-only spec `docs/architecture-briefs/2026-08-07-chef-midflow-bail-determinism-guard.md` — two-layer determinism guard (Layer 1: chef-telemetry.md Degraded-Floor Recovery + widened floor trigger + per-step checkpoints; Layer 2: system-auditor orphan sweep, FOLLOW-UP-2). Dropped signal, did NOT touch orch-state.json myself.
**what-considered:**
- Fix only the named "scope clarification" branch (matches occurrences 1-2 literally) — rejected: 2026-07-29 corroboration proves the trigger generalizes to any budget-exhaustion point; row's own AC explicitly demands widening.
- Rely on stronger prose alone ("no third path" rule, reworded) — rejected: that exact rule already exists verbatim in chef.md Step 1 and was already violated 3x, including by an agent that would have read it; prose-only is empirically falsified for this defect class.
- Personally flip the board row status via orch-apply.sh (per generic dispatch-prompt boilerplate) — rejected: agents-architect's own commit-boundary zone table + init.md forbidden_outputs give zero orch-state.json write authority; grep of prior agents-architect commits confirms this was never done historically. Routed the requested lane-move through the standard brief_complete signal instead (same pattern every prior brief used).
**why-decision:** Root-cause evidence (§1.4 of the brief) shows the agent skips even already-shipped, precisely-named catch machinery — a guarantee requires an actor outside the bailing agent's own next action, hence the Layer 1/Layer 2 split.
**why-change:** Terminal status is REVIEW (spec-ready for sign-off), not DONE — task's own instruction; implementation explicitly deferred as FOLLOW-UP-1/2, not shipped here (plan-only AC).
